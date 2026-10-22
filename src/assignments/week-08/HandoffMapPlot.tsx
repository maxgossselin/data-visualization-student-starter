import { useMemo, useState } from 'react';
import { median } from 'd3-array';
import { useDimensions } from '../week-03/useDimensions';
import {
  DAY_TYPE_LABEL,
  DAY_TYPES,
  findCrossovers,
  formatHour,
  type DayType,
} from '../week-06/cube';
import { HandoffChart } from '../week-06/HandoffChart';
import { MODE_SERIES } from '../week-06/modes';
import {
  CATCHMENT_LABEL,
  CATCHMENT_NOTE,
  CATCHMENTS,
  MAP_CLASS_BY_KEY,
  MAP_CLASSES,
  MIN_WEEKDAY_TRIPS,
  OCCUPANCY_RANGE,
  readZone,
  zoneSpreads,
  WEEK_6_ASSUMPTIONS,
  type Assumptions,
  type Catchment,
  type MapClass,
  type ZoneReading,
  type ZoneSpread,
} from './assumptions';
import { HandoffMap } from './HandoffMap';
import { useHandoffMapData, type MapZone } from './useHandoffMapData';

// Midtown Center is where the page opens because it is the zone Week 6 named as the
// catchment artifact: the city's busiest taxi zone, read as handing over at 18:55
// because its stations sit just over its borders.
const DEFAULT_ZONE_ID = 161;
const DETAIL_HEIGHT = 220;
const MOVES_SHOWN = 8;

const SOURCES = [
  { label: 'MTA hourly subway ridership', href: 'https://data.ny.gov/d/5wq4-mkjj' },
  {
    label: 'NYC TLC trip records',
    href: 'https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page',
  },
  {
    label: 'TLC taxi zones',
    href: 'https://d37ci6vzurychx.cloudfront.net/misc/taxi_zones.zip',
  },
];

/** A reading as words: a time, or which way the zone never hands over. */
function describe(reading: ZoneReading | undefined) {
  if (!reading || reading.mapClass === 'too-quiet') return 'too few trips';
  if (reading.kind === 'subway-all-day') return 'never - subway all day';
  if (reading.kind === 'cars-all-day') return 'never - cars all day';
  if (reading.handoffAtSeam) return 'after 03:00';
  return reading.handoff === null ? '-' : formatHour(reading.handoff);
}

const offsetToClock = (offset: number) =>
  offset >= 24 ? 'after 03:00' : formatHour((offset + 4) % 24);

/**
 * The range of answers a zone gives across every setting. A zone that hands over
 * under some settings and not others is reported as exactly that, rather than as a
 * range of times with the "never" readings quietly left out.
 */
function describeSpread(spread: ZoneSpread | undefined) {
  if (!spread) return 'too few trips';
  const never = [...spread.kinds].filter((kind) => kind !== 'hands-over');
  const times =
    spread.earliest === null || spread.latest === null
      ? null
      : spread.latest - spread.earliest < 0.1
        ? offsetToClock(spread.earliest)
        : `${offsetToClock(spread.earliest)}–${offsetToClock(spread.latest)}`;
  const neverWords = never.map((kind) =>
    kind === 'subway-all-day'
      ? 'never (subway)'
      : kind === 'cars-all-day'
        ? 'never (cars)'
        : 'no trips',
  );
  return [times, ...neverWords].filter(Boolean).join(' or ');
}

/** Where a reading sits on the night, for ranking how far it moved. */
function nightPosition(reading: ZoneReading) {
  if (reading.kind === 'subway-all-day') return 26;
  if (reading.kind === 'cars-all-day') return -2;
  return reading.handoffOffset ?? 0;
}

function readAll(zones: MapZone[], dayType: DayType, settings: Assumptions, readable: Set<number>) {
  const readings = new Map<number, ZoneReading>();
  for (const zone of zones) {
    readings.set(zone.zoneId, readZone(zone.hours[dayType], settings, readable.has(zone.zoneId)));
  }
  return readings;
}

function sameAssumptions(a: Assumptions, b: Assumptions) {
  return a.catchment === b.catchment && Math.abs(a.occupancy - b.occupancy) < 0.005;
}

export function HandoffMapPlot() {
  const { data, error } = useHandoffMapData();
  const { ref: mapRef, dimensions: mapSize } = useDimensions();
  const { ref: detailRef, dimensions: detailSize } = useDimensions();

  const [dayType, setDayType] = useState<DayType>('weekday');
  const [catchment, setCatchment] = useState<Catchment>('quarter');
  const [occupancyChoice, setOccupancy] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number>(DEFAULT_ZONE_ID);
  const [hover, setHover] = useState<{ zoneId: number; x: number; y: number } | null>(null);
  const [focusClass, setFocusClass] = useState<MapClass | null>(null);
  const [hoveredOffset, setHoveredOffset] = useState<number | null>(null);
  const [onlySettled, setOnlySettled] = useState(false);

  // Occupancy opens at the measured taxi figure rather than at Week 6's 1.0: the point
  // of the setting is to compare people with people, and the measured number is the
  // only one the data supports.
  const occupancy = occupancyChoice ?? data?.measuredOccupancy ?? 1;
  const assumptions = useMemo<Assumptions>(
    () => ({ catchment, occupancy }),
    [catchment, occupancy],
  );
  const isWeek6 = sameAssumptions(assumptions, WEEK_6_ASSUMPTIONS);

  const readable = useMemo(
    () =>
      new Set(data?.zones.filter((z) => z.weekdayTrips >= MIN_WEEKDAY_TRIPS).map((z) => z.zoneId)),
    [data],
  );

  // Every zone is re-read on every change of a setting - 262 zones of 24 hours, which
  // is a few thousand multiplications and well inside a frame while the slider drags.
  const readings = useMemo(
    () => readAll(data?.zones ?? [], dayType, assumptions, readable),
    [data, dayType, assumptions, readable],
  );
  const week6 = useMemo(
    () => readAll(data?.zones ?? [], dayType, WEEK_6_ASSUMPTIONS, readable),
    [data, dayType, readable],
  );

  const spreads = useMemo(
    () => zoneSpreads(data?.zones ?? [], dayType, readable, data?.measuredOccupancy ?? 1),
    [data, dayType, readable],
  );
  const settled = useMemo(
    () => new Set([...spreads].filter(([, spread]) => spread.kinds.size === 1).map(([id]) => id)),
    [spreads],
  );

  const summary = useMemo(() => {
    const counts = new Map<MapClass, number>(MAP_CLASSES.map((spec) => [spec.key, 0]));
    const handoffs: number[] = [];
    for (const [zoneId, reading] of readings) {
      if (!readable.has(zoneId)) continue;
      counts.set(reading.mapClass, (counts.get(reading.mapClass) ?? 0) + 1);
      if (reading.kind === 'hands-over' && reading.handoffOffset !== null) {
        handoffs.push(reading.handoffOffset);
      }
    }
    const middle = median(handoffs);
    return {
      counts,
      handsOver: handoffs.length,
      medianHandoff: middle === undefined ? null : (middle + 4) % 24,
    };
  }, [readings, readable]);

  // The zones whose answer the two assumptions changed most, against Week 6. A zone
  // that moved between "hands over" and "never" is ranked by where "never" sits on the
  // night (just past either end), so a change of kind always outranks a shift of an
  // hour or two.
  const moves = useMemo(() => {
    if (!data || isWeek6) return [];
    return data.zones
      .filter((zone) => readable.has(zone.zoneId))
      .map((zone) => {
        const before = week6.get(zone.zoneId)!;
        const after = readings.get(zone.zoneId)!;
        return { zone, before, after, shift: nightPosition(after) - nightPosition(before) };
      })
      .filter(
        (move) => Math.abs(move.shift) >= 0.25 || move.before.mapClass !== move.after.mapClass,
      )
      .sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift));
  }, [data, readings, week6, readable, isWeek6]);

  const selectedZone = data?.byId.get(selectedId) ?? null;
  const selected = readings.get(selectedId);
  const selectedWeek6 = week6.get(selectedId);
  const crossovers = useMemo(() => findCrossovers(selected?.hours ?? []), [selected]);
  const hoveredHour =
    hoveredOffset === null || !selected ? null : selected.hours[Math.round(hoveredOffset)];

  const lookupZones = useMemo(
    () =>
      (data?.zones ?? [])
        .filter((zone) => readable.has(zone.zoneId))
        .sort((a, b) => a.zone.localeCompare(b.zone)),
    [data, readable],
  );

  const mapWidth = mapSize.width;
  const mapHeight = Math.min(Math.max(mapWidth * 0.98, 360), 680);
  const hoverZone = hover ? data?.byId.get(hover.zoneId) : null;
  const hoverReading = hover ? readings.get(hover.zoneId) : undefined;
  const hoverWeek6 = hover ? week6.get(hover.zoneId) : undefined;
  const measured = data?.measuredOccupancy ?? 1;
  const dayWord = dayType === 'weekday' ? 'weeknight' : 'weekend night';

  return (
    <div className="h-full w-full overflow-y-auto bg-gray-50">
      <div className="mx-auto max-w-7xl px-8 py-8">
        <p className="text-[11px] font-semibold tracking-[0.35em] text-gray-500 uppercase">
          Week 8 · Project V2
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
              {data
                ? `The subway hands ${summary.handsOver} of ${readable.size} busy zones to cars on a typical ${dayWord}${
                    summary.medianHandoff === null
                      ? ''
                      : `, at a median of ${formatHour(summary.medianHandoff)}`
                  }`
                : 'Loading the handoff map...'}
            </h1>
            <p className="mt-2 max-w-4xl text-xs leading-relaxed text-gray-600">
              Each taxi zone is coloured by the hour the subway stops carrying more of it than the
              taxi and for-hire fleets combined. Week 6 drew that hour for one zone at a time and
              left two assumptions unresolved; both are now settings. The map opens on the corrected
              reading - riders counted from a walk around each station, and cars counted in people -
              and the list on the right shows what that changed.
            </p>

            {/* Controls in one row above everything they scope. */}
            <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
              <fieldset>
                <legend className="mb-1 text-[11px] font-medium text-gray-500">Day</legend>
                <div className="inline-flex rounded-md border border-gray-300 p-0.5">
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
              </fieldset>

              <fieldset>
                <legend className="mb-1 text-[11px] font-medium text-gray-500">
                  Subway riders come from
                </legend>
                <div className="inline-flex rounded-md border border-gray-300 p-0.5">
                  {CATCHMENTS.map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      onClick={() => setCatchment(candidate)}
                      aria-pressed={catchment === candidate}
                      title={CATCHMENT_NOTE[candidate]}
                      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                        catchment === candidate
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {CATCHMENT_LABEL[candidate]}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="w-[340px] max-w-full">
                <label
                  htmlFor="occupancy"
                  className="mb-1 flex items-baseline justify-between text-[11px] font-medium text-gray-500"
                >
                  <span>People per taxi or for-hire trip</span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">
                    {occupancy.toFixed(2)}
                  </span>
                </label>
                <input
                  id="occupancy"
                  type="range"
                  min={OCCUPANCY_RANGE.min}
                  max={OCCUPANCY_RANGE.max}
                  step={OCCUPANCY_RANGE.step}
                  value={occupancy}
                  onChange={(event) => setOccupancy(Number(event.target.value))}
                  className="w-full accent-gray-900"
                />
                {/* The two values the slider is for comparing, marked where they sit. */}
                <div className="relative h-4 text-[10px] text-gray-500">
                  {[
                    { value: 1, label: '1.00 · Week 6' },
                    { value: measured, label: `${measured.toFixed(2)} · measured` },
                  ].map((mark) => (
                    <button
                      key={mark.label}
                      type="button"
                      onClick={() => setOccupancy(mark.value)}
                      className="absolute -translate-x-[6px] whitespace-nowrap hover:text-gray-900"
                      style={{
                        left: `${((mark.value - OCCUPANCY_RANGE.min) / (OCCUPANCY_RANGE.max - OCCUPANCY_RANGE.min)) * 100}%`,
                      }}
                    >
                      ▲ {mark.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={isWeek6}
                onClick={() => {
                  setCatchment(WEEK_6_ASSUMPTIONS.catchment);
                  setOccupancy(WEEK_6_ASSUMPTIONS.occupancy);
                }}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40"
              >
                Show Week 6’s reading
              </button>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div>
                {/*
                 * The legend doubles as a filter preview, as in Weeks 5 and 6: pointing at
                 * a class recedes the rest of the map, so "where are the zones that never
                 * hand over?" is one gesture rather than a hunt for a dark blue.
                 */}
                <div
                  className="flex flex-wrap gap-x-4 gap-y-1.5"
                  role="group"
                  aria-label="Handoff hour"
                >
                  {MAP_CLASSES.map((spec) => (
                    <button
                      key={spec.key}
                      type="button"
                      onMouseEnter={() => setFocusClass(spec.key)}
                      onMouseLeave={() => setFocusClass(null)}
                      onFocus={() => setFocusClass(spec.key)}
                      onBlur={() => setFocusClass(null)}
                      className="flex items-center gap-1.5 text-[11px] text-gray-600 transition-opacity hover:text-gray-900"
                      style={{ opacity: focusClass && focusClass !== spec.key ? 0.4 : 1 }}
                    >
                      <span
                        className="inline-block h-3 w-3 rounded-sm border border-gray-200"
                        style={{ backgroundColor: spec.fill }}
                      />
                      {spec.label}
                      <span className="text-gray-400 tabular-nums">
                        {spec.key === 'too-quiet'
                          ? ''
                          : (summary.counts.get(spec.key) ?? 0).toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>

                <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-600">
                  <input
                    type="checkbox"
                    checked={onlySettled}
                    onChange={(event) => setOnlySettled(event.target.checked)}
                    className="accent-gray-900"
                  />
                  Fade zones whose answer depends on the settings
                  <span className="text-gray-400">
                    {settled.size} of {readable.size} hand over, or don’t, under all six
                  </span>
                </label>

                <div ref={mapRef} className="relative mt-2 w-full" style={{ height: mapHeight }}>
                  {(!data || mapWidth === 0) && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
                      Loading the map...
                    </div>
                  )}
                  {data && mapWidth > 0 && (
                    <HandoffMap
                      outlines={data.outlines}
                      readings={readings}
                      width={mapWidth}
                      height={mapHeight}
                      selectedId={selectedId}
                      hoveredId={hover?.zoneId ?? null}
                      focusClass={focusClass}
                      settled={onlySettled ? settled : null}
                      onHover={(zoneId, at) =>
                        setHover(zoneId === null || !at ? null : { zoneId, ...at })
                      }
                      onSelect={setSelectedId}
                    />
                  )}

                  {hover && hoverZone && (
                    <div
                      className="pointer-events-none absolute z-10 w-56 rounded-md border border-gray-200 bg-white/95 px-3 py-2 text-[11px] shadow-sm"
                      style={{
                        left: Math.min(hover.x + 14, Math.max(mapWidth - 230, 0)),
                        top: Math.max(hover.y - 12, 0),
                      }}
                    >
                      <div className="font-semibold text-gray-900">{hoverZone.zone}</div>
                      <div className="text-gray-500">{hoverZone.borough}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-gray-700">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-sm"
                          style={{
                            backgroundColor: MAP_CLASS_BY_KEY.get(
                              hoverReading?.mapClass ?? 'too-quiet',
                            )?.fill,
                          }}
                        />
                        Hands over: <span className="font-semibold">{describe(hoverReading)}</span>
                      </div>
                      {!isWeek6 && describe(hoverWeek6) !== describe(hoverReading) && (
                        <div className="text-gray-500">Week 6 read: {describe(hoverWeek6)}</div>
                      )}
                      {spreads.has(hover.zoneId) && (
                        <div className="mt-1 text-gray-500">
                          Across all six settings: {describeSpread(spreads.get(hover.zoneId))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  Click a zone to read its day. Newark Airport is left off the map.
                </p>
              </div>

              <div className="flex flex-col gap-5">
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <label htmlFor="zone-lookup" className="sr-only">
                      Find a zone
                    </label>
                    <select
                      id="zone-lookup"
                      value={readable.has(selectedId) ? selectedId : ''}
                      onChange={(event) => setSelectedId(Number(event.target.value))}
                      className="max-w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-semibold text-gray-900"
                    >
                      {!readable.has(selectedId) && (
                        <option value="">{selectedZone?.zone ?? 'Find a zone'}</option>
                      )}
                      {lookupZones.map((zone) => (
                        <option key={zone.zoneId} value={zone.zoneId}>
                          {zone.zone}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-500">{selectedZone?.borough}</span>
                  </div>

                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md bg-gray-50 px-3 py-2">
                      <dt className="text-gray-500">Hands over, now</dt>
                      <dd className="mt-0.5 text-base font-semibold text-gray-900 tabular-nums">
                        {describe(selected)}
                      </dd>
                    </div>
                    <div className="rounded-md bg-gray-50 px-3 py-2">
                      <dt className="text-gray-500">Week 6 read</dt>
                      <dd className="mt-0.5 text-base font-semibold text-gray-500 tabular-nums">
                        {describe(selectedWeek6)}
                      </dd>
                    </div>
                    <div className="rounded-md bg-gray-50 px-3 py-2">
                      <dt className="text-gray-500">Across all six settings</dt>
                      <dd className="mt-0.5 text-sm leading-snug font-semibold text-gray-700 tabular-nums">
                        {describeSpread(spreads.get(selectedId))}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-600">
                    {MODE_SERIES.map((series) => (
                      <span key={series.key} className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: series.fill }}
                        />
                        {series.label}
                      </span>
                    ))}
                    <span className="text-gray-400">
                      share of people, at {occupancy.toFixed(2)} per car trip
                    </span>
                  </div>

                  <div ref={detailRef} className="mt-1 w-full" style={{ height: DETAIL_HEIGHT }}>
                    {selected && detailSize.width > 0 && (
                      <HandoffChart
                        hours={selected.hours}
                        crossovers={crossovers}
                        width={detailSize.width}
                        height={DETAIL_HEIGHT}
                        highlighted={null}
                        hoveredOffset={hoveredOffset}
                        onHoverOffset={setHoveredOffset}
                      />
                    )}
                  </div>
                  <p className="h-4 text-[11px] text-gray-600 tabular-nums">
                    {hoveredHour
                      ? `${String(hoveredHour.hour).padStart(2, '0')}:00 · ` +
                        MODE_SERIES.map(
                          (series) =>
                            `${series.label} ${Math.round(hoveredHour.shares[series.key] * 100)}% (~${Math.round(
                              hoveredHour.counts[series.key],
                            ).toLocaleString()})`,
                        ).join(' · ')
                      : 'Point at the chart for each hour’s shares and estimated people.'}
                  </p>
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-gray-900">What moved since Week 6</h2>
                  {isWeek6 ? (
                    <p className="mt-1 text-xs text-gray-500">
                      These are Week 6’s assumptions. Change either one to see which zones move.
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-xs text-gray-500">
                        {moves.length} of {readable.size} busy zones read differently, by a quarter
                        hour or more. The largest moves:
                      </p>
                      <ol className="mt-2 divide-y divide-gray-100 text-xs">
                        {moves.slice(0, MOVES_SHOWN).map(({ zone, before, after }) => (
                          <li key={zone.zoneId}>
                            <button
                              type="button"
                              onClick={() => setSelectedId(zone.zoneId)}
                              onMouseEnter={() => setHover(null)}
                              className={`flex w-full items-baseline justify-between gap-3 py-1.5 text-left hover:bg-gray-50 ${
                                zone.zoneId === selectedId ? 'font-semibold' : ''
                              }`}
                            >
                              <span className="truncate text-gray-800">{zone.zone}</span>
                              <span className="shrink-0 text-gray-500 tabular-nums">
                                {describe(before)} →{' '}
                                <span className="text-gray-900">{describe(after)}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </div>
              </div>
            </div>

            <p className="mt-5 max-w-4xl text-[11px] leading-relaxed text-gray-500">
              <span className="font-medium text-gray-700">What this does not say.</span> Both
              settings are assumptions, not measurements. A walk circle assumes riders come evenly
              from every direction, which a river or a highway makes untrue. The occupancy figure is
              measured only for yellow cabs, and only on the{' '}
              {Math.round((data?.occupancyCoverage ?? 0) * 100)}% of trips that record a passenger
              count; Uber and Lyft publish none, so they borrow it. A zone whose colour survives
              every combination of settings is a finding. A zone whose colour flips between them is
              telling you about the method rather than the neighbourhood.
            </p>
          </section>
        )}

        <p className="mt-3 text-xs text-gray-500">
          June 2025, Monday–Thursday and Saturday–Sunday. Built from{' '}
          {SOURCES.map((source, index) => (
            <span key={source.href}>
              {index > 0 && (index === SOURCES.length - 1 ? ' and ' : ', ')}
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
