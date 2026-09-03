import type { Row } from './useDataset';

/**
 * Attribute types, in the vocabulary of the assignment. "Space" covers both the
 * geographic IDs and the lat/long coordinates; this dataset has no time attribute
 * at all, so there is no matching "Time" member.
 */
export type AttributeType = 'Categorical' | 'Ordinal' | 'Quantitative' | 'Space' | 'Redundant';

/** Validated categorical palette - see public/data/online-food-orders/README.md. */
export const TYPE_COLOR: Record<AttributeType, string> = {
  Categorical: '#2a78d6',
  Ordinal: '#eb6834',
  Quantitative: '#1baf7a',
  Space: '#4a3aa7',
  Redundant: '#8a8880',
};

export interface AttributeSpec {
  /** Column name exactly as it appears in the CSV header. */
  key: string;
  label: string;
  type: AttributeType;
  /** The sub-type, e.g. "nominal, 2 levels" or "geographic ID". */
  detail: string;
  /** Low-to-high ordering for ordinal attributes; sorts the distribution bars. */
  order?: string[];
  note?: string;
}

// Types are semantic, not inferrable: "Pin code" is stored as a number but is a
// geographic ID, and the income bands are text but are ordered. So they are declared.
export const SCHEMA: AttributeSpec[] = [
  {
    key: 'Age',
    label: 'Age',
    type: 'Quantitative',
    detail: 'discrete, ratio (years)',
    note: 'Skewed young: 60% of respondents are 22 to 26.',
  },
  { key: 'Gender', label: 'Gender', type: 'Categorical', detail: 'nominal, 2 levels' },
  {
    key: 'Marital Status',
    label: 'Marital Status',
    type: 'Categorical',
    detail: 'nominal, 3 levels',
    note: '"Prefer not to say" is a non-response sentinel, not a third marital state.',
  },
  {
    key: 'Occupation',
    label: 'Occupation',
    type: 'Categorical',
    detail: 'nominal, 4 levels',
    note: '"Self Employeed" is misspelled in the source data; kept as-is.',
  },
  {
    key: 'Monthly Income',
    label: 'Monthly Income',
    type: 'Ordinal',
    detail: 'binned quantitative, 5 levels (rupees/month)',
    order: ['No Income', 'Below Rs.10000', '10001 to 25000', '25001 to 50000', 'More than 50000'],
    note: 'Bands are unequal and the top one is open-ended, so encode as ordinal, never as a number.',
  },
  {
    key: 'Educational Qualifications',
    label: 'Educational Qualifications',
    type: 'Ordinal',
    detail: 'ranked by attainment, 5 levels',
    order: ['Uneducated', 'School', 'Graduate', 'Post Graduate', 'Ph.D'],
    note: 'Both extremes are tiny, so beware of rates computed on n=2.',
  },
  {
    key: 'Family size',
    label: 'Family size',
    type: 'Quantitative',
    detail: 'discrete count, ratio (people)',
    note: 'With only six distinct values it reads equally well as ordinal.',
  },
  {
    key: 'Customer Type',
    label: 'Customer Type',
    type: 'Ordinal',
    detail: 'ordered by frequency, 3 levels',
    order: ['New', 'Regular', 'Frequent'],
    note: 'The source does not define the frequency cutoffs.',
  },
  {
    key: 'latitude',
    label: 'latitude',
    type: 'Space',
    detail: 'geographic coordinate, decimal degrees N (WGS 84)',
  },
  {
    key: 'longitude',
    label: 'longitude',
    type: 'Space',
    detail: 'geographic coordinate, decimal degrees E (WGS 84)',
  },
  {
    key: 'Pin code',
    label: 'Pin code',
    type: 'Space',
    detail: 'geographic ID, Indian postal code',
    note: 'Numeric but not quantitative: 560076 is not "more" than 560038.',
  },
  {
    key: 'Output',
    label: 'Output',
    type: 'Categorical',
    detail: 'binary, the target variable',
    note: 'Whether the respondent ordered online again.',
  },
  { key: 'Feedback', label: 'Feedback', type: 'Categorical', detail: 'binary' },
  {
    key: '',
    label: '(unnamed)',
    type: 'Redundant',
    detail: 'export artifact, drop on load',
    note: 'The header line ends in a trailing comma. Identical to Output in all 388 rows.',
  },
];

export interface Category {
  value: string;
  count: number;
}

export interface AttributeProfile {
  spec: AttributeSpec;
  unique: number;
  missing: number;
  /** Empty for Space attributes, which are summarised by their range instead. */
  categories: Category[];
  stats?: { min: number; max: number; mean: number };
}

/** Attributes shown as distribution bars rather than as a numeric range. */
function isBinned(spec: AttributeSpec) {
  return spec.type !== 'Space';
}

export function profileAttribute(rows: Row[], spec: AttributeSpec): AttributeProfile {
  const values = rows.map((row) => row[spec.key] ?? '');
  const counts = new Map<string, number>();
  let missing = 0;

  for (const value of values) {
    if (value === '') missing += 1;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const numbers = values.map(Number).filter((n) => Number.isFinite(n));
  const stats =
    values.length > 0 && numbers.length === values.length
      ? {
          min: Math.min(...numbers),
          max: Math.max(...numbers),
          mean: numbers.reduce((sum, n) => sum + n, 0) / numbers.length,
        }
      : undefined;

  let categories: Category[] = [];
  if (isBinned(spec)) {
    categories = [...counts].map(([value, count]) => ({ value, count }));
    if (spec.order) {
      // Ordinal: keep the declared low-to-high order so the bars read as a scale.
      const rank = new Map(spec.order.map((value, index) => [value, index]));
      categories.sort((a, b) => (rank.get(a.value) ?? 99) - (rank.get(b.value) ?? 99));
    } else if (stats) {
      // Discrete quantitative: order by magnitude, so the bars read as a histogram.
      categories.sort((a, b) => Number(a.value) - Number(b.value));
    } else {
      categories.sort((a, b) => b.count - a.count);
    }
  }

  return { spec, unique: counts.size, missing, categories, stats };
}

export interface DatasetProfile {
  attributes: AttributeProfile[];
  rowCount: number;
  columnCount: number;
  /** Columns excluding the redundant unnamed one. */
  usableColumnCount: number;
  missingCells: number;
  duplicateRows: number;
}

export function profileDataset(rows: Row[], columns: string[]): DatasetProfile {
  const attributes = SCHEMA.map((spec) => profileAttribute(rows, spec));
  // Join on a control character so two different field splits can never collide.
  const seen = new Set(rows.map((row) => columns.map((column) => row[column]).join('\u0001')));

  return {
    attributes,
    rowCount: rows.length,
    columnCount: columns.length,
    usableColumnCount: SCHEMA.filter((spec) => spec.type !== 'Redundant').length,
    missingCells: attributes.reduce((sum, attribute) => sum + attribute.missing, 0),
    duplicateRows: rows.length - seen.size,
  };
}
