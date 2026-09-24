import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { useDataset } from '../week-02/useDataset';
import { useDimensions } from '../week-03/useDimensions';
import type { Margin } from '../week-04/margin';
import { INK_PRIMARY, INK_SECONDARY, MUTED } from '../week-04/palette';
import { renderAxes } from '../week-04/renderAxes';
import { useScales } from '../week-04/useScales';
import { FONT_FAMILY, wrapText } from '../week-04/wrapText';
import { aggregate, countIn, totalIn, type Cell } from './aggregate';
import { layoutLegend, renderColorLegend } from './renderColorLegend';
import { prefersReducedMotion } from './prefersReducedMotion';
import { renderMarks } from './renderMarks';
import { renderSizeLegend } from './renderSizeLegend';
import { LEGEND_SERIES, seriesFor, STATUS_SERIES, type Selection } from './series';

const SOURCE_URL = 'https://www.kaggle.com/datasets/sudarshan24byte/online-food-dataset';

// Chart configuration. All tweakable values live here in one place so they can be
// adjusted without hunting through the rendering functions.
// The top margin is not fixed: it is measured from the wrapped header and the colour
// legend, so only the other three sides are constants.
const sideMargins = { right: 28, bottom: 84, left: 76 };
const chartHeight = 640;

const titleFontSize = 18;
const titleLineHeight = 23;
const subtitleFontSize = 12;
const subtitleLineHeight = 17;
const headerTop = 20;
const headerGap = 10;
/** Air between the subtitle and the colour legend's caption. */
const legendTopGap = 20;

// Horizontal room set aside for the size key, so neither the wrapped header nor the
// colour legend runs into it.
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

const inFocus = (cell: Cell) =>
  cell.age >= FOCUS_AGES[0] &&
  cell.age <= FOCUS_AGES[1] &&
  cell.family >= FOCUS_FAMILY[0] &&
  cell.family <= FOCUS_FAMILY[1];

const subtitleLead =
  'Each circle is one age / family-size pair, and its area is the number of survey respondents there. Pick a marital status below to count only those respondents - the outline left behind is the cell as a whole.';

// How the dynamic subtitle line names each group. "Prefer not to say" is a declined
// answer, and writing it as one keeps the sentence honest about what it is.
const GROUP_PHRASE: Record<string, string> = {
  Single: 'are single',
  Married: 'are married',
  'Prefer not to say': 'declined to give a marital status',
};

export function AgeFamilyStatusPlot() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { data, error } = useDataset();
  const { ref: divRef, dimensions } = useDimensions();
  const [hovered, setHovered] = useState<Cell | null>(null);

  /*
   * The colour legend has two pieces of state, not one. `pinned` is the group the
   * reader has chosen and that survives the pointer leaving; `preview` is whatever
   * they are currently pointing at or have tabbed to. Splitting them is what lets a
   * sweep along the legend show all four views in a second without the reader having
   * to click their way back out of each one.
   */
  const [pinned, setPinned] = useState<Selection>('all');
  const [preview, setPreview] = useState<Selection | null>(null);
  const active = preview ?? pinned;

  const cells = useMemo(() => (data ? aggregate(data.rows) : null), [data]);

  // Group sizes are counted from the data so the legend cannot disagree with the plot.
  const legendEntries = useMemo(
    () =>
      cells ? LEGEND_SERIES.map((series) => ({ series, total: totalIn(cells, series.key) })) : null,
    [cells],
  );

  /*
   * The top margin is not a fixed number: it is whatever the wrapped header, the
   * colour legend, and the size key actually need at this width. Working it out here,
   * before the scales, is what stops a long title from being clipped on a narrow
   * viewport.
   *
   * Everything the selection changes is a single unwrapped line, so the number of
   * lines - and with it the top margin - is the same in all four states. A header that
   * grew by a line when you hovered the legend would shove the plot down under the
   * pointer.
   */
  const header = useMemo(() => {
    const { width } = dimensions;
    if (width <= 0 || !cells || !legendEntries) return null;

    const textWidth = Math.max(width - headerRightGutter, 160);

    const total = cells.reduce((sum, cell) => sum + cell.count, 0);
    const focus = cells.filter(inFocus);
    const focusTotal = focus.reduce((sum, cell) => sum + cell.count, 0);
    const focusSingle = focus.reduce((sum, cell) => sum + cell.byStatus.Single, 0);
    const focusCells =
      (FOCUS_AGES[1] - FOCUS_AGES[0] + 1) * (FOCUS_FAMILY[1] - FOCUS_FAMILY[0] + 1);

    const title = `Nearly half of Bengaluru's online food customers are aged ${FOCUS_AGES[0]}-${FOCUS_AGES[1]} in households of ${FOCUS_FAMILY[0]}-${FOCUS_FAMILY[1]}, and ${Math.round((100 * focusSingle) / focusTotal)}% of those are single`;
    const titleLines = wrapText(title, textWidth, titleFontSize, 600);

    const activeTotal = totalIn(cells, active);

    const selectionLine = (selection: Selection) => {
      if (selection === 'all') {
        return `${focusTotal} of the ${total} people surveyed sit in just ${focusCells} of the cells in this grid.`;
      }
      const groupTotal = totalIn(cells, selection);
      const groupInFocus = focus.reduce((sum, cell) => sum + countIn(cell, selection), 0);
      return `${groupTotal} of the ${total} respondents ${GROUP_PHRASE[selection]} - ${groupInFocus} of them aged ${FOCUS_AGES[0]}-${FOCUS_AGES[1]} in households of ${FOCUS_FAMILY[0]}-${FOCUS_FAMILY[1]}.`;
    };

    /*
     * The one line that changes with the selection still wraps, but the space under it
     * is reserved for the longest of the four sentences rather than for the one on
     * screen. Otherwise the header would grow by a line as you moved along the legend
     * and shove the plot down under the pointer - and not wrapping at all, which is
     * how Week 4 kept the line count fixed, only worked while the sentence was short
     * enough to never need it.
     */
    const leadLines = wrapText(subtitleLead, textWidth, subtitleFontSize);
    const activeLines = wrapText(selectionLine(active), textWidth, subtitleFontSize);
    const reservedLines = Math.max(
      ...LEGEND_SERIES.map(
        (series) => wrapText(selectionLine(series.key), textWidth, subtitleFontSize).length,
      ),
    );

    const subtitleLines = [...leadLines, ...activeLines];

    const subtitleBottom =
      headerTop +
      titleLines.length * titleLineHeight +
      headerGap +
      (leadLines.length + reservedLines) * subtitleLineHeight;

    const legendCaptionY = subtitleBottom + legendTopGap;
    const legend = layoutLegend(legendEntries, textWidth);

    // The key's tallest circle can never exceed half a column, and the column width is
    // known without the top margin - so the space it needs can be bounded up front and
    // the two do not end up defined in terms of each other.
    const columnWidth = Math.max(width - sideMargins.left - sideMargins.right, 0) / 16;
    const keyHeight = 2 * (columnWidth * 0.5) + 49;

    return {
      titleLines,
      subtitleLines,
      legend,
      legendCaptionY,
      total,
      activeTotal,
      marginTop: Math.max(legendCaptionY + legend.height + 20, keyHeight + 20, 116),
    };
  }, [cells, legendEntries, dimensions, active]);

  const margin: Margin = useMemo(
    () => ({ ...sideMargins, top: header?.marginTop ?? 116 }),
    [header?.marginTop],
  );

  /*
   * The scales are built from every cell, never from the selected subset. Positions and
   * circle areas therefore mean the same thing in all four states of the chart: 9
   * single respondents draw at the size 9 respondents draw at, not at the size the 22
   * of the fullest cell used to. Rescaling per filter is the quiet way a filtered chart
   * starts lying.
   */
  const scales = useScales({ data: cells, ...dimensions, margin });

  // setHovered is stable, so the marks are not rebuilt just because a tooltip moved.
  const handleHover = useCallback((cell: Cell | null) => setHovered(cell), []);

  const handlePin = useCallback((key: Selection) => {
    // Clicking the group that is already kept returns to everyone, so the legend is
    // its own way back out. Clearing the preview lets that change show immediately,
    // rather than waiting for the pointer to leave the chip.
    setPinned((current) => (current === key ? 'all' : key));
    setPreview(null);
  }, []);

  // Resizing should not animate: a tween on every ResizeObserver frame is just lag.
  // Only a change of group is worth watching, and only for a reader who wants motion.
  const previousActive = useRef<Selection>(active);

  const summary = useMemo(() => {
    if (!cells || !scales || !header) return null;
    return {
      total: header.total,
      activeTotal: header.activeTotal,
      gridCells: scales.ageTicks.length * scales.familyTicks.length,
      occupied: cells.length,
    };
  }, [cells, scales, header]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !cells || !scales) return;

    const animate = previousActive.current !== active && !prefersReducedMotion();
    previousActive.current = active;
    const series = seriesFor(active);

    // D3 renders the data-driven marks, axes, and keys into the groups React put in
    // place; the static title and axis labels stay as plain React text elements.
    renderMarks(select(svg).select<SVGGElement>('g.marks'), {
      data: cells,
      xScale: scales.xScale,
      yScale: scales.yScale,
      rScale: scales.rScale,
      active,
      animate,
      onHover: handleHover,
    });

    renderAxes(select(svg).select<SVGGElement>('g.axes'), {
      xScale: scales.xScale,
      yScale: scales.yScale,
      visibleAgeTicks: scales.visibleAgeTicks,
      familyTicks: scales.familyTicks,
      innerWidth: scales.innerWidth,
    });

    const sizeLegend = select(svg).select<SVGGElement>('g.size-legend');
    const { width: legendWidth } = renderSizeLegend(sizeLegend, {
      maxCount: scales.maxCount,
      rScale: scales.rScale,
      baselineY: 2 * scales.maxRadius + 12,
      fill: series.fill,
      animate,
    });
    // Right-aligned against the plot's right edge, which is only knowable once the key
    // has been laid out and can report how wide it came out.
    // Anchored from the bottom up, so the key's last row always clears the plot by the
    // same gap no matter how big its circles turn out to be.
    sizeLegend.attr(
      'transform',
      `translate(${dimensions.width - margin.right - legendWidth},${margin.top - 2 * scales.maxRadius - 38})`,
    );
  }, [cells, scales, margin, dimensions.width, handleHover, active]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !header || !scales) return;

    const legend = select(svg).select<SVGGElement>('g.color-legend');
    legend.attr('transform', `translate(0,${header.legendCaptionY})`);
    renderColorLegend(legend, {
      chips: header.legend.chips,
      active,
      pinned,
      onPreview: setPreview,
      onPin: handlePin,
    });
  }, [header, scales, active, pinned, handlePin]);

  const plotCenterX = margin.left + (scales?.innerWidth ?? 0) / 2;
  const plotCenterY = margin.top + (scales?.innerHeight ?? 0) / 2;
  const activeSeries = seriesFor(active);
  const hoveredCount = hovered ? countIn(hovered, active) : 0;

  return (
    <div className="h-full w-full overflow-y-auto bg-gray-50">
      <div className="mx-auto max-w-7xl px-8 py-8">
        <p className="text-[11px] font-semibold tracking-[0.35em] text-gray-500 uppercase">
          Week 5
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

            {/*
             * role="group" rather than Week 4's role="img": the colour legend puts
             * real buttons inside this SVG, and role="img" would make every one of
             * them invisible to a screen reader.
             */}
            <svg
              ref={svgRef}
              className="absolute inset-0 h-full w-full"
              style={{ fontFamily: FONT_FAMILY }}
              role="group"
              aria-label={`Bubble plot of ${summary?.total ?? 0} survey respondents by age and family size. Circle area, and the number printed inside each circle, is the number of respondents at that age and family size. Currently showing ${activeSeries.label.toLowerCase()}: ${summary?.activeTotal ?? 0} respondents.`}
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
                        key={index}
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

                  <g className="color-legend" />

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
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-gray-900 px-2 py-1.5 text-[11px] whitespace-nowrap text-white shadow-sm"
                style={{
                  // Anchored on the cell's full circle, not the selected subset, so the
                  // tooltip does not slide down the screen when a group is picked.
                  left: margin.left + scales.xScale(hovered.age),
                  top:
                    margin.top + scales.yScale(hovered.family) - scales.rScale(hovered.count) - 8,
                }}
              >
                <div>
                  <span className="font-semibold tabular-nums">{hoveredCount}</span>
                  {active !== 'all' && (
                    <>
                      {' of '}
                      <span className="tabular-nums">{hovered.count}</span>
                    </>
                  )}
                  {hovered.count === 1 && active === 'all' ? ' respondent' : ' respondents'}
                  <span className="text-gray-400">
                    {' '}
                    - age <span className="tabular-nums">{hovered.age}</span>, family of{' '}
                    <span className="tabular-nums">{hovered.family}</span>
                  </span>
                </div>
                {/* The split is the detail the colour legend is asking about, so the
                    tooltip answers it for one cell without making you change the view. */}
                <div className="mt-1 flex gap-2.5">
                  {STATUS_SERIES.filter((series) => hovered.byStatus[series.key] > 0).map(
                    (series) => (
                      <span
                        key={series.key}
                        className={series.key === active ? 'text-white' : 'text-gray-400'}
                      >
                        <span
                          className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                          style={{ backgroundColor: series.fill }}
                        />
                        {series.label}{' '}
                        <span className="tabular-nums">{hovered.byStatus[series.key]}</span>
                      </span>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {summary && (
          <p className="mt-3 text-xs text-gray-500">
            {summary.total} respondents occupy {summary.occupied} of the {summary.gridCells}{' '}
            age-and-family-size pairs in range
            {active !== 'all' && `; ${summary.activeTotal} of them ${GROUP_PHRASE[active]}`}. Data
            from the{' '}
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
