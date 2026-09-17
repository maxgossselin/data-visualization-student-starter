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
