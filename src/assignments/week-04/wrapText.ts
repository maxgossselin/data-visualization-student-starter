/**
 * SVG <text> does not wrap, so a long title just runs off the side of the chart. These
 * helpers measure the real rendered width of a string and greedily break it into lines
 * that fit, which is what keeps the header legible as the viewport narrows.
 */

export const FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// One canvas, reused for every measurement - creating one per call is needlessly slow.
let context: CanvasRenderingContext2D | null = null;

function measure(text: string, fontSize: number, fontWeight: number) {
  if (!context) context = document.createElement('canvas').getContext('2d');
  // No canvas (server render, or a browser that refuses the context): fall back to an
  // average-character-width estimate rather than letting the layout collapse.
  if (!context) return text.length * fontSize * 0.5;
  context.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
  return context.measureText(text).width;
}

export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontWeight = 400,
): string[] {
  if (maxWidth <= 0) return [text];

  const lines: string[] = [];
  let current = '';

  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, fontSize, fontWeight) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  return lines;
}
