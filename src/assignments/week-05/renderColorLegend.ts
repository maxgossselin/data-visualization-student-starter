import type { Selection as D3Selection } from 'd3-selection';
import { INK_PRIMARY, INK_SECONDARY, MUTED, SURFACE } from '../week-04/palette';
import { measureText } from './measureText';
import type { Selection, Series } from './series';

export const CAPTION = 'Marital status - hover a group to preview it, click to keep it';
const CAPTION_FONT_SIZE = 11;
const LABEL_FONT_SIZE = 12;

// Chip geometry. A chip is a swatch, a label, and the group's size, laid out on one
// line; these are the only numbers the layout needs.
const SWATCH_R = 6;
const SWATCH_GAP = 8;
const COUNT_GAP = 6;
const CHIP_GAP = 24;
const CHIP_HEIGHT = 22;
const ROW_GAP = 8;
const PAD_X = 5;

/** Space between the caption's baseline and the top of the first chip row. */
const CAPTION_GAP = 14;
/** The underline that marks the kept group, plus air beneath it. */
const UNDERLINE_OFFSET = 2;
const UNDERLINE_HEIGHT = 2;

export interface LegendDatum {
  series: Series;
  /** Respondents in this group, counted from the data. */
  total: number;
}

export interface LegendChip extends LegendDatum {
  x: number;
  y: number;
  width: number;
  labelWidth: number;
}

export interface LegendLayout {
  chips: LegendChip[];
  /** Height from the caption's baseline to the bottom of the last chip row. */
  height: number;
}

/**
 * Lays the chips out left to right, wrapping to a new row when the next one would
 * run past `maxWidth`.
 *
 * Kept separate from the drawing so the component can call it during render: the top
 * margin depends on how many rows the legend takes, and the margin has to be settled
 * before the scales exist.
 */
export function layoutLegend(entries: LegendDatum[], maxWidth: number): LegendLayout {
  let x = 0;
  let row = 0;

  const chips = entries.map((entry) => {
    const labelWidth = measureText(entry.series.label, LABEL_FONT_SIZE);
    const countWidth = measureText(String(entry.total), LABEL_FONT_SIZE, 600);
    const width = 2 * SWATCH_R + SWATCH_GAP + labelWidth + COUNT_GAP + countWidth;

    if (x > 0 && x + width > maxWidth) {
      row += 1;
      x = 0;
    }

    const chip = { ...entry, x, y: row * (CHIP_HEIGHT + ROW_GAP), width, labelWidth };
    x += width + CHIP_GAP;
    return chip;
  });

  const rows = row + 1;
  return {
    chips,
    height:
      CAPTION_GAP + rows * CHIP_HEIGHT + (rows - 1) * ROW_GAP + UNDERLINE_OFFSET + UNDERLINE_HEIGHT,
  };
}

export interface RenderColorLegendOptions {
  chips: LegendChip[];
  /** The group currently drawn in the plot - the kept one, or the one being previewed. */
  active: Selection;
  /** The group that stays when the pointer leaves. */
  pinned: Selection;
  onPreview: (key: Selection | null) => void;
  onPin: (key: Selection) => void;
}

/**
 * The interactive colour legend: the week's new interaction.
 *
 * It is a control, not a caption, and it does two different jobs with the same four
 * chips. Pointing at one *previews* that group - the marks retarget immediately and
 * snap back when the pointer leaves - so the whole attribute can be read by sweeping
 * along the row without committing to anything. Clicking *keeps* it, and clicking it
 * again returns to everyone.
 *
 * It lives inside the SVG rather than beside it as HTML buttons, which costs some
 * platform behaviour and has to be paid back by hand (the chips carry their own
 * tabindex, role, aria-pressed, and focus ring below). The reason is Week 4's rule
 * that this chart has to explain itself as an image: exporting the SVG has to take
 * the key with it.
 */
export function renderColorLegend(
  legend: D3Selection<SVGGElement, unknown, null, undefined>,
  options: RenderColorLegendOptions,
) {
  const { chips, active, pinned, onPreview, onPin } = options;

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
    .selectAll<SVGGElement, LegendChip>('g.legend-chip')
    .data(chips, (chip) => chip.series.key)
    .join((enter) => {
      const group = enter.append('g').attr('class', 'legend-chip');
      group.append('rect').attr('class', 'chip-underline');
      group.append('circle').attr('class', 'chip-swatch');
      group.append('text').attr('class', 'chip-label');
      group.append('text').attr('class', 'chip-count');
      group.append('rect').attr('class', 'chip-hit');
      return group;
    })
    .attr('transform', (chip) => `translate(${chip.x},${chip.y + CAPTION_GAP})`);

  const centreY = CHIP_HEIGHT / 2;

  // The kept group is underlined in its own colour at full weight; a previewed one is
  // underlined faintly, so "what I am looking at" and "what I will still be looking at
  // in a moment" stay distinguishable.
  entries
    .select<SVGRectElement>('rect.chip-underline')
    .attr('x', 0)
    .attr('y', CHIP_HEIGHT + UNDERLINE_OFFSET)
    .attr('width', (chip) => chip.width)
    .attr('height', UNDERLINE_HEIGHT)
    .attr('fill', (chip) => chip.series.fill)
    .attr('opacity', (chip) =>
      chip.series.key === pinned ? 1 : chip.series.key === active ? 0.35 : 0,
    );

  entries
    .select<SVGCircleElement>('circle.chip-swatch')
    .attr('cx', SWATCH_R)
    .attr('cy', centreY)
    .attr('r', SWATCH_R)
    .attr('fill', (chip) => chip.series.fill)
    .attr('stroke', SURFACE)
    .attr('stroke-width', 1);

  entries
    .select<SVGTextElement>('text.chip-label')
    .attr('x', 2 * SWATCH_R + SWATCH_GAP)
    .attr('y', centreY)
    .attr('dominant-baseline', 'central')
    .attr('font-size', LABEL_FONT_SIZE)
    .attr('fill', (chip) => (chip.series.key === active ? INK_PRIMARY : INK_SECONDARY))
    .text((chip) => chip.series.label);

  entries
    .select<SVGTextElement>('text.chip-count')
    .attr('x', (chip) => 2 * SWATCH_R + SWATCH_GAP + chip.labelWidth + COUNT_GAP)
    .attr('y', centreY)
    .attr('dominant-baseline', 'central')
    .attr('font-size', LABEL_FONT_SIZE)
    .attr('font-weight', 600)
    .attr('font-variant-numeric', 'tabular-nums')
    .attr('fill', (chip) => (chip.series.key === active ? INK_PRIMARY : MUTED))
    .text((chip) => chip.total);

  // One transparent rect per chip carries every event and every accessibility
  // attribute, so the hit target is the whole chip rather than the 12px swatch.
  entries
    .select<SVGRectElement>('rect.chip-hit')
    .attr('x', -PAD_X)
    .attr('y', 0)
    .attr('width', (chip) => chip.width + 2 * PAD_X)
    .attr('height', CHIP_HEIGHT)
    .attr('rx', 4)
    .attr('fill', 'transparent')
    .attr('stroke', 'none')
    .attr('stroke-width', 2)
    .attr('cursor', 'pointer')
    // The chip draws its own focus ring below, in the chart's ink rather than the
    // browser's accent colour - so the native one is turned off to avoid two rings.
    .style('outline', 'none')
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-pressed', (chip) => String(chip.series.key === pinned))
    .attr(
      'aria-label',
      (chip) =>
        `${chip.series.label}, ${chip.total} respondents. ${
          chip.series.key === pinned ? 'Currently shown.' : 'Show this group.'
        }`,
    )
    .on('pointerenter', (_event, chip) => onPreview(chip.series.key))
    .on('pointerleave', () => onPreview(null))
    .on('click', (_event, chip) => onPin(chip.series.key))
    // Tabbing to a chip previews it, exactly as pointing at it does, so the legend
    // reads the same way from the keyboard. The ring itself is a CSS rule in
    // index.css - see the note there for why it cannot be set here.
    .on('focus', (_event, chip) => onPreview(chip.series.key))
    .on('blur', () => onPreview(null))
    .on('keydown', function (event: KeyboardEvent, chip) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      // Space would otherwise scroll the page out from under the chart.
      event.preventDefault();
      onPin(chip.series.key);
    });
}
