import { MODE_KEYS, type Mode } from './modes';
import { hourOffset, type HourCounts } from './cube';

/**
 * The chart is a 100% stacked area rather than three lines, and the reason is in the
 * numbers: in a residential zone the subway carries 85-95% of the morning, which would
 * pin the taxi and for-hire lines to the floor and make the thing the chart is about -
 * the hour they take over - a comparison between two flat lines in the bottom 5% of
 * the plot. Stacked, every mode keeps a visible band at every hour.
 *
 * The subway is stacked first, against the baseline, so its upper edge *is* its share.
 * That edge crossing the 50% rule is the handoff, read directly rather than inferred
 * from where two lines meet.
 */

export interface StackPoint {
  offset: number;
  hour: number;
  /** Cumulative upper edge for each mode, in stacking order. 0..1. */
  upper: Record<Mode, number>;
  entry: HourCounts;
}

export function stackHours(hours: HourCounts[]): StackPoint[] {
  return hours
    .map((entry) => {
      let cumulative = 0;
      const upper = {} as Record<Mode, number>;
      for (const mode of MODE_KEYS) {
        cumulative += entry.shares[mode];
        upper[mode] = cumulative;
      }
      // An hour with no trips has no composition. Carrying zeros would draw a collapsed
      // stack that reads as "all subway"; the chart skips these points instead.
      return { offset: hourOffset(entry.hour), hour: entry.hour, upper, entry };
    })
    .sort((a, b) => a.offset - b.offset);
}

export const lowerOf = (point: StackPoint, mode: Mode) => {
  const index = MODE_KEYS.indexOf(mode);
  return index === 0 ? 0 : point.upper[MODE_KEYS[index - 1]];
};
