import { INK_PRIMARY, LABEL_ON_SERIES } from '../week-04/palette';
import { contrastRatio, readableInk } from './contrast';

/**
 * Marital Status is the attribute the colour legend splits on.
 *
 * Why this attribute: the Week 2 data abstraction flagged it as the one categorical
 * column with a real bearing on both axes of this chart - married respondents are
 * older and live in larger households - and it has few enough levels to colour
 * honestly. "Prefer not to say" is a non-response sentinel rather than a third
 * marital state (see the dataset README), but it is 12 of the 388 rows, so it is
 * shown as its own series instead of being dropped: the parts have to sum to the
 * whole or the outline ring behind each circle would lie.
 *
 * Why these colours: the three category hues are slots 1-3 of the same validated
 * categorical palette Weeks 2-4 drew from, taken in their fixed order. Three is the
 * cap for a bubble chart, where any two marks can end up side by side, so every pair
 * has to separate - these clear it (worst pair under simulated colour-vision
 * deficiency dE 9.2, normal vision 25.5; the floors are 8 and 15).
 *
 * "All respondents" is not a category, so it does not take a hue. It is a neutral
 * slate, which keeps colour meaning exactly one thing: the group a circle counts.
 * Aqua sits below 3:1 against the white chart surface, so it leans on the relief the
 * chart already ships - every circle carries a visible count and a surface ring.
 */

export const STATUS_KEYS = ['Single', 'Married', 'Prefer not to say'] as const;
export type StatusKey = (typeof STATUS_KEYS)[number];

/** What the legend can select: one status, or everyone. */
export type Selection = 'all' | StatusKey;

export interface Series<K extends Selection = Selection> {
  key: K;
  label: string;
  fill: string;
  /** Label ink for numerals printed inside a mark of this colour. */
  ink: string;
}

const FILLS: Record<Selection, string> = {
  all: '#57564f',
  Single: '#256abf',
  Married: '#eb6834',
  'Prefer not to say': '#1baf7a',
};

function defineSeries<K extends Selection>(key: K, label: string): Series<K> {
  const fill = FILLS[key];
  const ink = readableInk(fill, LABEL_ON_SERIES, INK_PRIMARY);

  // Cheap guard rather than a comment that can go stale: if a fill is ever changed to
  // one that no ink clears AA on, the chart says so in the console instead of
  // shipping a label nobody can read.
  if (import.meta.env.DEV && contrastRatio(fill, ink) < 4.5) {
    console.warn(
      `Series "${label}" (${fill}) has no label ink clearing 4.5:1 - best is ${contrastRatio(fill, ink).toFixed(2)}:1.`,
    );
  }

  return { key, label, fill, ink };
}

export const ALL_SERIES = defineSeries('all', 'All respondents');
export const STATUS_SERIES: Series<StatusKey>[] = STATUS_KEYS.map((key) => defineSeries(key, key));

/** Legend order: everyone first, then the statuses largest to smallest. */
export const LEGEND_SERIES: Series[] = [ALL_SERIES, ...STATUS_SERIES];

const BY_KEY = new Map(LEGEND_SERIES.map((series) => [series.key, series]));

export function seriesFor(key: Selection): Series {
  return BY_KEY.get(key) ?? ALL_SERIES;
}
