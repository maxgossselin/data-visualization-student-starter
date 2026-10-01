import { useMemo } from 'react';
import { scaleLinear } from 'd3-scale';
import { area, curveMonotoneX } from 'd3-shape';
import { AXIS, INK_PRIMARY, SURFACE } from '../week-04/palette';
import { classifyZone, formatHour, findCrossovers, primaryHandoff, type DayType } from './cube';
import { MODE_KEYS, modeSeries } from './modes';
import { lowerOf, stackHours, type StackPoint } from './stack';
import type { ZoneProfile } from './cube';

const WIDTH = 150;
const HEIGHT = 54;

export interface ZoneSparkProps {
  zone: ZoneProfile;
  dayType: DayType;
  selected: boolean;
  onSelect: (zoneId: number) => void;
}

/**
 * One zone, small enough that two dozen fit on screen at once.
 *
 * These are the comparison half of the view. The main chart answers "when does this
 * zone hand over"; the grid answers "and is that early or late", which is the question
 * the project document's typology task starts from. They are sorted by handoff time
 * rather than by volume, so the ordering is itself the finding.
 */
export function ZoneSpark({ zone, dayType, selected, onSelect }: ZoneSparkProps) {
  const hours = zone.hours[dayType];

  const { bands, handoff, kind } = useMemo(() => {
    const points = stackHours(hours).filter((point) => point.entry.total > 0);
    const x = scaleLinear().domain([0, 23]).range([0, WIDTH]);
    const y = scaleLinear().domain([0, 1]).range([HEIGHT, 0]);
    return {
      bands: MODE_KEYS.map((mode) => {
        const shape = area<StackPoint>()
          .x((point) => x(point.offset))
          .y0((point) => y(lowerOf(point, mode)))
          .y1((point) => y(point.upper[mode]))
          .curve(curveMonotoneX);
        return { mode, d: shape(points) ?? '' };
      }),
      handoff: primaryHandoff(findCrossovers(hours)),
      kind: classifyZone(hours),
    };
  }, [hours]);

  const x = scaleLinear().domain([0, 23]).range([0, WIDTH]);

  return (
    <button
      type="button"
      onClick={() => onSelect(zone.zoneId)}
      aria-pressed={selected}
      className={`group rounded-md border px-2 pt-1.5 pb-2 text-left transition-colors ${
        selected ? 'border-gray-900 bg-white' : 'border-gray-200 bg-white hover:border-gray-400'
      }`}
    >
      <div className="truncate text-[11px] font-medium text-gray-900">{zone.zone}</div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[10px] text-gray-500">
        <span className="truncate">{zone.borough}</span>
        <span className="tabular-nums">
          {handoff ? formatHour(handoff.at) : kind === 'subway-all-day' ? 'holds' : '—'}
        </span>
      </div>
      <svg width={WIDTH} height={HEIGHT} className="block" aria-hidden="true">
        {bands.map(({ mode, d }) => (
          <path key={mode} d={d} fill={modeSeries(mode).fill} stroke={SURFACE} strokeWidth={0.5} />
        ))}
        <line
          x1={0}
          x2={WIDTH}
          y1={HEIGHT / 2}
          y2={HEIGHT / 2}
          stroke={AXIS}
          strokeDasharray="3 2"
        />
        {handoff && (
          <circle
            cx={x(handoff.offset)}
            cy={HEIGHT / 2}
            r={2.5}
            fill={INK_PRIMARY}
            stroke={SURFACE}
            strokeWidth={1}
          />
        )}
      </svg>
    </button>
  );
}
