# Week 7: recreating a reference

A React and D3 rebuild of **visualization #42, the sorted stream graph**, from Ferdio's
[_1 dataset. 100 visualizations._](https://100.datavizproject.com/). That project draws one
six-number dataset (UNESCO World Heritage sites in Denmark, Norway and Sweden, in 2004 and 2022) a hundred different ways. It was the site I picked for the "Share Inspiration Dataviz"
participation assignment.

![Ferdio's original, visualization #42](https://100.datavizproject.com/wp-content/uploads/viz/viz-42.png)

_Above: Ferdio's original, loaded from their site._

## Sources

| What                                    | Link                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| The project, by Ferdio                  | [100.datavizproject.com](https://100.datavizproject.com/)                                  |
| Visualization #42 (the reference)       | [100.datavizproject.com/data-type/viz42/](https://100.datavizproject.com/data-type/viz42/) |
| The reference image, full size          | [viz-42.png](https://100.datavizproject.com/wp-content/uploads/viz/viz-42.png)             |
| About the project and its dataset       | [100.datavizproject.com/about/](https://100.datavizproject.com/about/)                     |
| Ferdio, the studio that made it         | [ferdio.com](https://ferdio.com/)                                                          |
| The parent catalogue of chart types     | [datavizproject.com](https://datavizproject.com/)                                          |
| Underlying data: UNESCO's heritage list | [whc.unesco.org/en/list/](https://whc.unesco.org/en/list/)                                 |
| `curveBumpX`, the curve used for bands  | [d3-shape: curves](https://d3js.org/d3-shape/curve#curveBumpX)                             |

## How it was rebuilt

The project is **closed source**. Each chart is published as a flat PNG with a paragraph
of description, and there is no code or SVG to port. So instead of migrating source
code, I reverse-engineered the image:

1. **Picked a chart.** I downloaded all 100 thumbnails into a contact sheet and chose
   #42 because it uses the most D3: an area generator with a curve, plus a sort that
   changes the geometry.
2. **Measured the PNG.** A short script decoded the PNG's palette and read pixel runs
   down columns of the image. That produced the exact fills (`#3274d8`, `#283250`,
   `#ee5440`, text `#7a8092`) and the band edges at each year rule. From those
   measurements the layout rules were clear:
   - each year's column is stacked largest first, so sorting happens **per year**;
   - the stack is **centred** on the rule (a streamgraph's silhouette offset), not
     sitting on a baseline;
   - both years use one linear scale (15.4 px per site), with an 18 px gap between
     bands;
   - the taller stack fills about 81.5% of the rule;
   - band edges are S-curves with flat ends, which matches `curveBumpX` between two
     points to within about 4 px across the whole width.
3. **Rebuilt it.** The positions in the component are the reference's pixel positions
   with the surrounding whitespace cropped off. Overlaid at the same scale, the rebuild
   sits on top of the PNG.

The reference image was only used locally for measuring. It isn't committed to this
repo, and the README loads it from Ferdio's site.

## Files

| File                    | What it does                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `heritage.ts`           | The six numbers and the sampled colours                                                   |
| `sortedStream.ts`       | Layout: per-year sort, centred stacking, paint order, and label placement                 |
| `SortedStreamChart.tsx` | The SVG: `d3-shape` `area` + `curveBumpX` for the bands, direct value labels at each rule |
| `SortedStreamPlot.tsx`  | The page: title, a sort toggle, a country legend that highlights, and the credits         |

## Two things the image didn't say

- **Which band goes in front.** Where Denmark and Norway cross, Denmark is drawn over
  Norway. The code generalises this: bands that move up the ranking are painted last,
  so the overtaking country passes in front.
- **Where the NO label goes.** Ferdio moved Norway's label most of the way toward 2022,
  because Denmark covers it in the middle. Instead of hard-coding that offset, the code
  searches for a spot: it steps outward from the midpoint, subtracts whatever is painted
  on top, and places the label at the first clear run of band. That lands NO a little
  closer to the middle than Ferdio put it.

## What I added

- **A "Fixed 2004 order" toggle.** Ferdio's description says the sorting is what makes
  the Denmark/Norway switch stand out. The toggle shows the same data without the sort,
  where the switch disappears into two diverging bands. The bands tween between the two
  layouts with a CSS transition on the path's `d` property. Readers who prefer reduced
  motion get an instant switch.
- **Highlighting.** Hovering or focusing a band, or a legend entry, dims the other two.
  This helps most at the crossing.

## Known gaps

- The fonts are the system UI font, not Ferdio's typeface.
- The original's colours are kept exactly, and two of them fall short of WCAG AA for
  normal-size text: white on the red band is 3.51:1, and the grey labels on white are
  3.94:1. In earlier weeks I darkened colours to clear 4.5:1. Here I matched the
  reference and am noting the shortfall instead.
- With only two years, the curve between the rules is decoration. It shows no year in
  between, and the point where Denmark crosses Norway says nothing about when Denmark
  actually passed it.
