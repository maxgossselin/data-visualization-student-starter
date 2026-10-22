import { useEffect, useState } from 'react';
import { csvParse } from 'd3-dsv';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { DAY_HOURS, type DayType } from '../week-06/cube';
import type { Catchment } from './assumptions';

/**
 * Loads the same cube as Week 6, plus the two things Week 8 added to the pipeline:
 * subway riders apportioned by walk catchment, and the zone outlines.
 *
 * Unlike Week 6 this keeps the raw counts rather than shares. Shares depend on the
 * two assumptions the page now lets the reader change - which catchment, and how many
 * people a car trip carries - so they are computed after those are chosen, not here.
 */

const BASE = `${import.meta.env.BASE_URL}data/nyc-rhythm/`;

export interface RawHour {
  hour: number;
  subway: Record<Catchment, number>;
  /** Trips, not people. Occupancy is applied later. */
  taxi: number;
  fhv: number;
}

export interface MapZone {
  zoneId: number;
  zone: string;
  borough: string;
  subwayComplexes: number;
  /** Week 6's measure, kept so the set of readable zones does not move with the settings. */
  weekdayTrips: number;
  /** 24 hours from DAY_START_HOUR, as Week 6 orders them. */
  hours: Record<DayType, RawHour[]>;
}

export type ZoneFeatures = FeatureCollection<Polygon | MultiPolygon, { zone_id: number }>;

export interface HandoffMapData {
  zones: MapZone[];
  byId: Map<number, MapZone>;
  outlines: ZoneFeatures;
  /** Mean passengers on a yellow-cab trip that reports a count. */
  measuredOccupancy: number;
  /** Share of yellow trips that report one at all. */
  occupancyCoverage: number;
}

interface State {
  data: HandoffMapData | null;
  error: string | null;
}

async function fetchText(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return response.text();
}

const emptyHour = (hour: number): RawHour => ({
  hour,
  subway: { station: 0, quarter: 0, half: 0 },
  taxi: 0,
  fhv: 0,
});

export function useHandoffMapData(): State {
  const [state, setState] = useState<State>({ data: null, error: null });

  useEffect(() => {
    let cancelled = false;

    Promise.all(
      ['zones.csv', 'mode-share.csv', 'zones.geojson', 'occupancy.csv'].map((file) =>
        fetchText(`${BASE}${file}`),
      ),
    )
      .then(([zonesText, cubeText, outlinesText, occupancyText]) => {
        if (cancelled) return;

        const cube = new Map<string, Map<number, RawHour>>();
        for (const row of csvParse(cubeText)) {
          const key = `${row.zone_id}:${row.daytype}`;
          let hours = cube.get(key);
          if (!hours) {
            hours = new Map();
            cube.set(key, hours);
          }
          const hour = Number(row.hour);
          hours.set(hour, {
            hour,
            subway: {
              station: Number(row.subway ?? 0),
              quarter: Number(row.subway_quarter ?? 0),
              half: Number(row.subway_half ?? 0),
            },
            taxi: Number(row.taxi ?? 0),
            fhv: Number(row.fhv ?? 0),
          });
        }

        const byId = new Map<number, MapZone>();
        for (const row of csvParse(zonesText)) {
          const zoneId = Number(row.zone_id);
          const hoursFor = (dayType: DayType) => {
            const hours = cube.get(`${zoneId}:${dayType}`);
            return DAY_HOURS.map((hour) => hours?.get(hour) ?? emptyHour(hour));
          };
          byId.set(zoneId, {
            zoneId,
            zone: row.zone ?? `Zone ${zoneId}`,
            borough: row.borough ?? '',
            subwayComplexes: Number(row.subway_complexes ?? 0),
            weekdayTrips: Number(row.weekday_trips ?? 0),
            hours: { weekday: hoursFor('weekday'), weekend: hoursFor('weekend') },
          });
        }

        const yellow = csvParse(occupancyText).find((row) => row.fleet === 'yellow');
        const outlines = JSON.parse(outlinesText) as ZoneFeatures;

        setState({
          data: {
            zones: [...byId.values()],
            byId,
            outlines,
            measuredOccupancy: Number(yellow?.mean_passengers ?? 1),
            occupancyCoverage:
              Number(yellow?.trips_with_count ?? 0) / Math.max(Number(yellow?.trips ?? 1), 1),
          },
          error: null,
        });
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
