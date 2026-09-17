import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { useDataset } from '../week-02/useDataset';
import { useDimensions } from '../week-03/useDimensions';
import { aggregate, type Cell } from './aggregate';
import type { Margin } from './margin';
import { useScales } from './useScales';
import { renderAxes } from './renderAxes';
import { renderMarks } from './renderMarks';
import { renderSizeLegend } from './renderSizeLegend';
import { INK_PRIMARY, INK_SECONDARY, MUTED } from './palette';
import { FONT_FAMILY, wrapText } from './wrapText';

const SOURCE_URL = 'https://www.kaggle.com/datasets/sudarshan24byte/online-food-dataset';

// Chart configuration. All tweakable values live here in one place so they can be
// adjusted without hunting through the rendering functions.
// The top margin is not fixed: it is measured from the wrapped header, so only the
// other three sides are constants.
const sideMargins = { right: 28, bottom: 84, left: 76 };
const chartHeight = 640;

const title =
  "Nearly half of Bengaluru's online food customers are aged 22-25 in households of 2-4";
const titleFontSize = 18;
const titleLineHeight = 23;
const subtitleFontSize = 12;
const subtitleLineHeight = 17;
const headerTop = 20;
const headerGap = 10;

// Horizontal room set aside for the size key, so the wrapped header never runs into it.
// The key is never wider than this: its widest circle is capped by the column width.
const headerRightGutter = 170;
const xAxisLabel = 'Age (years)';
const yAxisLabel = 'Family size (people)';
const axisLabelFontSize = 13;
const xAxisLabelOffset = 46;
const yAxisLabelOffset = 52;
const sourceFontSize = 11;

// The cluster called out in the title. Editorial choice of where to point; the numbers
// that describe it are counted from the data rather than typed in, so they cannot drift.
const FOCUS_AGES: [number, number] = [22, 25];
const FOCUS_FAMILY: [number, number] = [2, 4];

export function AgeFamilySizePlot() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { data, error } = useDataset();
  const { ref: divRef, dimensions } = useDimensions();
  const [hovered, setHovered] = useState<Cell | null>(null);

  const cells = useMemo(() => (data ? aggregate(data.rows) : null), [data]);

  const subtitleLead =
    'Each circle is one age / family-size pair. Its area, and the number printed inside it, is the number of survey respondents there.';

  /*
   * The top margin is not a fixed number: it is whatever the wrapped header and the
   * size key actually need at this width. Working it out here, before the scales, is
   * what stops a long title from being clipped on a narrow viewport.
   */
  const header = useMemo(() => {
    const { width } = dimensions;
    if (width <= 0 || !cells) return null;

    const textWidth = Math.max(width - headerRightGutter, 160);
    const titleLines = wrapText(title, textWidth, titleFontSize, 600);

    const total = cells.reduce((sum, cell) => sum + cell.count, 0);
    const inFocus = cells
      .filter(
        (cell) =>
          cell.age >= FOCUS_AGES[0] &&
          cell.age <= FOCUS_AGES[1] &&
          cell.family >= FOCUS_FAMILY[0] &&
          cell.family <= FOCUS_FAMILY[1],
      )
      .reduce((sum, cell) => sum + cell.count, 0);
    const focusCells =
      (FOCUS_AGES[1] - FOCUS_AGES[0] + 1) * (FOCUS_FAMILY[1] - FOCUS_FAMILY[0] + 1);

    const subtitleLines = [
      ...wrapText(subtitleLead, textWidth, subtitleFontSize),
      `${inFocus} of the ${total} people surveyed sit in just ${focusCells} of the cells in this grid.`,
    ];

    const headerBottom =
      headerTop +
      titleLines.length * titleLineHeight +
      headerGap +
      subtitleLines.length * subtitleLineHeight;

    // The key's tallest circle can never exceed half a column, and the column width is
    // known without the top margin - so the space it needs can be bounded up front and
    // the two do not end up defined in terms of each other.
    const columnWidth = Math.max(width - sideMargins.left - sideMargins.right, 0) / 16;
    const keyHeight = 2 * (columnWidth * 0.5) + 49;

    return {
      titleLines,
      subtitleLines,
      total,
      inFocus,
      marginTop: Math.max(headerBottom + 16, keyHeight + 20, 116),
    };
  }, [cells, dimensions]);

  const margin: Margin = useMemo(
    () => ({ ...sideMargins, top: header?.marginTop ?? 116 }),
    [header?.marginTop],
  );

  const scales = useScales({ data: cells, ...dimensions, margin });

  // setHovered is stable, so the marks are not rebuilt just because a tooltip moved.
  const handleHover = useCallback((cell: Cell | null) => setHovered(cell), []);

  const summary = useMemo(() => {
    if (!cells || !scales || !header) return null;
    return {
      total: header.total,
      inFocus: header.inFocus,
      gridCells: scales.ageTicks.length * scales.familyTicks.length,
      occupied: cells.length,
    };
  }, [cells, scales, header]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !cells || !scales) return;

    // D3 renders the data-driven marks, axes, and size key into the groups React put
    // in place; the static title and axis labels stay as plain React text elements.
    renderMarks(select(svg).select<SVGGElement>('g.marks'), {
      data: cells,
      xScale: scales.xScale,
      yScale: scales.yScale,
      rScale: scales.rScale,
      onHover: handleHover,
    });

    renderAxes(select(svg).select<SVGGElement>('g.axes'), {
      xScale: scales.xScale,
      yScale: scales.yScale,
      visibleAgeTicks: scales.visibleAgeTicks,
      familyTicks: scales.familyTicks,
      innerWidth: scales.innerWidth,
    });

    const legend = select(svg).select<SVGGElement>('g.size-legend');
    const { width: legendWidth } = renderSizeLegend(legend, {
      maxCount: scales.maxCount,
      rScale: scales.rScale,
      baselineY: 2 * scales.maxRadius + 12,
    });
    // Right-aligned against the plot's right edge, which is only knowable once the key
    // has been laid out and can report how wide it came out.
    // Anchored from the bottom up, so the key's last row always clears the plot by the
    // same gap no matter how big its circles turn out to be.
    legend.attr(
      'transform',
      `translate(${dimensions.width - margin.right - legendWidth},${margin.top - 2 * scales.maxRadius - 38})`,
    );
  }, [cells, scales, margin, dimensions.width, handleHover]);

  const plotCenterX = margin.left + (scales?.innerWidth ?? 0) / 2;
  const plotCenterY = margin.top + (scales?.innerHeight ?? 0) / 2;

  return (
    <div className="h-full w-full overflow-y-auto bg-gray-50">
      <div className="mx-auto max-w-7xl px-8 py-8">
        <p className="text-[11px] font-semibold tracking-[0.35em] text-gray-500 uppercase">
          Week 4
        </p>

        <section className="mt-3 rounded-lg border border-gray-200 bg-white p-5">
          <div ref={divRef} className="relative w-full" style={{ height: chartHeight }}>
            {error && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-red-700">
                <div className="text-center">
                  <p className="font-medium">Could not load the dataset.</p>
                  <p className="mt-1 text-red-600">{error}</p>
                </div>
              </div>
            )}

            {!error && !scales && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
                Loading dataset...
              </div>
            )}

            <svg
              ref={svgRef}
              className="absolute inset-0 h-full w-full"
              style={{ fontFamily: FONT_FAMILY }}
              role="img"
              aria-label={`${title}. Bubble plot of ${summary?.total ?? 0} survey respondents by age and family size. Circle area, and the number printed inside each circle, is the number of respondents at that age and family size.`}
            >
              {scales && (
                <>
                  <g className="labels">
                    {header?.titleLines.map((line, index) => (
                      <text
                        key={line}
                        className="title"
                        x={0}
                        y={headerTop + index * titleLineHeight}
                        fontSize={titleFontSize}
                        fontWeight={600}
                        fill={INK_PRIMARY}
                      >
                        {line}
                      </text>
                    ))}
                    {header?.subtitleLines.map((line, index) => (
                      <text
                        key={line}
                        className="subtitle"
                        x={0}
                        y={
                          headerTop +
                          header.titleLines.length * titleLineHeight +
                          headerGap +
                          index * subtitleLineHeight
                        }
                        fontSize={subtitleFontSize}
                        fill={INK_SECONDARY}
                      >
                        {line}
                      </text>
                    ))}
                  </g>

                  <g className="axes">
                    <g className="grid" transform={`translate(${margin.left},${margin.top})`} />
                    <g
                      className="x-axis"
                      transform={`translate(${margin.left},${margin.top + scales.innerHeight})`}
                    />
                    <g className="y-axis" transform={`translate(${margin.left},${margin.top})`} />
                  </g>

                  <g className="marks" transform={`translate(${margin.left},${margin.top})`} />

                  <g className="size-legend" />

                  <g className="labels">
                    <text
                      className="x-axis-label"
                      x={plotCenterX}
                      y={margin.top + scales.innerHeight + xAxisLabelOffset}
                      textAnchor="middle"
                      fontSize={axisLabelFontSize}
                      fill={INK_SECONDARY}
                    >
                      {xAxisLabel}
                    </text>
                    <text
                      className="y-axis-label"
                      transform={`translate(${margin.left - yAxisLabelOffset},${plotCenterY}) rotate(-90)`}
                      textAnchor="middle"
                      fontSize={axisLabelFontSize}
                      fill={INK_SECONDARY}
                    >
                      {yAxisLabel}
                    </text>
                    <text
                      className="source"
                      x={0}
                      y={chartHeight - 10}
                      fontSize={sourceFontSize}
                      fill={MUTED}
                    >
                      {`Source: Online Food Dataset (Kaggle) - ${summary?.total ?? 0} survey responses collected in Bengaluru, India`}
                    </text>
                  </g>
                </>
              )}
            </svg>

            {scales && hovered && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-gray-900 px-2 py-1 text-[11px] whitespace-nowrap text-white shadow-sm"
                style={{
                  left: margin.left + scales.xScale(hovered.age),
                  top:
                    margin.top + scales.yScale(hovered.family) - scales.rScale(hovered.count) - 8,
                }}
              >
                <span className="tabular-nums">{hovered.count}</span>
                {hovered.count === 1 ? ' respondent' : ' respondents'}
                <span className="text-gray-400">
                  {' '}
                  - age <span className="tabular-nums">{hovered.age}</span>, family of{' '}
                  <span className="tabular-nums">{hovered.family}</span>
                </span>
              </div>
            )}
          </div>
        </section>

        {summary && (
          <p className="mt-3 text-xs text-gray-500">
            {summary.total} respondents occupy {summary.occupied} of the {summary.gridCells}{' '}
            age-and-family-size pairs in range. Data from the{' '}
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-gray-700"
            >
              Online Food Dataset on Kaggle
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}
