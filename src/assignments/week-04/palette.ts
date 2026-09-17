/**
 * Chart chrome and ink from the same validated palette used in Week 2 and Week 3.
 *
 * The one change since Week 3: the mark fill moved one step darker on the blue ramp,
 * from #2a78d6 to #256abf. Every circle now carries a white count label inside it, and
 * white on #2a78d6 is only 4.42:1 - under the 4.5:1 WCAG AA floor for normal text.
 * #256abf clears it at 5.39:1 and still reads as the same blue.
 */
export const SERIES = '#256abf';
export const SURFACE = '#ffffff';
export const GRIDLINE = '#e1e0d9';
export const AXIS = '#c3c2b7';
export const MUTED = '#898781';
export const INK_PRIMARY = '#0b0b0b';
export const INK_SECONDARY = '#52514e';
export const LABEL_ON_SERIES = '#ffffff';
