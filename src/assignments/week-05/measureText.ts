import { FONT_FAMILY } from '../week-04/wrapText';

/**
 * Measures a string at the chart's own font, the same way `wrapText` does for the
 * title. The colour legend needs it for the same reason the title does: chip widths
 * decide how many rows the legend takes, and the top margin has to be known before
 * anything is drawn, so the answer cannot come from measuring rendered nodes.
 */

// One canvas, reused for every measurement.
let context: CanvasRenderingContext2D | null = null;

export function measureText(text: string, fontSize: number, fontWeight = 400) {
  if (!context) context = document.createElement('canvas').getContext('2d');
  // No canvas (server render, or a browser that refuses the context): fall back to an
  // average-character-width estimate rather than letting the layout collapse.
  if (!context) return text.length * fontSize * 0.5;
  context.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
  return context.measureText(text).width;
}
