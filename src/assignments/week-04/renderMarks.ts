import { select } from 'd3-selection';
import type { Selection } from 'd3-selection';
import type { ScaleLinear } from 'd3-scale';
import type { Cell } from './aggregate';
import { INK_PRIMARY, LABEL_ON_SERIES, SERIES, SURFACE } from './palette';

export const LABEL_FONT_SIZE = 10;

// A 2px surface ring keeps neighbouring circles from reading as one blob. It is centred
// on the circle's edge, so it eats half its width inward - ignoring that is what makes a
// label look like it is touching the rim.
const RING_WIDTH = 2;
const RING_INSET = RING_WIDTH / 2;

// Approximate text metrics for the tabular digits the labels are drawn in, as a share
// of the font size. Used to decide whether a label fits - close enough, and far cheaper
// than measuring 70 text nodes on every resize.
const DIGIT_ADVANCE = 0.55;
const CAP_HEIGHT = 0.72;
const LABEL_BREATHING_ROOM = 1.5;

// A minimum hover target, so the single-respondent circles are still easy to hit.
const MIN_HOVER_RADIUS = 12;

/**
 * Peer feedback on the Week 3 version: "I don't entirely understand why only the
 * circles for 22 respondents have labels. It seems like there's room for labels in most
 * other circles as well."
 *
 * That was right - Week 3 only labelled the single largest count, which meant 2 of the
 * 70 circles. The rule is now geometric rather than arbitrary: a circle gets its count
 * printed inside whenever the label actually fits, which is every circle on a
 * full-width screen. The test is the diagonal from the circle's centre to the corner of
 * the text's bounding box, which is what has to clear the radius.
 */
export function labelFits(count: number, radius: number) {
  const digits = String(count).length;
  const halfWidth = (digits * DIGIT_ADVANCE * LABEL_FONT_SIZE) / 2;
  const halfHeight = (CAP_HEIGHT * LABEL_FONT_SIZE) / 2;
  return Math.hypot(halfWidth, halfHeight) + LABEL_BREATHING_ROOM + RING_INSET <= radius;
}

export interface RenderMarksOptions {
  data: Cell[];
  xScale: ScaleLinear<number, number>;
  yScale: ScaleLinear<number, number>;
  rScale: (count: number) => number;
  onHover: (cell: Cell | null) => void;
}

export function renderMarks(
  marks: Selection<SVGGElement, unknown, null, undefined>,
  options: RenderMarksOptions,
) {
  const { data, xScale, yScale, rScale, onHover } = options;

  const cells = marks
    .selectAll<SVGGElement, Cell>('g.cell')
    .data(data, (cell) => `${cell.age}:${cell.family}`)
    .join((enter) => {
      const group = enter.append('g').attr('class', 'cell');
      group.append('circle').attr('class', 'bubble');
      group.append('text').attr('class', 'count-label');
      group.append('circle').attr('class', 'hover-target');
      return group;
    })
    .attr('transform', (cell) => `translate(${xScale(cell.age)},${yScale(cell.family)})`);

  cells
    .select<SVGCircleElement>('circle.bubble')
    .attr('r', (cell) => rScale(cell.count))
    .attr('fill', SERIES)
    .attr('stroke', SURFACE)
    .attr('stroke-width', RING_WIDTH);

  cells
    .select<SVGTextElement>('text.count-label')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', LABEL_FONT_SIZE)
    .attr('font-weight', 600)
    .attr('font-variant-numeric', 'tabular-nums')
    .attr('fill', LABEL_ON_SERIES)
    .attr('pointer-events', 'none')
    .text((cell) => (labelFits(cell.count, rScale(cell.count)) ? cell.count : ''));

  cells
    .select<SVGCircleElement>('circle.hover-target')
    .attr('r', (cell) => Math.max(rScale(cell.count), MIN_HOVER_RADIUS))
    .attr('fill', 'transparent')
    .on('mouseenter', function (_event, cell) {
      // Handled here rather than through React state: highlighting is a direct
      // response to a DOM event, and routing it through a re-render would rebuild all
      // 70 marks on every mouse move. The hovered circle swaps its white ring for a
      // dark one - dimming the others instead would wash out the white count labels.
      select(this.parentNode as SVGGElement)
        .select('circle.bubble')
        .attr('stroke', INK_PRIMARY);
      onHover(cell);
    })
    .on('mouseleave', function () {
      select(this.parentNode as SVGGElement)
        .select('circle.bubble')
        .attr('stroke', SURFACE);
      onHover(null);
    });
}
