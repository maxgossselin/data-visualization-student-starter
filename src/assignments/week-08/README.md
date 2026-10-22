# Week 8: project V2, the handoff map

Week 6 built the core thread of the final project for one zone at a time: the hour the subway
stops carrying a neighbourhood and the taxi and for-hire fleets take over. It ended with two
problems written down as unresolved, and a rule: **fix the catchment before drawing any map**,
because a choropleth would turn the catchment artifact into geography and make it look like a
finding.

This week does that, then draws the map.

## What's new

| Area        | Week 6                                                           | Week 8                                                                                                         |
| ----------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Subway join | Each station counts entirely in the zone its coordinate falls in | Each station's riders are spread over a ¼- or ½-mile walk circle, by how much of the circle each zone covers   |
| Units       | Subway people vs. car trips (vehicles)                           | An occupancy setting converts trips to people, opening at the measured 1.31 passengers per yellow-cab trip     |
| Form        | One zone's 24-hour stacked area, plus a grid of small multiples  | A choropleth of every zone, linked to the Week 6 chart for whichever zone is clicked                           |
| Assumptions | Fixed, and stated in a caveat                                    | Settings the reader can change, with a "Week 6's reading" button and a list of the zones each change moves     |
| Uncertainty | None shown                                                       | Each zone's answer under all six settings combined, and a toggle that fades zones whose answer depends on them |

**New techniques this week:** a d3-geo choropleth (`geoIdentity` + `geoPath`), spatial
apportionment in DuckDB (`ST_Buffer` / `ST_Intersection` / `ST_Area`), a binned ordinal colour
scale validated with the course palette checker, and a sensitivity analysis surfaced in the UI
rather than in a footnote.

## Findings

All figures are for June 2025, over the 173 zones with at least 2,000 trips on a typical weekday.

- **The catchment was the bigger flaw, and Week 6 had flagged it.** Changing occupancy moves
  every zone's handoff about 40 minutes earlier but barely reorders them (rank correlation
  ρ = 0.97 against Week 6). Changing the catchment reorders them substantially (ρ ≈ 0.62).
  - Midtown Center, Week 6's named example, goes from 18:55 to 00:39.
  - Murray Hill, SoHo, and both Turtle Bay zones were "cars all day" in Week 6 only because no
    station coordinate fell inside them. They now hand over between 00:13 and 02:24.
- **Week 6's 38 "interchange" zones were mostly a units artifact.** Counted in people rather
  than vehicles, and by walk, the zones where the subway leads every hour fall from 38 to 18.
  - In 51 zones the subway's overnight lead is so thin that the settings decide whether it
    hands over at all.
- **Whether a zone hands over is robust; the exact clock time is not.** 104 of 173 zones give
  the same kind of answer under all six settings (132 at weekends). Their handoff time spans a
  median of 1.7 hours across the settings, so the map's one-hour bins carry more precision than
  a single setting can defend. The detail panel therefore reports a range.
- **The city-level answer holds.** The median handoff stays between 22:58 and 23:29 on weekdays
  under all six settings. Manhattan's median handoff is around 00:35; the Bronx, Brooklyn and
  Queens are around 22:00–23:00.

## The data pipeline

`scripts/build-rhythm-cube.sh` gained three steps. The Week 6 columns of `mode-share.csv` are
byte-for-byte unchanged, so Week 6 still renders exactly as it did.

| Output                         | What it is                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `mode-share.csv` (new columns) | `subway_quarter`, `subway_half`: riders apportioned by walk circle. Every complex's weights sum to 1 |
| `occupancy.csv`                | Mean passengers on yellow and green trips that report a count, read from the TLC Parquet             |
| `zones.geojson`                | Zone outlines simplified to 80 ft, in NY State Plane feet (EPSG:2263), 182 KB                        |

The outlines stay in State Plane feet rather than being reprojected to longitude and latitude.
State Plane is the projection the city's own maps use, so the browser only has to scale and flip
it (`geoIdentity().reflectY(true)`). Being planar, it also sidesteps d3-geo's spherical
ring-winding rule.

## Files

| File                   | What it does                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `useHandoffMapData.ts` | Loads the cube, outlines, and occupancy, keeping raw counts rather than shares          |
| `assumptions.ts`       | The two settings, the people-not-vehicles conversion, map classes, and spreads          |
| `HandoffMap.tsx`       | The choropleth: d3-geo paths, hover and selection outlines, and legend/stability fading |
| `HandoffMapPlot.tsx`   | The page: controls, legend, tooltip, zone lookup, linked Week 6 chart, "what moved"     |

The detail chart is Week 6's `HandoffChart`, reused unchanged. It now draws people rather than
trips because it is handed different hours.

## Colour

Handoff time is ordered, so it uses one hue, light to dark: the later the subway gives the zone
up, the darker. "Never: subway all day" is the dark end of the same scale (later than any hour).
"Never: cars all day" uses the taxi orange from Week 6, not the lightest blue, which would read
as "early handoff".

The five blues are steps 250/400/500/600/700 of the validated sequential ramp. They pass the
ordinal checks (`validate_palette.js --ordinal`): monotone lightness, adjacent ΔL ≥ 0.06, and a
light end at 2.06:1. Six blue steps would not fit, which is why there are four time bins rather
than five.

## Known gaps

- **The walk circle is a crude catchment.** It assumes riders come evenly from every direction,
  which a river or a highway makes untrue. A network walkshed along streets would be better.
- **Occupancy is measured only for yellow cabs.** It covers only the 71% of trips that record a
  passenger count. Uber and Lyft publish no passenger count, so they borrow the yellow-cab
  figure.
- **Bus and Citi Bike are still out.** The map has one colour per zone, so adding modes would
  change the definition of "hands over", not the palette. That decision is still open.
- **Too-quiet zones are greyed out.** The 2,000-trip floor is Week 6's, kept so the set of zones
  on the map doesn't move when the settings do.

## Sources

| Source                                                                                      | Used for                                                                          |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [MTA Subway Hourly Ridership, 2025+](https://data.ny.gov/d/5wq4-mkjj)                       | Turnstile entries per station complex per hour, and their coordinates             |
| [NYC TLC Trip Record Data](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page)    | Yellow, green and high-volume for-hire pickups; yellow and green passenger counts |
| [TLC taxi zone shapefile](https://d37ci6vzurychx.cloudfront.net/misc/taxi_zones.zip)        | The 263 zone polygons                                                             |
| [d3-geo](https://d3js.org/d3-geo)                                                           | `geoIdentity`, `geoPath`                                                          |
| [DuckDB spatial extension](https://duckdb.org/docs/stable/core_extensions/spatial/overview) | Point-in-polygon, buffers, intersections, GeoJSON export                          |
