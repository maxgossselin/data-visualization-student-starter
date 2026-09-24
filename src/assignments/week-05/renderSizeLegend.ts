import 'd3-transition';
import type { Selection } from 'd3-selection';
import { MUTED, SURFACE } from '../week-04/palette';
import { TRANSITION_MS } from './renderMarks';

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
  /** The selected group's colour, so the key is drawn in the same ink as the marks. */
  fill: string;
  animate: boolean;
}

/**
 * Week 4's graduated-symbol key, with one change: the circles follow the colour
 * legend. The key has to look like the marks it explains, and the marks are no longer
 * always blue.
 *
 * The steps themselves do not move when the selection changes. The radius scale is
 * pinned to the full dataset, so a circle means the same number of respondents in
 * every state of the chart - rescaling it per filter would make the 12 single
 * respondents in a cell draw at the size the 22 of everyone used to.
 */
export function renderSizeLegend(
  legend: Selection<SVGGElement, unknown, null, undefined>,
  options: RenderSizeLegendOptions,
) {
  const { maxCount, rScale, baselineY, fill, animate } = options;

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
    .attr('stroke', SURFACE)
    .attr('stroke-width', 2)
    .transition('legend')
    .duration(animate ? TRANSITION_MS : 0)
    .attr('fill', fill);

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
