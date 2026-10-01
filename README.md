# data-visualization-student-starter

Starter repository for student assignments for the data visualization course [Constructing Visualizations](https://github.com/curran/constructing-visualizations).

How to use, for the first assignment:

- Fork this repository
- Modify the content of `src/assignments/week-01` as the first assignment
- Deploy your project using GitHub Pages (you may need to change `base` in `vite.config.ts`, depending on your repository name)
- Submit the link to your repo and hosted site

How to use, for subsequent assignments:

- Add a new directory `src/assignments`, potentially by copying a previous assignment as a starter, or copying files in from `src/examples` in [constructing-visualizations](https://github.com/curran/constructing-visualizations)
- Update the index at `src/assignments/index.ts` to add the new listing
- Redeploy to GitHub pages
- Submit the link to your hosted assignment in GitHub pages

## Assignments in this repo

| Week   | Entry                     | Notes                                                      |
| ------ | ------------------------- | ---------------------------------------------------------- |
| Week 1 | `src/assignments/week-01` | Six points redrawn as a constellation                      |
| Week 2 | `src/assignments/week-02` | Loads and summarises a real dataset in the browser         |
| Week 3 | `src/assignments/week-03` | Bubble scatter of age against family size                  |
| Week 4 | `src/assignments/week-04` | The Week 3 chart rebuilt for legibility, with d3-axis axes |
| Week 5 | `src/assignments/week-05` | The Week 4 chart with an interactive colour legend         |
| Week 6 | `src/assignments/week-06` | Project V1: when the subway hands New York to the cars     |

Week 2 reads `public/data/online-food-orders/online-food-orders.csv` at runtime and reports
row/column counts, per-attribute type and distribution, and data-quality notes. The dataset is
documented in [`public/data/online-food-orders/README.md`](public/data/online-food-orders/README.md),
including its source and an attribute-by-attribute type analysis.

Week 4 revisits the Week 3 chart with legibility as the goal. The title, subtitle, axis
labels, size key, and source credit all moved inside the SVG, so the chart explains
itself as an image rather than relying on the surrounding page. The axes are real
`d3-axis` axes, and the chart is split into `useScales` / `renderAxes` / `renderMarks` /
`renderSizeLegend` modules following this week's reference example.

Two changes came out of peer feedback on Week 3, which asked why only the largest
circles were labelled. Every circle now carries its own count whenever the label
geometrically fits inside it - 70 of 70 at full width, instead of 2 - and the mark fill
moved one step darker on the blue ramp (`#2a78d6` to `#256abf`) so that white numerals
clear the 4.5:1 WCAG AA contrast floor.

## Week 5 — a new interaction

Week 5 adds an interactive colour legend to the Week 4 chart. Pointing at a marital
status previews it and the circles retarget immediately; clicking keeps it, and clicking
it again returns to everyone. The whole attribute can be read by sweeping along the
legend without having to click back out of each state.

Three things made it work rather than just move:

- **The total stays on screen.** Filtering normally destroys what you are comparing
  against, so each cell keeps a grey outline at its full count and draws the selected
  group inside it. Share becomes two concentric areas rather than a memory test.
- **The scales never move.** Positions and circle areas are built from every cell, not
  from the selection, so nine respondents draw at the size nine respondents draw at in
  every state of the chart.
- **The label ink is measured, not chosen.** Each series picks white or near-black by
  WCAG contrast ratio, so the count inside a circle clears 4.5:1 on whatever fill the
  legend has just given it.

The legend lives inside the SVG, which keeps Week 4's promise that the chart explains
itself as an image but costs the platform behaviour that HTML buttons get free: the
chips carry their own `tabindex`, `role`, and `aria-pressed`, and the focus ring is a
CSS rule rather than an attribute, because a redraw would wipe an attribute in the same
frame that focus set it.

## Week 6 — project V1: the handoff

The first rough version of the final project's core thread: **when does the subway stop
carrying a neighbourhood, and the taxi and for-hire fleets take over?**

`src/assignments/week-06` draws one taxi zone's 24-hour composition as a 100% stacked
area, with the subway against the baseline so the hour its band crosses the half line is
the handoff itself. The grid below orders the busiest zones that hand over by when they
do it, and doubles as the picker.

### The data

`scripts/build-rhythm-cube.sh` builds `public/data/nyc-rhythm/` from the live sources:

| Source                                                                               | What it contributes                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| [MTA hourly subway ridership](https://data.ny.gov/d/5wq4-mkjj)                       | Turnstile entries per station complex per hour          |
| [NYC TLC trip records](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page) | Yellow, green, and high-volume for-hire pickups by zone |
| [TLC taxi zone shapefile](https://d37ci6vzurychx.cloudfront.net/misc/taxi_zones.zip) | The 263 polygons everything is joined onto              |

It reads about 25 million trip records and a month of hourly ridership and writes
**365 KB** — 12,624 rows of `(zone, day type, hour)` with a count per mode. The browser
never sees anything bigger, which is the architecture the project document committed to.
Subway coordinates are put into zones with a real point-in-polygon join rather than a
hand-written crosswalk; all 428 complexes land in exactly one zone, and 153 of the 263
zones contain at least one.

Run it with `scripts/build-rhythm-cube.sh 2025-06` (requires `duckdb`). Raw downloads
are cached in a gitignored `.cache/`, so a second run only redoes the join.

### What the V1 found

- **The handoff is real, and it sorts neighbourhoods.** Of the 173 zones with at least
  2,000 trips on a typical weekday, 111 hand over at some point in the night. Residential
  outer-borough zones go first, mostly between 21:00 and midnight; the Manhattan core
  holds much later — Times Square until 02:24.
- **The busiest zones mostly never hand over at all.** 38 zones keep the subway above
  half in every hour of the day. They are the big interchanges, and they are exactly the
  zones a volume-ranked list puts first, which is why the grid shows the busiest zones
  _that hand over_ and reports the rest as a count.
- **Weekends loosen the subway's grip.** 127 zones hand over instead of 111, and only 16
  hold all day instead of 38. The morning handback slides later — East Village returns to
  the subway at 04:59 on a weekday and 05:55 on a weekend.

### What it does not yet say

- **People are being compared with vehicles.** The subway number is turnstile entries;
  the taxi and for-hire numbers are trips, each carrying one or more riders. The half
  line is therefore not a headcount, and the handoff times are sound relative to each
  other but not as absolutes. This is stated on the chart, not in a footnote.
- **Zone geometry is doing some of the work.** Midtown Center is the single
  highest-volume taxi zone in the city but holds only one small station complex, because
  the big ones sit over its borders in the Garment District and Midtown East — so it
  reads as handing over at 18:55 for reasons that are cartographic rather than
  behavioural. The project document predicted this failure; the V1 confirms it and shows
  each zone's complex count so a reader can spot it.
- **Two modes are missing.** Bus and Citi Bike are deferred, not forgotten: a line or
  band chart puts every series beside every other one, and the validated palette holds
  three slots to that standard. A fourth hue would put two confusable colours on the axes
  the chart exists to read a crossing off.
