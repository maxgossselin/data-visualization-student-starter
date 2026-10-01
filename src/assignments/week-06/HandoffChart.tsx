import { useMemo } from 'react';
import { scaleLinear } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';
import { AXIS, GRIDLINE, INK_PRIMARY, INK_SECONDARY, MUTED, SURFACE } from '../week-04/palette';
import { DAY_START_HOUR, formatHour, type Crossover, type HourCounts } from './cube';
import { MODE_KEYS, modeSeries, type Mode } from './modes';
import { lowerOf, stackHours, type StackPoint } from './stack';

const margin = { top: 16, right: 92, bottom: 38, left: 46 };

// Hours are labelled every three, starting at the 04:00 origin, so the labels land on
// 04, 07, 10 ... 01 and the axis never crowds at a narrow width.
const HOUR_TICK_STEP = 3;
const SHARE_TICKS = [0, 0.25, 0.5, 0.75, 1];

// Direct labels sit at the right edge at each band's final thickness. A band thinner
// than this cannot hold one legibly, and is left to the legend.
const MIN_LABEL_SHARE = 0.08;

export interface HandoffChartProps {
  hours: HourCounts[];
  crossovers: Crossover[];
  width: number;
  height: number;
  /** The mode the legend is pointing at, if any. Others recede. */
  highlighted: Mode | null;
  hoveredOffset: number | null;
  onHoverOffset: (offset: number | null) => void;
}

export function HandoffChart({
  hours,
  crossovers,
  width,
  height,
  highlighted,
  hoveredOffset,
  onHoverOffset,
}: HandoffChartProps) {
  const innerWidth = Math.max(width - margin.left - margin.right, 10);
  const innerHeight = Math.max(height - margin.top - margin.bottom, 10);

  const points = useMemo(() => stackHours(hours), [hours]);

  const xScale = useMemo(() => scaleLinear().domain([0, 23]).range([0, innerWidth]), [innerWidth]);
  const yScale = useMemo(() => scaleLinear().domain([0, 1]).range([innerHeight, 0]), [innerHeight]);

  const bands = useMemo(() => {
    const live = points.filter((point) => point.entry.total > 0);
    return MODE_KEYS.map((mode) => {
      const shape = area<StackPoint>()
        .x((point) => xScale(point.offset))
        .y0((point) => yScale(lowerOf(point, mode)))
        .y1((point) => yScale(point.upper[mode]))
        .curve(curveMonotoneX);
      return { mode, d: shape(live) ?? '' };
    });
  }, [points, xScale, yScale]);

  // The subway band's own upper edge, drawn over the fills. It is the line the 50%
  // rule is read against, so it gets a stroke of its own rather than relying on the
  // boundary between two fills.
  const subwayEdge = useMemo(() => {
    const shape = line<StackPoint>()
      .x((point) => xScale(point.offset))
      .y((point) => yScale(point.upper.subway))
      .curve(curveMonotoneX);
    return shape(points.filter((point) => point.entry.total > 0)) ?? '';
  }, [points, xScale, yScale]);

  const hovered = hoveredOffset === null ? null : points[Math.round(hoveredOffset)];

  const lastPoint = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Share of trips starting in this zone each hour, by mode, stacked to 100 percent."
      onMouseLeave={() => onHoverOffset(null)}
    >
      <g transform={`translate(${margin.left},${margin.top})`}>
        {SHARE_TICKS.map((tick) => (
          <g key={tick} transform={`translate(0,${yScale(tick)})`}>
            <line
              x2={innerWidth}
              stroke={tick === 0.5 ? AXIS : GRIDLINE}
              strokeDasharray={tick === 0.5 ? '4 3' : undefined}
            />
            <text x={-8} dy="0.32em" textAnchor="end" fontSize={11} fill={MUTED}>
              {`${tick * 100}%`}
            </text>
          </g>
        ))}

        {bands.map(({ mode, d }) => {
          const series = modeSeries(mode);
          return (
            <path
              key={mode}
              d={d}
              fill={series.fill}
              stroke={SURFACE}
              strokeWidth={1}
              opacity={highlighted && highlighted !== mode ? 0.25 : 1}
              style={{ transition: 'opacity 150ms' }}
            />
          );
        })}

        <path d={subwayEdge} fill="none" stroke={SURFACE} strokeWidth={2} opacity={0.9} />

        {/*
         * The handoff. A marker sits exactly where the subway's edge crosses the half
         * rule, with the time printed on the mark rather than in a caption - the
         * project document's note about annotating on the mark, and the only way the
         * reader gets a number instead of an impression.
         */}
        {crossovers.map((crossover) => (
          <g key={`${crossover.to}-${crossover.offset}`}>
            <line
              x1={xScale(crossover.offset)}
              x2={xScale(crossover.offset)}
              y1={yScale(0.5)}
              y2={innerHeight + 6}
              stroke={INK_PRIMARY}
              strokeWidth={1}
            />
            <circle
              cx={xScale(crossover.offset)}
              cy={yScale(0.5)}
              r={4}
              fill={INK_PRIMARY}
              stroke={SURFACE}
              strokeWidth={1.5}
            />
            <text
              x={xScale(crossover.offset) + (crossover.to === 'cars' ? 7 : -7)}
              y={yScale(0.5) - 8}
              textAnchor={crossover.to === 'cars' ? 'start' : 'end'}
              fontSize={11}
              fontWeight={600}
              fill={INK_PRIMARY}
            >
              {formatHour(crossover.at)}
            </text>
          </g>
        ))}

        {hovered && (
          <line
            x1={xScale(hovered.offset)}
            x2={xScale(hovered.offset)}
            y1={0}
            y2={innerHeight}
            stroke={INK_PRIMARY}
            strokeWidth={1}
            strokeDasharray="3 2"
            pointerEvents="none"
          />
        )}

        {lastPoint &&
          MODE_KEYS.map((mode) => {
            const share = lastPoint.entry.shares[mode];
            if (share < MIN_LABEL_SHARE) return null;
            const mid = (lowerOf(lastPoint, mode) + lastPoint.upper[mode]) / 2;
            return (
              <text
                key={mode}
                x={innerWidth + 8}
                y={yScale(mid)}
                dy="0.32em"
                fontSize={11}
                fill={INK_SECONDARY}
                opacity={highlighted && highlighted !== mode ? 0.35 : 1}
              >
                {modeSeries(mode).label}
              </text>
            );
          })}

        <g transform={`translate(0,${innerHeight})`}>
          <line x2={innerWidth} stroke={AXIS} />
          {points
            .filter((point) => point.offset % HOUR_TICK_STEP === 0)
            .map((point) => (
              <g key={point.offset} transform={`translate(${xScale(point.offset)},0)`}>
                <line y2={5} stroke={AXIS} />
                <text y={18} textAnchor="middle" fontSize={11} fill={MUTED}>
                  {String(point.hour).padStart(2, '0')}
                </text>
              </g>
            ))}
          <text x={innerWidth / 2} y={34} textAnchor="middle" fontSize={11} fill={INK_SECONDARY}>
            {`Hour of day, ${String(DAY_START_HOUR).padStart(2, '0')}:00 to ${String((DAY_START_HOUR + 23) % 24).padStart(2, '0')}:00`}
          </text>
        </g>

        {/* One transparent column per hour: the pointer only has to be nearest. */}
        {points.map((point) => (
          <rect
            key={point.offset}
            x={xScale(point.offset) - innerWidth / 46}
            y={0}
            width={innerWidth / 23}
            height={innerHeight}
            fill="transparent"
            onMouseEnter={() => onHoverOffset(point.offset)}
          />
        ))}
      </g>
    </svg>
  );
}
