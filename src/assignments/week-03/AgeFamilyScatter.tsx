import { useMemo, useState } from 'react';
import { scaleLinear, scaleSqrt } from 'd3-scale';
import { useDataset, type Row } from '../week-02/useDataset';
import { useDimensions } from './useDimensions';

const SOURCE_URL = 'https://www.kaggle.com/datasets/sudarshan24byte/online-food-dataset';

const MARGIN = { top: 20, right: 28, bottom: 52, left: 64 };

// Same validated palette as Week 2 (see week-02/profile.ts): categorical slot 1 for
// the marks, chart-chrome inks for everything that is not data.
const SERIES = '#2a78d6';
const SURFACE = '#ffffff';
const GRIDLINE = '#e1e0d9';
const AXIS = '#c3c2b7';
const MUTED = '#898781';
const INK_SECONDARY = '#52514e';

interface Cell {
  age: number;
  family: number;
  count: number;
}

/**
 * Age and Family size are both small integers, so 388 respondents land on far fewer
 * distinct positions. One dot per row would silently stack them; counting the
 * respondents per (age, family size) pair and encoding that count keeps all of them
 * visible.
 */
function aggregate(rows: Row[]): Cell[] {
  const cells = new Map<string, Cell>();

  for (const row of rows) {
    const age = Number(row['Age']);
    const family = Number(row['Family size']);
    if (!Number.isFinite(age) || !Number.isFinite(family)) continue;

    const key = `${age}:${family}`;
    const cell = cells.get(key);
    if (cell) cell.count += 1;
    else cells.set(key, { age, family, count: 1 });
  }

  // Largest first, so the big circles are painted behind the small ones and nothing
  // gets buried.
  return [...cells.values()].sort((a, b) => b.count - a.count);
}

function integerRange(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

/** Decodes the area channel: three reference circles at real counts from the data. */
function SizeLegend({ maxCount, maxRadius }: { maxCount: number; maxRadius: number }) {
  const radius = scaleSqrt().domain([0, maxCount]).range([0, maxRadius]);
  const steps = [...new Set([1, Math.round(maxCount / 2), maxCount])];
  const gap = 10;

  let cursor = 0;
  const placed = steps.map((count) => {
    const r = radius(count);
    cursor += r;
    const cx = cursor;
    cursor += r + gap;
    return { count, r, cx };
  });

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-500">Respondents</span>
      <svg width={cursor} height={maxRadius * 2 + 16} aria-hidden>
        {placed.map(({ count, r, cx }) => (
          <g key={count}>
            <circle cx={cx} cy={maxRadius} r={r} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
            <text
              x={cx}
              y={maxRadius * 2 + 12}
              textAnchor="middle"
              fontSize={10}
              fill={MUTED}
              className="tabular-nums"
            >
              {count}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function AgeFamilyScatter() {
  const { data, error } = useDataset();
  const { ref: chartRef, dimensions } = useDimensions();
  const [hovered, setHovered] = useState<Cell | null>(null);

  const cells = useMemo(() => (data ? aggregate(data.rows) : []), [data]);
  const { width, height } = dimensions;

  /*
   * Needs both the dataset and a measured container, so it stays null on the first
   * render. The container below is therefore rendered unconditionally - if it only
   * appeared after loading finished, the ResizeObserver would have nothing to attach
   * to and the plot would never get its dimensions.
   */
  const layout = useMemo(() => {
    if (cells.length === 0) return null;

    const innerWidth = width - MARGIN.left - MARGIN.right;
    const innerHeight = height - MARGIN.top - MARGIN.bottom;
    if (innerWidth <= 0 || innerHeight <= 0) return null;

    const ageTicks = integerRange(
      Math.min(...cells.map((cell) => cell.age)),
      Math.max(...cells.map((cell) => cell.age)),
    );
    const familyTicks = integerRange(
      Math.min(...cells.map((cell) => cell.family)),
      Math.max(...cells.map((cell) => cell.family)),
    );
    const maxCount = Math.max(...cells.map((cell) => cell.count));

    // Half a step of padding on each side gives every integer value its own full-width
    // cell, so the outermost circles are not clipped by the plot edge.
    const xScale = scaleLinear()
      .domain([ageTicks[0] - 0.5, ageTicks[ageTicks.length - 1] + 0.5])
      .range([0, innerWidth]);
    const yScale = scaleLinear()
      .domain([familyTicks[0] - 0.5, familyTicks[familyTicks.length - 1] + 0.5])
      .range([innerHeight, 0]);

    const cellWidth = innerWidth / ageTicks.length;
    const cellHeight = innerHeight / familyTicks.length;
    // Area encodes the count, so the radius scale is sqrt: a cell of 22 respondents
    // covers 22x the ink of a cell of 1, not 22x the width.
    const maxRadius = Math.max(4, Math.min(cellWidth, cellHeight) * 0.46);
    const radius = scaleSqrt().domain([0, maxCount]).range([0, maxRadius]);

    return {
      innerWidth,
      innerHeight,
      ageTicks,
      familyTicks,
      maxCount,
      maxRadius,
      xScale,
      yScale,
      // Floored so a single-respondent cell never shrinks to nothing on a narrow
      // viewport. Only the smallest counts are affected.
      rScale: (count: number) => Math.max(radius(count), 3),
      // Drop every other age label when the columns get too narrow to hold one.
      ageLabelStep: cellWidth < 30 ? 2 : 1,
    };
  }, [cells, width, height]);

  return (
    <div className="h-full w-full overflow-y-auto bg-gray-50">
      <div className="mx-auto max-w-5xl px-8 py-10">
        <header>
          <p className="text-[11px] font-semibold tracking-[0.35em] text-gray-500 uppercase">
            Week 3
          </p>
          <h1 className="mt-1 text-2xl font-light text-gray-900">
            Age and household size of Bengaluru delivery customers
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            A first look at the two quantitative attributes of last week&rsquo;s dataset, plotted
            against each other. Both are small integers, so respondents pile up on a handful of
            positions and a dot per row would hide most of the sample. Each circle&rsquo;s{' '}
            <em>area</em> is the number of respondents at that age and family size.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Source:{' '}
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-gray-700"
            >
              Online Food Dataset on Kaggle
            </a>
          </p>
        </header>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">
              Respondents by age and family size
            </h2>
            {layout && (
              <SizeLegend maxCount={layout.maxCount} maxRadius={Math.min(layout.maxRadius, 18)} />
            )}
          </div>

          <div ref={chartRef} className="relative mt-2 h-[440px] w-full">
            {error && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-red-700">
                <div className="text-center">
                  <p className="font-medium">Could not load the dataset.</p>
                  <p className="mt-1 text-red-600">{error}</p>
                </div>
              </div>
            )}

            {!error && !layout && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
                Loading dataset…
              </div>
            )}

            {layout && (
              <svg
                width={width}
                height={height}
                role="img"
                aria-label={`Bubble scatter plot of ${data?.rows.length ?? 0} survey respondents by age and family size. Circle area encodes the number of respondents at each age and family size pair, from 1 up to ${layout.maxCount}.`}
              >
                <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                  {/* Gridlines, one per family size, kept recessive */}
                  {layout.familyTicks.map((family) => (
                    <line
                      key={family}
                      x1={0}
                      x2={layout.innerWidth}
                      y1={layout.yScale(family)}
                      y2={layout.yScale(family)}
                      stroke={GRIDLINE}
                      strokeWidth={1}
                    />
                  ))}

                  <line
                    x1={0}
                    x2={layout.innerWidth}
                    y1={layout.innerHeight}
                    y2={layout.innerHeight}
                    stroke={AXIS}
                    strokeWidth={1}
                  />
                  <line
                    x1={0}
                    x2={0}
                    y1={0}
                    y2={layout.innerHeight}
                    stroke={AXIS}
                    strokeWidth={1}
                  />

                  {layout.ageTicks.map((age, index) =>
                    index % layout.ageLabelStep === 0 ? (
                      <text
                        key={age}
                        x={layout.xScale(age)}
                        y={layout.innerHeight + 18}
                        textAnchor="middle"
                        fontSize={11}
                        fill={MUTED}
                        className="tabular-nums"
                      >
                        {age}
                      </text>
                    ) : null,
                  )}

                  {layout.familyTicks.map((family) => (
                    <text
                      key={family}
                      x={-12}
                      y={layout.yScale(family)}
                      textAnchor="end"
                      dominantBaseline="central"
                      fontSize={11}
                      fill={MUTED}
                      className="tabular-nums"
                    >
                      {family}
                    </text>
                  ))}

                  <text
                    x={layout.innerWidth / 2}
                    y={layout.innerHeight + 42}
                    textAnchor="middle"
                    fontSize={12}
                    fill={INK_SECONDARY}
                  >
                    Age (years)
                  </text>
                  <text
                    transform={`translate(${-MARGIN.left + 16},${layout.innerHeight / 2}) rotate(-90)`}
                    textAnchor="middle"
                    fontSize={12}
                    fill={INK_SECONDARY}
                  >
                    Family size (people)
                  </text>

                  {cells.map((cell) => {
                    const r = layout.rScale(cell.count);
                    const isPeak = cell.count === layout.maxCount;
                    const isHovered = hovered?.age === cell.age && hovered?.family === cell.family;

                    return (
                      <g
                        key={`${cell.age}:${cell.family}`}
                        transform={`translate(${layout.xScale(cell.age)},${layout.yScale(cell.family)})`}
                        onMouseEnter={() => setHovered(cell)}
                        onMouseLeave={() => setHovered(null)}
                      >
                        <circle
                          r={r}
                          fill={SERIES}
                          stroke={SURFACE}
                          strokeWidth={2}
                          opacity={hovered && !isHovered ? 0.55 : 1}
                        />
                        {/* Direct-label the peak only; the tooltip carries the rest. */}
                        {isPeak && r > 11 && (
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={11}
                            fontWeight={600}
                            fill="#ffffff"
                            className="tabular-nums"
                            pointerEvents="none"
                          >
                            {cell.count}
                          </text>
                        )}
                        {/* Hover target, never smaller than a comfortable click. */}
                        <circle r={Math.max(r, 12)} fill="transparent" />
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}

            {layout && hovered && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-gray-900 px-2 py-1 text-[11px] whitespace-nowrap text-white shadow-sm"
                style={{
                  left: MARGIN.left + layout.xScale(hovered.age),
                  top:
                    MARGIN.top + layout.yScale(hovered.family) - layout.rScale(hovered.count) - 6,
                }}
              >
                <span className="tabular-nums">{hovered.count}</span>
                {hovered.count === 1 ? ' respondent' : ' respondents'}
                <span className="text-gray-400">
                  {' '}
                  &middot; age <span className="tabular-nums">{hovered.age}</span>, family of{' '}
                  <span className="tabular-nums">{hovered.family}</span>
                </span>
              </div>
            )}
          </div>

          {data && (
            <p className="mt-3 text-xs text-gray-500">
              {data.rows.length} respondents occupy {cells.length} distinct age-and-family-size
              pairs. The sample is concentrated in a narrow band: most are in their early twenties,
              in households of two to four.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
