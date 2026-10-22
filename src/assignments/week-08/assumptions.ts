import {
  classifyZone,
  type DayType,
  findCrossovers,
  primaryHandoff,
  toHourCounts,
  type HourCounts,
  type ZoneKind,
} from '../week-06/cube';
import type { MapZone, RawHour } from './useHandoffMapData';

/**
 * The two assumptions the Week 6 chart had baked in, made into settings.
 *
 * Week 6 ended with both of them written down as unresolved: the subway was credited
 * to whichever zone a station's coordinate fell in, and car trips were counted as
 * vehicles while the subway was counted as people. Neither has a right answer the data
 * can supply. What the reader can be given is the ability to change them and watch
 * which parts of the map hold still.
 */

export const CATCHMENTS = ['station', 'quarter', 'half'] as const;
export type Catchment = (typeof CATCHMENTS)[number];

export const CATCHMENT_LABEL: Record<Catchment, string> = {
  station: 'Station’s own zone',
  quarter: '¼-mile walk',
  half: '½-mile walk',
};

export const CATCHMENT_NOTE: Record<Catchment, string> = {
  station:
    'Week 6’s join: each station complex counts entirely in the zone its coordinate falls in.',
  quarter:
    'Each complex’s riders are spread over a quarter-mile circle, in proportion to how much of it each zone covers.',
  half: 'The same, over half a mile - the planning convention for a rail station’s walkshed.',
};

export interface Assumptions {
  catchment: Catchment;
  /** People per taxi or for-hire trip. 1 reproduces Week 6, which compared vehicles. */
  occupancy: number;
}

export const WEEK_6_ASSUMPTIONS: Assumptions = { catchment: 'station', occupancy: 1 };

export const OCCUPANCY_RANGE = { min: 1, max: 2, step: 0.01 };

/**
 * One zone's day, in people, under a given pair of assumptions. Taxi and for-hire
 * counts are scaled by the same occupancy: Uber and Lyft publish no passenger count,
 * so the taxi's measured figure is borrowed for them, and the page says so.
 */
export function peopleByHour(hours: RawHour[], { catchment, occupancy }: Assumptions) {
  return hours.map((raw) =>
    toHourCounts(raw.hour, {
      subway: raw.subway[catchment],
      taxi: raw.taxi * occupancy,
      fhv: raw.fhv * occupancy,
    }),
  );
}

/*
 * The map's classes. Handoff time is ordered, so it takes one hue light to dark - the
 * later the subway gives the zone up, the darker - binned rather than continuous so a
 * zone's colour can be matched to the legend by eye. "Never hands over" is the end of
 * the same scale (later than any hour), so it takes the darkest step rather than a
 * colour of its own. "Cars all day" is the opposite situation and takes the taxi's
 * orange from Week 6 rather than the lightest blue, which would say "early handoff".
 *
 * The five blues are steps 250/400/500/600/700 of the validated sequential ramp, and
 * pass its ordinal checks: monotone lightness, every adjacent gap at least 0.06, and
 * the light end at 2.06:1 against the surface. Six bins did not fit - no sixth step
 * clears the 0.06 gap - so the time bins are four, not five.
 */

export type MapClass =
  'before-22' | '22-23' | '23-00' | 'after-00' | 'subway-all-day' | 'cars-all-day' | 'too-quiet';

export interface MapClassSpec {
  key: MapClass;
  label: string;
  fill: string;
}

export const MAP_CLASSES: MapClassSpec[] = [
  { key: 'before-22', label: 'Before 22:00', fill: '#86b6ef' },
  { key: '22-23', label: '22:00–23:00', fill: '#3987e5' },
  { key: '23-00', label: '23:00–00:00', fill: '#256abf' },
  { key: 'after-00', label: 'After midnight', fill: '#184f95' },
  { key: 'subway-all-day', label: 'Never: subway all day', fill: '#0d366b' },
  { key: 'cars-all-day', label: 'Never: cars all day', fill: '#eb6834' },
  { key: 'too-quiet', label: 'Too few trips to read', fill: '#f0efec' },
];

export const MAP_CLASS_BY_KEY = new Map(MAP_CLASSES.map((spec) => [spec.key, spec]));

/** Week 6's floor: below this a zone's share swings on single trips. */
export const MIN_WEEKDAY_TRIPS = 2000;

export interface ZoneReading {
  kind: ZoneKind;
  /** Hour of day the subway loses the lead for the night, if it does. */
  handoff: number | null;
  /** Same, as a position along the 04:00-origin day, for comparing two readings. */
  handoffOffset: number | null;
  /**
   * The subway still leads at 03:00, so it gives the zone up between 03:00 and the
   * 04:00 seam the day is cut at - later than anything the drawn day can place.
   */
  handoffAtSeam: boolean;
  mapClass: MapClass;
  hours: HourCounts[];
}

// The bin edges as offsets from the 04:00 origin: 22:00 is 18 hours in, and so on.
// Measured on the offset rather than the clock, so 01:00 sorts after 23:00 and the
// bins never have to wrap midnight.
const BIN_EDGES: { below: number; mapClass: MapClass }[] = [
  { below: 18, mapClass: 'before-22' },
  { below: 19, mapClass: '22-23' },
  { below: 20, mapClass: '23-00' },
  { below: Infinity, mapClass: 'after-00' },
];

export function readZone(
  hours: RawHour[],
  assumptions: Assumptions,
  readable: boolean,
): ZoneReading {
  const people = peopleByHour(hours, assumptions);
  const kind = classifyZone(people);
  const handoff = kind === 'hands-over' ? primaryHandoff(findCrossovers(people)) : null;

  let mapClass: MapClass;
  if (!readable || kind === 'no-data') mapClass = 'too-quiet';
  else if (kind === 'subway-all-day') mapClass = 'subway-all-day';
  else if (kind === 'cars-all-day') mapClass = 'cars-all-day';
  else if (!handoff) mapClass = 'after-00';
  else mapClass = BIN_EDGES.find((edge) => handoff.offset < edge.below)!.mapClass;

  return {
    kind,
    handoff: handoff?.at ?? null,
    handoffOffset: handoff?.offset ?? (kind === 'hands-over' ? 24 : null),
    handoffAtSeam: kind === 'hands-over' && !handoff,
    mapClass,
    hours: people,
  };
}

/**
 * How much a zone's answer depends on the settings: its reading under every
 * combination of them - all three catchments, at both Week 6's one-per-vehicle and
 * the measured occupancy. Those six span every choice the page offers that the data
 * can defend.
 *
 * Two things are kept, because they fail differently. Whether the zone hands over at
 * all is the robust part: for most zones it holds under all six. The clock time is
 * not - the median zone's handoff spans well over an hour across the six - so it is
 * reported as a range rather than judged against the map's one-hour bins, where a
 * twenty-minute shift across a bin edge would count as a change of answer.
 */
export interface ZoneSpread {
  kinds: Set<ZoneKind>;
  /** Earliest and latest handoff across the readings that hand over, on the 04:00 day. */
  earliest: number | null;
  latest: number | null;
}

export function zoneSpreads(
  zones: MapZone[],
  dayType: DayType,
  readable: Set<number>,
  measuredOccupancy: number,
) {
  const spreads = new Map<number, ZoneSpread>();
  for (const zone of zones) {
    if (!readable.has(zone.zoneId)) continue;
    const readings = CATCHMENTS.flatMap((catchment) =>
      [1, measuredOccupancy].map((occupancy) =>
        readZone(zone.hours[dayType], { catchment, occupancy }, true),
      ),
    );
    const offsets = readings
      .map((reading) => reading.handoffOffset)
      .filter((offset): offset is number => offset !== null);
    spreads.set(zone.zoneId, {
      kinds: new Set(readings.map((reading) => reading.kind)),
      earliest: offsets.length > 0 ? Math.min(...offsets) : null,
      latest: offsets.length > 0 ? Math.max(...offsets) : null,
    });
  }
  return spreads;
}
