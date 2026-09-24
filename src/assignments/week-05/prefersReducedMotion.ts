/**
 * Whether the reader has asked their system for less animation.
 *
 * The chart tweens circles from one group's counts to the next, which is the point of
 * the colour legend - you watch the mass of the data move rather than comparing two
 * pictures from memory. For a reader who is made unwell by motion that is a cost, not
 * a feature, so the same change is delivered as a cut instead. Week 1 already honours
 * this setting for its starfield; this is the same promise applied to the marks.
 */
export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}
