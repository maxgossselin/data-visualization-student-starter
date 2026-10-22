/**
 * The whole dataset behind Ferdio's "1 dataset, 100 visualizations": UNESCO World
 * Heritage sites in the three Scandinavian countries, counted in 2004 and in 2022.
 *
 * Six numbers, typed in by hand from the project's own dataset page rather than loaded
 * from a file - a CSV would be more ceremony than data. The counts are Ferdio's; they
 * agree with UNESCO's World Heritage List for those years (Denmark's includes Greenland
 * and the Faroe Islands, which is how UNESCO files them).
 */

export const YEARS = [2004, 2022] as const;
export type Year = (typeof YEARS)[number];

export const COUNTRY_KEYS = ['SE', 'NO', 'DK'] as const;
export type CountryKey = (typeof COUNTRY_KEYS)[number];

export interface Country {
  key: CountryKey;
  name: string;
  sites: Record<Year, number>;
  /**
   * Sampled from the reference PNG, not chosen: these are the three most common
   * non-white pixels in Ferdio's image once its palette is decoded.
   */
  fill: string;
}

export const COUNTRIES: Country[] = [
  { key: 'SE', name: 'Sweden', sites: { 2004: 13, 2022: 15 }, fill: '#3274d8' },
  { key: 'NO', name: 'Norway', sites: { 2004: 5, 2022: 8 }, fill: '#283250' },
  { key: 'DK', name: 'Denmark', sites: { 2004: 4, 2022: 10 }, fill: '#ee5440' },
];

/** The reference's one grey, used for every piece of text that is not on a band. */
export const LABEL_INK = '#7a8092';
/** The two year rules. */
export const RULE = '#c4cdd2';
export const ON_BAND_INK = '#ffffff';
