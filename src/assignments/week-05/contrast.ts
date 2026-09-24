/**
 * WCAG relative luminance and contrast ratio.
 *
 * Week 4 printed white numerals inside every circle and checked, once, by hand that
 * white on #256abf cleared the 4.5:1 AA floor. The fill is no longer a constant - the
 * colour legend repaints the marks - so the check has to move into the code. Each
 * series picks its own label ink by measurement, which means a new series colour can
 * never quietly ship an unreadable label.
 *
 * Formula: WCAG 2.2, section 1.4.3.
 */

const channel = (value: number) =>
  value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

function relativeLuminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((offset) =>
    channel(parseInt(hex.slice(offset, offset + 2), 16) / 255),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Whichever of the two inks reads better on this fill. */
export function readableInk(fill: string, light: string, dark: string) {
  return contrastRatio(fill, light) >= contrastRatio(fill, dark) ? light : dark;
}
