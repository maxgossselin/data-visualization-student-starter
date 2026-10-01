import { useMemo, useState } from 'react';
import { useDimensions } from '../week-03/useDimensions';
import {
  classifyZone,
  DAY_TYPE_LABEL,
  DAY_TYPES,
  findCrossovers,
  formatHour,
  primaryHandoff,
  primaryReturn,
  type DayType,
} from './cube';
import { HandoffChart } from './HandoffChart';
import { MODE_SERIES, type Mode } from './modes';
import { useRhythmData } from './useRhythmData';
import { ZoneSpark } from './ZoneSpark';

// Zones quieter than this are dropped from the picker. A zone with a few dozen trips a
// day has a share that swings between 0 and 100% on one Uber, and a handoff hour read
// off that is noise with a timestamp on it.
const MIN_WEEKDAY_TRIPS = 2000;
const SPARK_COUNT = 24;
const DEFAULT_ZONE = 'East Village';
const CHART_HEIGHT = 340;

const SOURCES = [
  { label: 'MTA hourly subway ridership', href: 'https://data.ny.gov/d/5wq4-mkjj' },
  {
    label: 'NYC TLC trip records',
    href: 'https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page',
  },
];

export function RhythmHandoffPlot() {
  const { data, error } = useRhythmData();
  const { ref: chartRef, dimensions } = useDimensions();

  const [dayType, setDayType] = useState<DayType>('weekday');
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<Mode | null>(null);
  const [hoveredOffset, setHoveredOffset] = useState<number | null>(null);

  const pickable = useMemo(
    () => data?.zones.filter((zone) => zone.weekdayTrips >= MIN_WEEKDAY_TRIPS) ?? [],
    [data],
  );

  const zone = useMemo(() => {
    if (!data) return null;
    if (zoneId !== null) return data.byId.get(zoneId) ?? null;
    return pickable.find((candidate) => candidate.zone === DEFAULT_ZONE) ?? pickable[0] ?? null;
  }, [data, zoneId, pickable]);

  // Memoised because the `?? []` fallback would otherwise be a fresh array on every
  // render, and everything derived from the hours hangs off it.
  const hours = useMemo(() => zone?.hours[dayType] ?? [], [zone, dayType]);

  const { crossovers, handoff, handback, kind } = useMemo(() => {
    const found = findCrossovers(hours);
    return {
      crossovers: found,
      handoff: primaryHandoff(found),
      handback: primaryReturn(found),
      kind: classifyZone(hours),
    };
  }, [hours]);

  // Sorted by when they hand over, so the grid reads as an ordering rather than a bag
  // of charts. Zones that never hand over sort to the end, where they read as their own
  // group rather than as missing data.
  /*
   * Every busy zone, classified, so the grid can report what it is leaving out.
   *
   * Showing the plain 24 busiest turned out to flatten the thing the grid is for:
   * the busiest zones in New York are almost all Manhattan interchanges where the
   * subway never gives up the lead, so nineteen of twenty-four came back identical
   * and the ordering said nothing. The grid now shows the busiest zones that do hand
   * over - where an ordering is a real comparison - and the ones that never do are
   * reported as a count instead of as twenty identical pictures.
   */
  const population = useMemo(() => {
    const classified = pickable.map((candidate) => {
      const hoursFor = candidate.hours[dayType];
      const found = findCrossovers(hoursFor);
      return {
        candidate,
        kind: classifyZone(hoursFor),
        order: primaryHandoff(found)?.offset ?? Number.POSITIVE_INFINITY,
      };
    });
    return {
      classified,
      handsOver: classified.filter((entry) => entry.kind === 'hands-over').length,
      holds: classified.filter((entry) => entry.kind === 'subway-all-day').length,
      cars: classified.filter((entry) => entry.kind === 'cars-all-day').length,
    };
  }, [pickable, dayType]);

  const sparkZones = useMemo(() => {
    // Which zones appear is decided by volume; the order they appear in is decided by
    // the handoff. Letting the handoff pick the zones too would select for the extremes
    // and then call them the busiest.
    const chosen = population.classified
      .filter((entry) => entry.kind === 'hands-over')
      .slice(0, SPARK_COUNT);

    // Keep whatever is selected on screen even when it is not busy enough to make the
    // cut, so clicking through the grid and then picking elsewhere does not break the
    // link between the two halves of the view.
    const selected = population.classified.find((entry) => entry.candidate.zoneId === zone?.zoneId);
    if (selected && !chosen.includes(selected)) chosen.push(selected);

    return chosen
      .sort((a, b) => a.order - b.order || b.candidate.weekdayTrips - a.candidate.weekdayTrips)
      .map((entry) => entry.candidate);
  }, [population, zone?.zoneId]);

  const hovered = hoveredOffset === null ? null : hours[Math.round(hoveredOffset)];

  const headline = !zone
    ? 'Loading'
    : kind === 'hands-over' && handoff
      ? `${zone.zone} hands the night over to the car fleet at ${formatHour(handoff.at)}${
          handback ? `, and takes it back at ${formatHour(handback.at)}` : ''
        }`
      : kind === 'subway-all-day'
        ? `${zone.zone} never hands over — the subway carries more than half of every hour`
        : kind === 'cars-all-day'
          ? `${zone.zone} is car country around the clock — the subway never carries half an hour of it`
          : `${zone.zone} has too few trips to read`;

  return (
    <div className="h-full w-full overflow-y-auto bg-gray-50">
      <div className="mx-auto max-w-7xl px-8 py-8">
        <p className="text-[11px] font-semibold tracking-[0.35em] text-gray-500 uppercase">
          Week 6 · Project V1
        </p>

        {error && (
          <section className="mt-3 rounded-lg border border-red-200 bg-white p-5 text-sm text-red-700">
            <p className="font-medium">Could not load the rhythm cube.</p>
            <p className="mt-1 text-red-600">{error}</p>
            <p className="mt-2 text-gray-600">
              Run <code className="rounded bg-gray-100 px-1">scripts/build-rhythm-cube.sh</code> to
              rebuild <code className="rounded bg-gray-100 px-1">public/data/nyc-rhythm/</code>.
            </p>
          </section>
        )}

        {!error && (
          <section className="mt-3 rounded-lg border border-gray-200 bg-white p-6">
            <h1 className="max-w-4xl text-lg leading-snug font-semibold text-gray-900">
              {headline}
            </h1>
            <p className="mt-2 max-w-4xl text-xs leading-relaxed text-gray-600">
              Every trip that started in this taxi zone during June 2025, by hour of a typical{' '}
              {dayType === 'weekday' ? 'weekday' : 'weekend day'}, stacked to 100%. The subway sits
              against the baseline, so the hour its band crosses the dashed half line is the hour
              the taxi and for-hire fleets together start carrying more of the zone than it does.
            </p>

            {/* Controls in one row above the chart, scoping everything below them. */}
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
              <div
                className="inline-flex rounded-md border border-gray-300 p-0.5"
                role="group"
                aria-label="Day type"
              >
                {DAY_TYPES.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => setDayType(candidate)}
                    aria-pressed={dayType === candidate}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      dayType === candidate
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {DAY_TYPE_LABEL[candidate]}
                  </button>
                ))}
              </div>

              {/*
               * The colour legend carries Week 5's interaction, with one change forced
               * by the form: pointing at a mode dims the others rather than removing
               * them. On a stacked chart a filter would restack the survivors and move
               * every boundary, including the one the chart is about.
               */}
              <div className="flex flex-wrap items-center gap-4" role="group" aria-label="Modes">
                {MODE_SERIES.map((series) => (
                  <button
                    key={series.key}
                    type="button"
                    onMouseEnter={() => setHighlighted(series.key)}
                    onMouseLeave={() => setHighlighted(null)}
                    onFocus={() => setHighlighted(series.key)}
                    onBlur={() => setHighlighted(null)}
                    className="flex items-center gap-2 text-xs text-gray-600 transition-opacity hover:text-gray-900"
                    style={{ opacity: highlighted && highlighted !== series.key ? 0.4 : 1 }}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: series.fill }}
                    />
                    {series.label}
                    <span className="text-gray-400">{series.unit}</span>
                  </button>
                ))}
              </div>
            </div>

            <div ref={chartRef} className="relative mt-4 w-full" style={{ height: CHART_HEIGHT }}>
              {(!zone || dimensions.width === 0) && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
                  Loading the rhythm cube...
                </div>
              )}

              {dimensions.width > 0 && zone && (
                <HandoffChart
                  hours={hours}
                  crossovers={crossovers}
                  width={dimensions.width}
                  height={CHART_HEIGHT}
                  highlighted={highlighted}
                  hoveredOffset={hoveredOffset}
                  onHoverOffset={setHoveredOffset}
                />
              )}

              {/*
               * One readout for every mode at the hovered hour, with the count beside
               * the share: the project document's "lookup, not just overview" task
               * needs the actual number, not only the shape.
               */}
              {hovered && (
                <div className="pointer-events-none absolute top-0 right-0 rounded-md border border-gray-200 bg-white/95 px-3 py-2 text-[11px] shadow-sm">
                  <div className="font-semibold text-gray-900 tabular-nums">
                    {String(hovered.hour).padStart(2, '0')}:00
                  </div>
                  <table className="mt-1">
                    <tbody>
                      {MODE_SERIES.map((series) => (
                        <tr key={series.key} className="text-gray-600">
                          <td className="pr-2">
                            <span
                              className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                              style={{ backgroundColor: series.fill }}
                            />
                            {series.label}
                          </td>
                          <td className="pr-2 text-right font-semibold text-gray-900 tabular-nums">
                            {Math.round(hovered.shares[series.key] * 100)}%
                          </td>
                          <td className="text-right tabular-nums">
                            {Math.round(hovered.counts[series.key]).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/*
             * On the chart rather than in a footnote, because it is the limit most
             * likely to change how the number should be read.
             */}
            <p className="mt-3 max-w-4xl text-[11px] leading-relaxed text-gray-500">
              <span className="font-medium text-gray-700">What this does not say.</span> The subway
              figure counts people through a turnstile; the taxi and for-hire figures count
              vehicles, each carrying one or more. The half line is therefore not a headcount, and
              the handoff times are best read against each other rather than as an absolute. Zone
              boundaries cut the same way: {zone?.zone} contains {zone?.subwayComplexes ?? 0} subway
              station complex{zone?.subwayComplexes === 1 ? '' : 'es'}, and a zone whose entrance
              happens to sit over its border reads as car country whatever its residents do.
            </p>
          </section>
        )}

        {!error && data && (
          <section className="mt-4 rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                The busiest zones that hand over, earliest first
              </h2>
              <p className="text-xs text-gray-500">Click one to read it above.</p>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
              Of the {pickable.length} zones with at least {MIN_WEEKDAY_TRIPS.toLocaleString()}{' '}
              trips on a typical {dayType === 'weekday' ? 'weekday' : 'weekend day'},{' '}
              <span className="font-medium text-gray-700">{population.handsOver} hand over</span> at
              some point in the night. {population.holds} never do — the subway carries more than
              half of every hour, which is what a real interchange looks like. In {population.cars}{' '}
              the subway never reaches half at all.
            </p>
            <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2">
              {sparkZones.map((candidate) => (
                <ZoneSpark
                  key={candidate.zoneId}
                  zone={candidate}
                  dayType={dayType}
                  selected={candidate.zoneId === zone?.zoneId}
                  onSelect={setZoneId}
                />
              ))}
            </div>
          </section>
        )}

        <p className="mt-3 text-xs text-gray-500">
          June 2025. Monday–Thursday and Saturday–Sunday; Friday is excluded because it has a
          weekday morning and a weekend night. Built from{' '}
          {SOURCES.map((source, index) => (
            <span key={source.href}>
              {index > 0 && ' and '}
              <a
                href={source.href}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-gray-700"
              >
                {source.label}
              </a>
            </span>
          ))}{' '}
          by <code className="rounded bg-gray-100 px-1">scripts/build-rhythm-cube.sh</code>.
        </p>
      </div>
    </div>
  );
}
