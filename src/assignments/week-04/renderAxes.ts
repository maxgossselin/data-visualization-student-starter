import { axisBottom, axisLeft } from 'd3-axis';
import type { Selection } from 'd3-selection';
import type { ScaleLinear } from 'd3-scale';
import { AXIS, GRIDLINE, MUTED } from './palette';

const TICK_FONT_SIZE = 11;

export interface RenderAxesOptions {
  xScale: ScaleLinear<number, number>;
  yScale: ScaleLinear<number, number>;
  visibleAgeTicks: number[];
  familyTicks: number[];
  innerWidth: number;
}

/**
 * The axes group is a React-rendered container. The d3-axis generators fill the
 * positioned x, y, and gridline groups with a domain line and ticks, and then the
 * default black stroke is restyled down to the recessive chrome inks - axes and
 * gridlines should never compete with the marks.
 */
export function renderAxes(
  axes: Selection<SVGGElement, unknown, null, undefined>,
  options: RenderAxesOptions,
) {
  const { xScale, yScale, visibleAgeTicks, familyTicks, innerWidth } = options;

  // Both scales are continuous but only ever land on whole numbers, so the ticks are
  // given explicitly rather than letting d3 choose its own round values.
  axes.select<SVGGElement>('g.x-axis').call(
    axisBottom(xScale)
      .tickValues(visibleAgeTicks)
      .tickFormat((value) => String(value))
      .tickSizeOuter(0),
  );

  axes.select<SVGGElement>('g.y-axis').call(
    axisLeft(yScale)
      .tickValues(familyTicks)
      .tickFormat((value) => String(value))
      .tickSizeOuter(0),
  );

  // One gridline per family size, drawn by reusing the y axis with a tick length that
  // reaches all the way across the plot. Its own domain line and labels are dropped -
  // the real y axis already draws those.
  const grid = axes.select<SVGGElement>('g.grid').call(
    axisLeft(yScale)
      .tickValues(familyTicks)
      .tickSize(-innerWidth)
      .tickFormat(() => ''),
  );
  grid.select('.domain').remove();
  grid.selectAll('.tick line').attr('stroke', GRIDLINE);

  axes.selectAll('g.x-axis .domain, g.y-axis .domain').attr('stroke', AXIS);
  axes.selectAll('g.x-axis .tick line, g.y-axis .tick line').attr('stroke', AXIS);
  axes
    .selectAll('g.x-axis .tick text, g.y-axis .tick text')
    .attr('fill', MUTED)
    .attr('font-size', TICK_FONT_SIZE)
    .attr('font-variant-numeric', 'tabular-nums');
}
