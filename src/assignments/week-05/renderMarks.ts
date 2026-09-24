import 'd3-transition';
import { select } from 'd3-selection';
import type { Selection as D3Selection } from 'd3-selection';
import type { ScaleLinear } from 'd3-scale';
import { AXIS, INK_PRIMARY, SURFACE } from '../week-04/palette';
import { LABEL_FONT_SIZE, labelFits } from '../week-04/renderMarks';
import { countIn, type Cell } from './aggregate';
import { seriesFor, type Selection } from './series';

const RING_WIDTH = 2;
const TOTAL_RING_WIDTH = 1;

// A minimum hover target, so the single-respondent circles are still easy to hit.
// Measured on the cell's total, not on the selected subset: a target that shrank when
// you filtered would make the emptied cells unqueryable, which is the moment you most
// want to ask what used to be there.
const MIN_HOVER_RADIUS = 12;

/** Long enough to follow a circle from one size to the next, short enough to sweep. */
export const TRANSITION_MS = 450;

export interface RenderMarksOptions {
  data: Cell[];
  xScale: ScaleLinear<number, number>;
  yScale: ScaleLinear<number, number>;
  rScale: (count: number) => number;
  /** The group the legend has selected. */
  active: Selection;
  /** Animate the change. False on resize, where a tween is just lag. */
  animate: boolean;
  onHover: (cell: Cell | null) => void;
}

export function renderMarks(
  marks: D3Selection<SVGGElement, unknown, null, undefined>,
  options: RenderMarksOptions,
) {
  const { data, xScale, yScale, rScale, active, animate, onHover } = options;
  const series = seriesFor(active);
  const duration = animate ? TRANSITION_MS : 0;

  // rScale floors small counts at 2px so a lone respondent stays visible. A cell with
  // nobody in the selected group is a different thing from a cell with one, and has to
  // vanish rather than bottom out at that floor.
  const radius = (cell: Cell) => {
    const count = countIn(cell, active);
    return count === 0 ? 0 : rScale(count);
  };

  const cells = marks
    .selectAll<SVGGElement, Cell>('g.cell')
    .data(data, (cell) => `${cell.age}:${cell.family}`)
    .join((enter) => {
      const group = enter.append('g').attr('class', 'cell');
      group.append('circle').attr('class', 'total-ring');
      group.append('circle').attr('class', 'bubble');
      group.append('text').attr('class', 'count-label');
      group.append('circle').attr('class', 'hover-target');
      return group;
    })
    .attr('transform', (cell) => `translate(${xScale(cell.age)},${yScale(cell.family)})`);

  /*
   * The outline is everyone at this age and family size, and it never moves. Filtering
   * a chart normally destroys the thing you are comparing against - the survivors get
   * smaller and you have no idea against what - so the total stays on screen as an
   * empty ring and the selected group is drawn inside it. Share becomes a direct
   * comparison of two concentric areas rather than a memory test.
   *
   * With everyone selected the filled circle covers the ring exactly, so it only shows
   * up once there is something to say.
   */
  cells
    .select<SVGCircleElement>('circle.total-ring')
    .attr('r', (cell) => rScale(cell.count))
    .attr('fill', 'none')
    .attr('stroke', AXIS)
    .attr('stroke-width', TOTAL_RING_WIDTH)
    .attr('pointer-events', 'none');

  cells
    .select<SVGCircleElement>('circle.bubble')
    .attr('stroke', SURFACE)
    .transition('legend')
    .duration(duration)
    .attr('r', radius)
    .attr('fill', series.fill)
    // Dropped with the circle, or an emptied cell leaves a 2px white dot behind.
    .attr('stroke-width', (cell) => (radius(cell) > 0 ? RING_WIDTH : 0));

  /*
   * Text cannot be tweened, so the label fades out at the old count, swaps, and fades
   * back in at the new one - which also hides the instant where a shrinking circle is
   * briefly too small for the numerals it is still carrying.
   *
   * The ink is whatever clears 4.5:1 on this series' fill: white on the blue and the
   * slate, near-black on the orange and the aqua. See contrast.ts.
   */
  cells
    .select<SVGTextElement>('text.count-label')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', LABEL_FONT_SIZE)
    .attr('font-weight', 600)
    .attr('font-variant-numeric', 'tabular-nums')
    .attr('pointer-events', 'none')
    .transition('legend')
    .duration(duration / 2)
    .attr('opacity', 0)
    .transition()
    .duration(duration / 2)
    .attr('fill', series.ink)
    .attr('opacity', 1)
    .text((cell) => {
      const count = countIn(cell, active);
      return count > 0 && labelFits(count, radius(cell)) ? count : '';
    });

  cells
    .select<SVGCircleElement>('circle.hover-target')
    .attr('r', (cell) => Math.max(rScale(cell.count), MIN_HOVER_RADIUS))
    .attr('fill', 'transparent')
    .on('mouseenter', function (_event, cell) {
      // Handled here rather than through React state: highlighting is a direct
      // response to a DOM event, and routing it through a re-render would rebuild all
      // 70 marks on every mouse move. Both rings darken, so a cell the current filter
      // has emptied still answers when you point at it.
      const group = select(this.parentNode as SVGGElement);
      group.select('circle.bubble').attr('stroke', INK_PRIMARY);
      group.select('circle.total-ring').attr('stroke', INK_PRIMARY);
      onHover(cell);
    })
    .on('mouseleave', function () {
      const group = select(this.parentNode as SVGGElement);
      group.select('circle.bubble').attr('stroke', SURFACE);
      group.select('circle.total-ring').attr('stroke', AXIS);
      onHover(null);
    });
}
