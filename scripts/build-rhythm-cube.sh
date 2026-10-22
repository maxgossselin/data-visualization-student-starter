#!/usr/bin/env bash
#
# Builds the rhythm cube: public/data/nyc-rhythm/
#   mode-share.csv   (zone, day type, hour) -> counts per mode           [Week 6]
#   zones.csv        zone names, boroughs, complex counts                [Week 6]
#   zones.geojson    simplified zone outlines for the map                [Week 8]
#   occupancy.csv    measured passengers per taxi trip                   [Week 8]
#
# The final-project document argues that the whole project collapses onto a single
# (taxi zone, hour) key, and that the expensive work belongs offline so the browser
# only ever receives a small aggregate cube. This script is that offline step.
#
# It reads ~25M trip records and a month of hourly subway ridership straight from the
# public sources, aggregates them server-side or with DuckDB's column pruning, and
# writes roughly 400 KB of CSV. Nothing large is ever stored in the repository.
#
# Requirements: duckdb (brew install duckdb), curl, python3.
# Usage: scripts/build-rhythm-cube.sh [YYYY-MM]   (default 2025-06)
set -euo pipefail

# Walksheds for the subway catchment, in feet (the zone file is in NY State Plane
# feet). A quarter mile is the planning convention for a bus stop, half a mile for a
# rail station; the cube carries both so the map can show how much the choice matters.
WALK_QUARTER_FT=1320
WALK_HALF_FT=2640

MONTH="${1:-2025-06}"
MONTH_START="${MONTH}-01"
MONTH_END=$(python3 -c "
import datetime as d
y, m = map(int, '${MONTH}'.split('-'))
print(d.date(y + (m == 12), m % 12 + 1, 1))
")

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$ROOT/.cache/rhythm"
OUT="$ROOT/public/data/nyc-rhythm"
mkdir -p "$CACHE" "$OUT"

TLC=https://d37ci6vzurychx.cloudfront.net
MTA=https://data.ny.gov/resource/5wq4-mkjj.csv

echo "Building the rhythm cube for $MONTH ($MONTH_START to $MONTH_END)"

# ---------------------------------------------------------------------------
# 1. Taxi zones. 263 polygons in NY State Plane feet; the shapefile is the only
#    geometry the project needs, and it is 1 MB.
# ---------------------------------------------------------------------------
if [ ! -f "$CACHE/taxi_zones/taxi_zones.shp" ]; then
  echo "  fetching taxi zone shapefile"
  curl -sS --max-time 120 -o "$CACHE/taxi_zones.zip" "$TLC/misc/taxi_zones.zip"
  unzip -oq "$CACHE/taxi_zones.zip" -d "$CACHE"
fi

# ---------------------------------------------------------------------------
# 2. Subway station complexes and their coordinates.
# ---------------------------------------------------------------------------
if [ ! -f "$CACHE/subway_complexes.csv" ]; then
  echo "  fetching subway station complexes"
  curl -sS --max-time 180 -G "$MTA" \
    --data-urlencode '$select=station_complex_id, max(station_complex) AS station_complex, max(latitude) AS lat, max(longitude) AS lon' \
    --data-urlencode "\$where=transit_timestamp >= '${MONTH_START}T00:00:00' AND transit_timestamp < '${MONTH_END}T00:00:00'" \
    --data-urlencode '$group=station_complex_id' \
    --data-urlencode '$limit=2000' \
    -o "$CACHE/subway_complexes.csv"
fi

# ---------------------------------------------------------------------------
# 3. Hourly subway ridership, aggregated by Socrata rather than downloaded.
#
#    `ridership` is fare transactions at the turnstile; `transfers` is people
#    already inside the system, so adding it would count the same rider twice.
# ---------------------------------------------------------------------------
#
#    A month in one request times out: the group-by runs over ~45M rows and Socrata
#    gives up first. Weekly windows each return in seconds, and because the windows
#    partition the month by timestamp the counts add up without overlap.
if [ ! -f "$CACHE/subway_hourly.csv" ]; then
  echo "  fetching hourly subway ridership in weekly windows"
  rm -f "$CACHE"/subway_week_*.csv

  fetch_subway_week () {
    curl -sS --max-time 600 -G "$MTA" \
      --data-urlencode '$select=station_complex_id, date_extract_hh(transit_timestamp) AS hour, date_extract_dow(transit_timestamp) AS dow, sum(ridership) AS riders' \
      --data-urlencode "\$where=transit_timestamp >= '${1}T00:00:00' AND transit_timestamp < '${2}T00:00:00'" \
      --data-urlencode '$group=station_complex_id, hour, dow' \
      --data-urlencode '$limit=200000' \
      -o "$CACHE/subway_week_${1}.csv"
  }

  WEEK="$MONTH_START"
  while [[ "$WEEK" < "$MONTH_END" ]]; do
    NEXT=$(python3 -c "
import datetime as d
print(min(d.date.fromisoformat('$WEEK') + d.timedelta(days=7), d.date.fromisoformat('$MONTH_END')))
")
    fetch_subway_week "$WEEK" "$NEXT" &
    WEEK="$NEXT"
  done
  wait

  # One header, then every window's rows.
  head -1 "$CACHE"/subway_week_*.csv | head -1 > "$CACHE/subway_hourly.csv"
  for f in "$CACHE"/subway_week_*.csv; do tail -n +2 "$f" >> "$CACHE/subway_hourly.csv"; done
fi

# ---------------------------------------------------------------------------
# 4. Street-hail taxi and high-volume for-hire pickups.
#
#    Read straight from the remote Parquet. Only two columns are ever touched, so
#    DuckDB pulls a few tens of megabytes out of a ~600 MB month rather than all
#    of it.
# ---------------------------------------------------------------------------
if [ ! -f "$CACHE/tlc_hourly.csv" ]; then
  echo "  aggregating taxi and for-hire pickups from remote Parquet"
  duckdb <<SQL
INSTALL httpfs; LOAD httpfs;
SET preserve_insertion_order = false;
COPY (
  WITH base AS (
    SELECT 'taxi' AS mode, PULocationID AS zone_id, tpep_pickup_datetime AS ts
      FROM read_parquet('$TLC/trip-data/yellow_tripdata_${MONTH}.parquet')
    UNION ALL
    SELECT 'taxi', PULocationID, lpep_pickup_datetime
      FROM read_parquet('$TLC/trip-data/green_tripdata_${MONTH}.parquet')
    UNION ALL
    SELECT 'fhv', PULocationID, pickup_datetime
      FROM read_parquet('$TLC/trip-data/fhvhv_tripdata_${MONTH}.parquet')
  )
  SELECT mode, zone_id, hour(ts) AS hour, dayofweek(ts) AS dow, count(*) AS trips
  FROM base
  WHERE ts >= DATE '$MONTH_START' AND ts < DATE '$MONTH_END'
  GROUP BY 1, 2, 3, 4
) TO '$CACHE/tlc_hourly.csv' (FORMAT CSV, HEADER);
SQL
fi

# ---------------------------------------------------------------------------
# 4b. How many people a taxi trip carries.
#
#    Week 6 compared turnstile entries (people) with trips (vehicles). The fix is an
#    occupancy factor, and the one fleet that records passengers is the yellow and
#    green taxi. Only trips that report a count are averaged - about 70% of yellow
#    trips do - and a zero is treated as unreported rather than as an empty cab.
#    Uber and Lyft publish no passenger count at all; the map borrows the taxi
#    figure for them and says so.
# ---------------------------------------------------------------------------
if [ ! -f "$CACHE/occupancy.csv" ]; then
  echo "  measuring taxi occupancy"
  duckdb <<SQL
INSTALL httpfs; LOAD httpfs;
COPY (
  WITH base AS (
    SELECT 'yellow' AS fleet, passenger_count
      FROM read_parquet('$TLC/trip-data/yellow_tripdata_${MONTH}.parquet')
    UNION ALL
    SELECT 'green', passenger_count
      FROM read_parquet('$TLC/trip-data/green_tripdata_${MONTH}.parquet')
  )
  SELECT fleet,
         count(*) AS trips,
         count(*) FILTER (WHERE passenger_count > 0) AS trips_with_count,
         round(avg(passenger_count) FILTER (WHERE passenger_count > 0), 3) AS mean_passengers
  FROM base GROUP BY 1 ORDER BY 1 DESC
) TO '$CACHE/occupancy.csv' (FORMAT CSV, HEADER);
SQL
fi
cp "$CACHE/occupancy.csv" "$OUT/occupancy.csv"

# ---------------------------------------------------------------------------
# 5. The join, and the cube.
#
#    Day types are Monday-Thursday and Saturday-Sunday. Friday is dropped rather
#    than averaged into either: it has a weekday morning and a weekend night, and
#    including it would smear the one crossover the chart is about.
#
#    Counts are averaged per day of that type, so a weekday number is "on a typical
#    weekday", not "summed over 17 days".
# ---------------------------------------------------------------------------
echo "  joining and writing the cube"
duckdb <<SQL
LOAD spatial;

CREATE TABLE zones AS
  SELECT LocationID AS zone_id, zone, borough,
         ST_Transform(geom, 'EPSG:2263', 'EPSG:4326', always_xy := true) AS geom
  FROM ST_Read('$CACHE/taxi_zones/taxi_zones.shp');

-- Point in polygon. Every complex in the file lands in exactly one zone.
CREATE TABLE complex_zone AS
  SELECT c.station_complex_id, c.station_complex,
         (SELECT z.zone_id FROM zones z WHERE ST_Within(ST_Point(c.lon, c.lat), z.geom) LIMIT 1) AS zone_id
  FROM read_csv('$CACHE/subway_complexes.csv') c;

-- Walk catchments (Week 8). Point in polygon credits a station to whichever zone its
-- coordinate happens to fall in, so a zone whose stations sit just over its border -
-- Midtown Center is the named case - reads as having no subway. Instead, each
-- complex's riders are spread over a walk circle around it, in proportion to how much
-- of the circle's land each zone covers. Water and New Jersey are in no zone, so the
-- weights are normalised over the part of the circle that is in one, and every
-- complex's riders are still counted exactly once.
--
-- The assumption is that riders come evenly from the whole circle. That is wrong in
-- detail and right in the way that matters: it stops a zone border a few metres from
-- an entrance deciding which neighbourhood a station belongs to.
CREATE TABLE zones_ft AS
  SELECT LocationID AS zone_id, geom FROM ST_Read('$CACHE/taxi_zones/taxi_zones.shp');

CREATE TABLE complex_walk AS
  WITH points AS (
    SELECT station_complex_id,
           ST_Transform(ST_Point(lon, lat), 'EPSG:4326', 'EPSG:2263', always_xy := true) AS pt
    FROM read_csv('$CACHE/subway_complexes.csv')
  ),
  circles AS (
    SELECT station_complex_id, 'quarter' AS walk, ST_Buffer(pt, $WALK_QUARTER_FT) AS g FROM points
    UNION ALL
    SELECT station_complex_id, 'half', ST_Buffer(pt, $WALK_HALF_FT) FROM points
  ),
  pieces AS (
    SELECT c.station_complex_id, c.walk, z.zone_id,
           ST_Area(ST_Intersection(c.g, z.geom)) AS area
    FROM circles c JOIN zones_ft z ON ST_Intersects(c.g, z.geom)
  )
  SELECT station_complex_id, walk, zone_id,
         area / sum(area) OVER (PARTITION BY station_complex_id, walk) AS weight
  FROM pieces;

CREATE TABLE day_counts AS
  SELECT daytype, count(*) AS days FROM (
    SELECT CASE WHEN dayofweek(d) BETWEEN 1 AND 4 THEN 'weekday'
                WHEN dayofweek(d) IN (0, 6) THEN 'weekend' END AS daytype
    FROM (SELECT unnest(generate_series(DATE '$MONTH_START',
                                        DATE '$MONTH_END' - INTERVAL 1 DAY,
                                        INTERVAL 1 DAY))::DATE AS d)
  ) WHERE daytype IS NOT NULL GROUP BY 1;

CREATE TABLE daytype_trips AS
  WITH labelled AS (
    SELECT mode, zone_id, hour,
           CASE WHEN dow BETWEEN 1 AND 4 THEN 'weekday'
                WHEN dow IN (0, 6) THEN 'weekend' END AS daytype,
           trips
    FROM read_csv('$CACHE/tlc_hourly.csv')
    UNION ALL
    SELECT 'subway', cz.zone_id, s.hour,
           CASE WHEN s.dow BETWEEN 1 AND 4 THEN 'weekday'
                WHEN s.dow IN (0, 6) THEN 'weekend' END,
           s.riders
    FROM read_csv('$CACHE/subway_hourly.csv') s
    JOIN complex_zone cz USING (station_complex_id)
    UNION ALL
    SELECT 'subway_' || cw.walk, cw.zone_id, s.hour,
           CASE WHEN s.dow BETWEEN 1 AND 4 THEN 'weekday'
                WHEN s.dow IN (0, 6) THEN 'weekend' END,
           s.riders * cw.weight
    FROM read_csv('$CACHE/subway_hourly.csv') s
    JOIN complex_walk cw USING (station_complex_id)
  )
  SELECT mode, zone_id, daytype, hour, sum(trips) AS trips
  FROM labelled WHERE daytype IS NOT NULL AND zone_id IS NOT NULL
  GROUP BY 1, 2, 3, 4;

-- Every zone gets all 24 hours of both day types, so a gap in the data is an
-- explicit zero rather than a missing row the chart would silently interpolate over.
CREATE TABLE grid AS
  SELECT z.zone_id, d.daytype, h.hour
  FROM zones z
  CROSS JOIN (SELECT DISTINCT daytype FROM day_counts) d
  CROSS JOIN (SELECT unnest(generate_series(0, 23)) AS hour) h;

COPY (
  SELECT g.zone_id, g.daytype, g.hour,
         round(coalesce(sum(t.trips) FILTER (WHERE t.mode = 'subway'), 0) / dc.days, 1) AS subway,
         round(coalesce(sum(t.trips) FILTER (WHERE t.mode = 'taxi'), 0) / dc.days, 1) AS taxi,
         round(coalesce(sum(t.trips) FILTER (WHERE t.mode = 'fhv'), 0) / dc.days, 1) AS fhv,
         round(coalesce(sum(t.trips) FILTER (WHERE t.mode = 'subway_quarter'), 0) / dc.days, 1) AS subway_quarter,
         round(coalesce(sum(t.trips) FILTER (WHERE t.mode = 'subway_half'), 0) / dc.days, 1) AS subway_half
  FROM grid g
  JOIN day_counts dc USING (daytype)
  LEFT JOIN daytype_trips t
    ON t.zone_id = g.zone_id AND t.daytype = g.daytype AND t.hour = g.hour
  GROUP BY g.zone_id, g.daytype, g.hour, dc.days
  ORDER BY g.zone_id, g.daytype, g.hour
) TO '$OUT/mode-share.csv' (FORMAT CSV, HEADER);

COPY (
  SELECT z.zone_id, z.zone, z.borough,
         coalesce(cx.complexes, 0) AS subway_complexes,
         round(coalesce(sum(t.trips) FILTER (WHERE t.daytype = 'weekday'
                                             AND t.mode IN ('subway', 'taxi', 'fhv')), 0)
               / (SELECT days FROM day_counts WHERE daytype = 'weekday'), 0) AS weekday_trips
  FROM zones z
  LEFT JOIN daytype_trips t ON t.zone_id = z.zone_id
  LEFT JOIN (SELECT zone_id, count(*) AS complexes FROM complex_zone GROUP BY 1) cx
    ON cx.zone_id = z.zone_id
  GROUP BY z.zone_id, z.zone, z.borough, cx.complexes
  ORDER BY z.zone_id
) TO '$OUT/zones.csv' (FORMAT CSV, HEADER);

-- Printed so the run leaves a record of how well the join actually did.
SELECT count(*) AS complexes,
       count(*) FILTER (WHERE zone_id IS NOT NULL) AS matched,
       count(DISTINCT zone_id) AS zones_with_subway
FROM complex_zone;

SELECT walk, count(DISTINCT station_complex_id) AS complexes,
       count(DISTINCT zone_id) AS zones_reached,
       round(sum(weight), 1) AS riders_conserved_per_complex_sum
FROM complex_walk GROUP BY 1 ORDER BY 1;
SQL

# ---------------------------------------------------------------------------
# 6. Zone outlines for the map (Week 8).
#
#    Kept in NY State Plane feet rather than reprojected to longitude and latitude:
#    the browser draws them with a planar identity projection, which is the same
#    conformal projection the city's own maps use, and integer feet are smaller than
#    five-decimal degrees. Newark Airport is left out - it is not in New York, has no
#    subway, and would stretch the map's extent across the Hudson for one polygon.
#    Simplified to 80 ft, well under a pixel at any size the map is drawn.
# ---------------------------------------------------------------------------
echo "  writing zone outlines"
rm -f "$CACHE/zones.geojson"
duckdb <<SQL
LOAD spatial;
COPY (
  SELECT LocationID AS zone_id, ST_SimplifyPreserveTopology(geom, 80) AS geom
  FROM ST_Read('$CACHE/taxi_zones/taxi_zones.shp')
  WHERE borough <> 'EWR'
) TO '$CACHE/zones.geojson'
  WITH (FORMAT GDAL, DRIVER 'GeoJSON', LAYER_CREATION_OPTIONS 'COORDINATE_PRECISION=0');
SQL
python3 -I -c "
import json, sys
data = json.load(open(sys.argv[1]))
for feature in data['features']:
    def walk(c): return [walk(x) for x in c] if isinstance(c[0], list) else [int(round(v)) for v in c]
    feature['geometry']['coordinates'] = walk(feature['geometry']['coordinates'])
data.pop('name', None); data.pop('crs', None)
json.dump(data, open(sys.argv[2], 'w'), separators=(',', ':'))
" "$CACHE/zones.geojson" "$OUT/zones.geojson"

echo "Wrote:"
wc -c "$OUT/mode-share.csv" "$OUT/zones.csv" "$OUT/zones.geojson" "$OUT/occupancy.csv"
