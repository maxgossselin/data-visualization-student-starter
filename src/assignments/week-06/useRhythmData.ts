import { useEffect, useState } from 'react';
import { csvParse } from 'd3-dsv';
import { DAY_HOURS, emptyCounts, toHourCounts, type DayType, type ZoneProfile } from './cube';
import type { Mode } from './modes';

/**
 * Loads the cube that `scripts/build-rhythm-cube.sh` writes.
 *
 * The project document's architecture note says the browser should only ever receive
 * the aggregate, and this is where that promise is kept: two CSVs of a few hundred
 * kilobytes stand in for roughly 25 million trip records and a month of hourly
 * subway ridership. Everything the chart does afterwards is a filter over data that is
 * already in memory.
 */

const BASE = `${import.meta.env.BASE_URL}data/nyc-rhythm/`;

export interface RhythmData {
  zones: ZoneProfile[];
  byId: Map<number, ZoneProfile>;
}

interface State {
  data: RhythmData | null;
  error: string | null;
}

async function fetchText(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return response.text();
}

export function useRhythmData(): State {
  const [state, setState] = useState<State>({ data: null, error: null });

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchText(`${BASE}zones.csv`), fetchText(`${BASE}mode-share.csv`)])
      .then(([zonesText, cubeText]) => {
        if (cancelled) return;

        const zones = new Map<number, ZoneProfile>();
        for (const row of csvParse(zonesText)) {
          const zoneId = Number(row.zone_id);
          zones.set(zoneId, {
            zoneId,
            zone: row.zone ?? `Zone ${zoneId}`,
            borough: row.borough ?? '',
            subwayComplexes: Number(row.subway_complexes ?? 0),
            weekdayTrips: Number(row.weekday_trips ?? 0),
            hours: { weekday: [], weekend: [] },
          });
        }

        // The cube is one row per (zone, day type, clock hour). It is pivoted here into
        // the order the chart draws in - 04:00 first - so no component has to think
        // about where the day starts.
        const pending = new Map<string, Map<number, Record<Mode, number>>>();
        for (const row of csvParse(cubeText)) {
          const key = `${row.zone_id}:${row.daytype}`;
          let hours = pending.get(key);
          if (!hours) {
            hours = new Map();
            pending.set(key, hours);
          }
          hours.set(Number(row.hour), {
            subway: Number(row.subway ?? 0),
            taxi: Number(row.taxi ?? 0),
            fhv: Number(row.fhv ?? 0),
          });
        }

        for (const [key, hours] of pending) {
          const [zoneIdText, dayType] = key.split(':');
          const zone = zones.get(Number(zoneIdText));
          if (!zone) continue;
          zone.hours[dayType as DayType] = DAY_HOURS.map((hour) =>
            toHourCounts(hour, hours.get(hour) ?? emptyCounts()),
          );
        }

        const ordered = [...zones.values()].sort((a, b) => b.weekdayTrips - a.weekdayTrips);
        setState({ data: { zones: ordered, byId: zones }, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ data: null, error: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
