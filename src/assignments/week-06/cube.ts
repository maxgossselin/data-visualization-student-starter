import { MODE_KEYS, type Mode } from './modes';

export type DayType = 'weekday' | 'weekend';
export const DAY_TYPES: DayType[] = ['weekday', 'weekend'];

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  weekday: 'Weekday',
  weekend: 'Weekend',
};

/**
 * The day is drawn from 04:00 to 03:00 rather than from midnight.
 *
 * The handoff this chart is about happens at night, and a midnight origin cuts it in
 * half - the evening crossover lands against the right edge and the morning one
 * against the left, with the quiet hours that join them split across both. 04:00 is
 * the trough of the subway's day in every zone checked, so the cut falls where the
 * least is happening instead of in the middle of the story.
 */
export const DAY_START_HOUR = 4;

export const DAY_HOURS = Array.from({ length: 24 }, (_, i) => (DAY_START_HOUR + i) % 24);

/** Position of an hour along the drawn day: 04:00 is 0, 03:00 is 23. */
export const hourOffset = (hour: number) => (hour - DAY_START_HOUR + 24) % 24;

export interface HourCounts {
  hour: number;
  /** Trips on a typical day of this type, by mode. */
  counts: Record<Mode, number>;
  total: number;
  /** Each mode's fraction of that hour's trips. Zero everywhere if the hour is empty. */
  shares: Record<Mode, number>;
}

export interface ZoneProfile {
  zoneId: number;
  zone: string;
  borough: string;
  subwayComplexes: number;
  /** Trips on a typical weekday, all modes. Used to keep noise out of the picker. */
  weekdayTrips: number;
  /** 24 hours, ordered from DAY_START_HOUR. */
  hours: Record<DayType, HourCounts[]>;
}

export function emptyCounts(): Record<Mode, number> {
  return { subway: 0, taxi: 0, fhv: 0 };
}

export function toHourCounts(hour: number, counts: Record<Mode, number>): HourCounts {
  const total = MODE_KEYS.reduce((sum, mode) => sum + counts[mode], 0);
  const shares = emptyCounts();
  if (total > 0) {
    for (const mode of MODE_KEYS) shares[mode] = counts[mode] / total;
  }
  return { hour, counts, total, shares };
}

export interface Crossover {
  /** Fractional hour of day, e.g. 21.4 for 21:24. */
  at: number;
  /** Position along the drawn day, so the chart can place it without re-deriving. */
  offset: number;
  /** 'cars' = the subway loses the lead here; 'subway' = it takes it back. */
  to: 'cars' | 'subway';
}

/**
 * Where the subway hands the zone over, and where it takes it back.
 *
 * The three shares sum to one, so "the subway carries more of this hour than the taxi
 * and for-hire fleets combined" is exactly "the subway's share is above a half". That
 * makes the crossover a single line crossing a single threshold rather than a search
 * for intersections between three curves, and it is why the chart draws a reference
 * line at 50% - it is the handoff itself, not a decoration.
 *
 * Hours with no trips at all are skipped rather than read as a crossing: a zone that
 * goes quiet at 3am has no dominant mode, and treating its zero as a loss for the
 * subway would invent a handoff that nobody made.
 */
export function findCrossovers(hours: HourCounts[]): Crossover[] {
  const crossovers: Crossover[] = [];
  const live = hours.filter((entry) => entry.total > 0);

  for (let i = 1; i < live.length; i += 1) {
    const before = live[i - 1];
    const after = live[i];
    const from = before.shares.subway;
    const to = after.shares.subway;
    if ((from > 0.5 && to > 0.5) || (from <= 0.5 && to <= 0.5)) continue;

    // Linear interpolation between the two hours that straddle the threshold. The
    // underlying data is hourly, so this is a reading of the drawn line rather than a
    // claim about the minute - the chart says so where it prints the time.
    const t = (0.5 - from) / (to - from);
    const span = hourOffset(after.hour) - hourOffset(before.hour);
    const offset = hourOffset(before.hour) + t * span;

    crossovers.push({
      at: (DAY_START_HOUR + offset) % 24,
      offset,
      to: from > 0.5 ? 'cars' : 'subway',
    });
  }

  return crossovers;
}

/** "21:24". Hours are whole numbers in the data; the minutes come from interpolation. */
export function formatHour(value: number) {
  const hour = Math.floor(value);
  const minutes = Math.round((value - hour) * 60);
  const carried = minutes === 60;
  return `${String(carried ? (hour + 1) % 24 : hour).padStart(2, '0')}:${String(carried ? 0 : minutes).padStart(2, '0')}`;
}

export type ZoneKind = 'hands-over' | 'subway-all-day' | 'cars-all-day' | 'no-data';

export const ZONE_KIND_LABEL: Record<ZoneKind, string> = {
  'hands-over': 'Hands over',
  'subway-all-day': 'Subway all day',
  'cars-all-day': 'Cars all day',
  'no-data': 'No trips',
};

/**
 * What kind of day this zone has.
 *
 * The three outcomes are not a scale, they are different situations. A zone that hands
 * over has a handoff hour to report; one where the subway never falls below half never
 * hands over at all (the big interchanges behave this way); one where it never rises
 * above half has no subway worth speaking of inside its boundary. Reporting a crossover
 * time for the last two would be inventing one.
 */
export function classifyZone(hours: HourCounts[]): ZoneKind {
  const live = hours.filter((entry) => entry.total > 0);
  if (live.length === 0) return 'no-data';
  const anyAbove = live.some((entry) => entry.shares.subway > 0.5);
  const anyBelow = live.some((entry) => entry.shares.subway <= 0.5);
  if (anyAbove && anyBelow) return 'hands-over';
  return anyAbove ? 'subway-all-day' : 'cars-all-day';
}

/** The handoff the headline reports: the last time of the day the subway loses the lead. */
export function primaryHandoff(crossovers: Crossover[]): Crossover | null {
  const toCars = crossovers.filter((crossover) => crossover.to === 'cars');
  return toCars.length > 0 ? toCars[toCars.length - 1] : null;
}

/** And the one where it takes the city back. */
export function primaryReturn(crossovers: Crossover[]): Crossover | null {
  const toSubway = crossovers.filter((crossover) => crossover.to === 'subway');
  return toSubway.length > 0 ? toSubway[0] : null;
}
