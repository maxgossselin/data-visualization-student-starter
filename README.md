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

| Week   | Entry                     | Notes                                              |
| ------ | ------------------------- | -------------------------------------------------- |
| Week 1 | `src/assignments/week-01` | Six points redrawn as a constellation              |
| Week 2 | `src/assignments/week-02` | Loads and summarises a real dataset in the browser |

Week 2 reads `public/data/online-food-orders/online-food-orders.csv` at runtime and reports
row/column counts, per-attribute type and distribution, and data-quality notes. The dataset is
documented in [`public/data/online-food-orders/README.md`](public/data/online-food-orders/README.md),
including its source and an attribute-by-attribute type analysis.
