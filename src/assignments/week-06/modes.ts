import { INK_PRIMARY, LABEL_ON_SERIES } from '../week-04/palette';
import { readableInk } from '../week-05/contrast';

/**
 * The three modes the V1 covers, and the colours they wear.
 *
 * Why three and not the five the project document names: a line chart puts every
 * series next to every other one, so the palette has to clear its separation floors
 * on all pairs rather than only on neighbours. The validated categorical palette this
 * repo has used since Week 2 holds three slots to that standard (worst pair under
 * simulated colour-vision deficiency dE 9.2, normal vision 25.5; floors are 8 and 15).
 * Bus and Citi Bike are therefore deferred rather than squeezed in - a fourth hue here
 * would put two confusable colours on the same axes, and the whole point of this chart
 * is telling two lines apart at the hour they cross.
 *
 * Orange for the street-hail taxi is as close to a cab's yellow as the palette gets
 * without reaching for a step that fails against the surface.
 */

export const MODE_KEYS = ['subway', 'taxi', 'fhv'] as const;
export type Mode = (typeof MODE_KEYS)[number];

export interface ModeSeries {
  key: Mode;
  label: string;
  /** What the number actually counts, for the tooltip and the method note. */
  unit: string;
  fill: string;
  ink: string;
}

const FILLS: Record<Mode, string> = {
  subway: '#256abf',
  taxi: '#eb6834',
  fhv: '#1baf7a',
};

const LABELS: Record<Mode, { label: string; unit: string }> = {
  subway: { label: 'Subway', unit: 'turnstile entries' },
  taxi: { label: 'Taxi', unit: 'yellow and green pickups' },
  fhv: { label: 'For-hire', unit: 'Uber and Lyft pickups' },
};

export const MODE_SERIES: ModeSeries[] = MODE_KEYS.map((key) => ({
  key,
  ...LABELS[key],
  fill: FILLS[key],
  ink: readableInk(FILLS[key], LABEL_ON_SERIES, INK_PRIMARY),
}));

const BY_KEY = new Map(MODE_SERIES.map((series) => [series.key, series]));

export function modeSeries(key: Mode): ModeSeries {
  return BY_KEY.get(key) ?? MODE_SERIES[0];
}
