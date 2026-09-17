import type { Selection } from 'd3-selection';
import { MUTED, SERIES, SURFACE } from './palette';

const CAPTION = 'Respondents in a cell';
const CAPTION_FONT_SIZE = 11;
const TICK_FONT_SIZE = 10;
const GAP = 12;

export interface RenderSizeLegendOptions {
  maxCount: number;
  /** The chart's own radius scale. Passing anything else would make the key lie. */
  rScale: (count: number) => number;
  /** Baseline the circles sit on, relative to the legend group. */
  baselineY: number;
}

/**
 * A graduated-symbol key for the area channel: three circles at real counts from the
 * data, sitting on a shared baseline so they read as growing.
 *
 * The circles are sized with the plot's own rScale rather than a compressed copy of it,
 * so a circle in the key is exactly the size of a circle in the plot holding that count.
 */
export function renderSizeLegend(
  legend: Selection<SVGGElement, unknown, null, undefined>,
  options: RenderSizeLegendOptions,
) {
  const { maxCount, rScale, baselineY } = options;

  const steps = [...new Set([1, Math.round(maxCount / 2), maxCount])].sort((a, b) => a - b);

  // Lay the circles out left to right, each one clearing the last.
  let cursor = 0;
  const placed = steps.map((count) => {
    const r = rScale(count);
    const cx = cursor + r;
    cursor = cx + r + GAP;
    return { count, r, cx };
  });

  legend
    .selectAll<SVGTextElement, string>('text.legend-caption')
    .data([CAPTION])
    .join('text')
    .attr('class', 'legend-caption')
    .attr('x', 0)
    .attr('y', 0)
    .attr('font-size', CAPTION_FONT_SIZE)
    .attr('fill', MUTED)
    .text((caption) => caption);

  const entries = legend
    .selectAll<SVGGElement, (typeof placed)[number]>('g.legend-entry')
    .data(placed, (entry) => entry.count)
    .join((enter) => {
      const group = enter.append('g').attr('class', 'legend-entry');
      group.append('circle');
      group.append('text');
      return group;
    });

  entries
    .select<SVGCircleElement>('circle')
    .attr('cx', (entry) => entry.cx)
    .attr('cy', (entry) => baselineY - entry.r)
    .attr('r', (entry) => entry.r)
    .attr('fill', SERIES)
    .attr('stroke', SURFACE)
    .attr('stroke-width', 2);

  entries
    .select<SVGTextElement>('text')
    .attr('x', (entry) => entry.cx)
    .attr('y', baselineY + TICK_FONT_SIZE + 4)
    .attr('text-anchor', 'middle')
    .attr('font-size', TICK_FONT_SIZE)
    .attr('font-variant-numeric', 'tabular-nums')
    .attr('fill', MUTED)
    .text((entry) => entry.count);

  // Reported back so the caller can right-align the whole key against the plot edge.
  return { width: Math.max(cursor - GAP, 0) };
}
