import { useMemo } from 'react';
import { area, curveBumpX } from 'd3-shape';
import { prefersReducedMotion } from '../week-05/prefersReducedMotion';
import {
  COUNTRIES,
  LABEL_INK,
  ON_BAND_INK,
  RULE,
  YEARS,
  type CountryKey,
  type Year,
} from './heritage';
import { layoutStream, paintOrder, placeLabels, type Band } from './sortedStream';

/*
 * The original is a 1000px square with a lot of air around it. These are its
 * measurements with that air cropped off - every position below is the reference's
 * pixel position less a constant (120 across, 100 down), so the chart lines up with
 * the PNG one for one when the two are overlaid at the same scale.
 */
const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 800;
const RULE_X: Record<Year, number> = { 2004: 170, 2022: 588 };
const RULE_TOP = 97;
const RULE_BOTTOM = 767;
const YEAR_LABEL_Y = 48;
const BAND_GAP = 18;
const VALUE_OFFSET = 17;

const YEAR_FONT = 26;
const VALUE_FONT = 26;
const BAND_FONT = 22;
// A band name needs this much of its band uncovered before it is placed there.
const MIN_LABEL_RUN = BAND_FONT * 2.5;

const TWEEN =
  'd 700ms cubic-bezier(0.65, 0, 0.35, 1), transform 700ms cubic-bezier(0.65, 0, 0.35, 1)';

export interface SortedStreamChartProps {
  sorted: boolean;
  highlighted: CountryKey | null;
  onHighlight: (key: CountryKey | null) => void;
}

export function SortedStreamChart({ sorted, highlighted, onHighlight }: SortedStreamChartProps) {
  const [from, to] = YEARS;

  const bands = useMemo(
    () =>
      layoutStream(COUNTRIES, {
        ruleTop: RULE_TOP,
        ruleBottom: RULE_BOTTOM,
        gap: BAND_GAP,
        sorted,
      }),
    [sorted],
  );

  // Two points per band, one on each rule. curveBumpX gives the S-shape with flat
  // tangents at both ends that the original uses; sampled against the PNG, its edges
  // land within 4px of the reference's along the whole width.
  const shape = useMemo(
    () =>
      area<{ x: number; top: number; bottom: number }>()
        .x((point) => point.x)
        .y0((point) => point.top)
        .y1((point) => point.bottom)
        .curve(curveBumpX),
    [],
  );

  const painted = useMemo(() => paintOrder(bands), [bands]);
  const labels = useMemo(
    () => placeLabels(bands, RULE_X[from], RULE_X[to], MIN_LABEL_RUN),
    [bands, from, to],
  );

  // CSS can tween a path's `d` between two shapes with the same commands, which every
  // band has, so the sort toggle animates without a d3 transition. A reader who has
  // asked for less motion gets the same change as a cut.
  const transition = prefersReducedMotion() ? undefined : TWEEN;
  const dimmed = (band: Band) => highlighted !== null && highlighted !== band.country.key;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      className="h-auto w-full"
      role="img"
      aria-label="Sorted stream graph of UNESCO World Heritage sites. 2004: Sweden 13, Norway 5, Denmark 4. 2022: Sweden 15, Denmark 10, Norway 8. Denmark overtakes Norway."
      onMouseLeave={() => onHighlight(null)}
    >
      {YEARS.map((year) => (
        <g key={year}>
          <line
            x1={RULE_X[year]}
            x2={RULE_X[year]}
            y1={RULE_TOP}
            y2={RULE_BOTTOM}
            stroke={RULE}
            strokeWidth={1.5}
          />
          <text
            x={RULE_X[year]}
            y={YEAR_LABEL_Y}
            dy="0.35em"
            textAnchor="middle"
            fontSize={YEAR_FONT}
            fontWeight={600}
            fill={LABEL_INK}
          >
            {year}
          </text>
        </g>
      ))}

      {painted.map((band) => {
        const d = shape(YEARS.map((year) => ({ x: RULE_X[year], ...band.ends[year] }))) ?? '';
        return (
          <path
            key={band.country.key}
            d={d}
            fill={band.country.fill}
            opacity={dimmed(band) ? 0.2 : 1}
            tabIndex={0}
            aria-label={`${band.country.name}: ${band.country.sites[from]} sites in ${from}, ${band.country.sites[to]} in ${to}`}
            onMouseEnter={() => onHighlight(band.country.key)}
            onFocus={() => onHighlight(band.country.key)}
            onBlur={() => onHighlight(null)}
            className="cursor-default outline-none"
            style={{ transition: [transition, 'opacity 150ms'].filter(Boolean).join(', ') }}
          />
        );
      })}

      {labels.map(({ band, x, y }) => (
        <text
          key={band.country.key}
          x={0}
          y={0}
          dy="0.35em"
          textAnchor="middle"
          fontSize={BAND_FONT}
          fontWeight={400}
          fill={ON_BAND_INK}
          opacity={dimmed(band) ? 0 : 1}
          pointerEvents="none"
          style={{ transform: `translate(${x}px, ${y}px)`, transition }}
        >
          {band.country.key}
        </text>
      ))}

      {/* The counts sit outside the rules, level with the middle of their band. */}
      {bands.flatMap((band) =>
        YEARS.map((year) => {
          const end = band.ends[year];
          const outward = year === from ? -VALUE_OFFSET : VALUE_OFFSET;
          return (
            <text
              key={`${band.country.key}-${year}`}
              x={0}
              y={0}
              dy="0.35em"
              textAnchor={year === from ? 'end' : 'start'}
              fontSize={VALUE_FONT}
              fill={LABEL_INK}
              opacity={dimmed(band) ? 0.3 : 1}
              pointerEvents="none"
              style={{
                transform: `translate(${RULE_X[year] + outward}px, ${(end.top + end.bottom) / 2}px)`,
                transition,
              }}
            >
              {band.country.sites[year]}
            </text>
          );
        }),
      )}
    </svg>
  );
}
