import { max, sum } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { YEARS, type Country, type Year } from './heritage';

/**
 * Layout for a two-step sorted stream graph.
 *
 * Measured off the reference image, the rules the original follows are:
 *
 * - Each year's column is a stack of the three countries, largest on top, with a fixed
 *   gap between bands. Sorting happens per year, so a country that changes rank changes
 *   place in the stack - that is the whole design.
 * - The stack is centred on the middle of the rule rather than sitting on a baseline
 *   (the 2004 stack spans 345-720 and the 2022 one 260-806 in a 1000px image, both
 *   centred on 532). That is a streamgraph's silhouette offset.
 * - Every band is the same scale in both years: 15.4px a site at 2004 and 15.5px at
 *   2022, i.e. one linear scale with the gaps added on top.
 * - The taller stack fills about 81.5% of the rule (546 of 670px).
 */

/** Share of the rule the taller of the two stacks fills. */
const STACK_FILL = 0.815;

export interface BandEnd {
  top: number;
  bottom: number;
  /** 0 for the top of the stack. */
  rank: number;
}

export interface Band {
  country: Country;
  ends: Record<Year, BandEnd>;
}

export interface StreamLayoutOptions {
  /** Top and bottom of the year rules. */
  ruleTop: number;
  ruleBottom: number;
  gap: number;
  /** False keeps one fixed order in both years, for comparison with the sorted form. */
  sorted: boolean;
}

export function layoutStream(
  countries: Country[],
  { ruleTop, ruleBottom, gap, sorted }: StreamLayoutOptions,
): Band[] {
  const ruleHeight = ruleBottom - ruleTop;
  const centre = (ruleTop + ruleBottom) / 2;
  const gaps = gap * (countries.length - 1);

  const largestTotal = max(YEARS, (year) => sum(countries, (c) => c.sites[year])) ?? 0;
  const thickness = scaleLinear()
    .domain([0, largestTotal])
    .range([0, ruleHeight * STACK_FILL - gaps]);

  // The fixed order is the first year's ranking, so toggling sorting off freezes the
  // 2004 order and the overtaking has nowhere to show.
  const firstYear = YEARS[0];
  const byFirstYear = [...countries].sort((a, b) => b.sites[firstYear] - a.sites[firstYear]);

  const ends = new Map<Country, Partial<Record<Year, BandEnd>>>(countries.map((c) => [c, {}]));
  for (const year of YEARS) {
    const order = sorted
      ? [...countries].sort((a, b) => b.sites[year] - a.sites[year])
      : byFirstYear;
    const stackHeight = sum(order, (c) => thickness(c.sites[year])) + gaps;
    let y = centre - stackHeight / 2;
    order.forEach((country, rank) => {
      const height = thickness(country.sites[year]);
      ends.get(country)![year] = { top: y, bottom: y + height, rank };
      y += height + gap;
    });
  }

  return countries.map((country) => ({
    country,
    ends: ends.get(country) as Record<Year, BandEnd>,
  }));
}

/**
 * Paint order. Bands that climb the ranking are drawn last, so where two cross the
 * climber passes in front - Denmark over Norway, as in the original. Reading the swap
 * as one band overtaking another depends on that.
 */
export function paintOrder(bands: Band[]): Band[] {
  const [from, to] = YEARS;
  const climb = (band: Band) => band.ends[from].rank - band.ends[to].rank;
  return [...bands].sort((a, b) => climb(a) - climb(b));
}

/**
 * A point on a band edge drawn with d3's curveBumpX between two points: a cubic Bézier
 * whose two control points both sit at the horizontal midpoint. Both edges of every
 * band share x0 and x1, so the same parameter `s` lands every edge at the same x, and
 * the bands can be compared column by column without solving for `s`.
 */
export function bumpAt(x0: number, x1: number, y0: number, y1: number, s: number) {
  const xm = (x0 + x1) / 2;
  const u = 1 - s;
  const near = u * u * u + 3 * s * u * u;
  const far = 3 * s * s * u + s * s * s;
  return {
    x: x0 * u * u * u + xm * 3 * s * u * u + xm * 3 * s * s * u + x1 * s * s * s,
    y: y0 * near + y1 * far,
  };
}

// Where along the stream a label may go, best first. The middle is the natural spot;
// the others are only tried when a band is covered there.
const LABEL_CANDIDATES = [0.5, 0.58, 0.42, 0.66, 0.34, 0.74, 0.26, 0.82, 0.18];

export interface BandLabel {
  band: Band;
  x: number;
  y: number;
}

/**
 * Places each band's name where the band can actually be seen.
 *
 * The original puts SE and DK in the middle of their bands but pushes NO most of the
 * way to 2022, because at the midpoint Denmark is lying across it. Rather than copy that
 * offset as a magic number, this searches for it: walk outwards from the middle, subtract
 * every band painted on top, and take the first spot with a clear run of `minRun` px.
 */
export function placeLabels(bands: Band[], x0: number, x1: number, minRun: number): BandLabel[] {
  const [from, to] = YEARS;
  const painted = paintOrder(bands);

  const edgesAt = (band: Band, s: number) => {
    const top = bumpAt(x0, x1, band.ends[from].top, band.ends[to].top, s);
    const bottom = bumpAt(x0, x1, band.ends[from].bottom, band.ends[to].bottom, s);
    return { x: top.x, top: top.y, bottom: bottom.y };
  };

  return painted.map((band, index) => {
    const above = painted.slice(index + 1);
    for (const s of LABEL_CANDIDATES) {
      const { x, top, bottom } = edgesAt(band, s);
      const run = largestVisibleRun(
        top,
        bottom,
        above.map((other) => edgesAt(other, s)),
      );
      if (run && run.bottom - run.top >= minRun) {
        return { band, x, y: (run.top + run.bottom) / 2 };
      }
    }
    const { x, top, bottom } = edgesAt(band, 0.5);
    return { band, x, y: (top + bottom) / 2 };
  });
}

/** The longest stretch of [top, bottom] not covered by any of `covers`. */
function largestVisibleRun(top: number, bottom: number, covers: { top: number; bottom: number }[]) {
  let runs = [{ top, bottom }];
  for (const cover of covers) {
    runs = runs.flatMap((run) => {
      if (cover.bottom <= run.top || cover.top >= run.bottom) return [run];
      const pieces = [];
      if (cover.top > run.top) pieces.push({ top: run.top, bottom: cover.top });
      if (cover.bottom < run.bottom) pieces.push({ top: cover.bottom, bottom: run.bottom });
      return pieces;
    });
  }
  return runs.sort((a, b) => b.bottom - b.top - (a.bottom - a.top))[0];
}
