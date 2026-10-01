#!/usr/bin/env bash
#
# Builds the Week 6 cube: public/data/nyc-rhythm/{mode-share.csv,zones.csv}
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
         round(coalesce(sum(t.trips) FILTER (WHERE t.mode = 'fhv'), 0) / dc.days, 1) AS fhv
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
         round(coalesce(sum(t.trips) FILTER (WHERE t.daytype = 'weekday'), 0)
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
SQL

echo "Wrote:"
wc -c "$OUT/mode-share.csv" "$OUT/zones.csv"
