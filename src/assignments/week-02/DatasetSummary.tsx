import { useMemo } from 'react';
import { useDataset } from './useDataset';
import {
  profileDataset,
  SCHEMA,
  TYPE_COLOR,
  type AttributeProfile,
  type AttributeType,
} from './profile';

const SOURCE_URL = 'https://www.kaggle.com/datasets/sudarshan24byte/online-food-dataset';

const integer = new Intl.NumberFormat('en-US');
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
// Space attributes are coordinates and IDs, so they never take a thousands separator:
// a pin code is written 560001, not 560,001.
const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4, useGrouping: false });

function formatBytes(bytes: number) {
  return `${Math.round(bytes / 1024)} KB`;
}

function TypeBadge({ type }: { type: AttributeType }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: TYPE_COLOR[type] }}
      />
      <span className="text-xs font-medium text-gray-700">{type}</span>
    </span>
  );
}

function StatTile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="text-2xl font-light tabular-nums text-gray-900">{value}</div>
      <div className="mt-0.5 text-xs font-medium text-gray-700">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-gray-500">{hint}</div>}
    </div>
  );
}

/**
 * Labelled horizontal bars, for attributes with few enough levels to name each one.
 * Counts are direct-labelled, so the encoding never rests on color alone.
 */
function CategoryBars({ profile, color }: { profile: AttributeProfile; color: string }) {
  const max = Math.max(...profile.categories.map((category) => category.count), 1);

  return (
    <div className="space-y-1">
      {profile.categories.map((category) => (
        <div key={category.value} className="flex items-center gap-2">
          <div className="w-36 shrink-0 truncate text-right text-[11px] text-gray-600">
            {category.value || <span className="text-gray-400">(blank)</span>}
          </div>
          <div className="h-3 min-w-0 flex-1">
            <div
              className="h-full rounded-r-[4px]"
              style={{ width: `${(category.count / max) * 100}%`, backgroundColor: color }}
            />
          </div>
          <div className="w-8 shrink-0 text-[11px] tabular-nums text-gray-500">
            {category.count}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compact column histogram, for discrete numeric attributes with many levels. */
function Histogram({ profile, color }: { profile: AttributeProfile; color: string }) {
  const max = Math.max(...profile.categories.map((category) => category.count), 1);
  const { stats } = profile;

  return (
    <div>
      <div className="flex h-14 items-end gap-[2px]">
        {profile.categories.map((category) => (
          <div
            key={category.value}
            className="min-w-[3px] flex-1 rounded-t-[4px] transition-opacity hover:opacity-70"
            style={{ height: `${(category.count / max) * 100}%`, backgroundColor: color }}
            title={`${category.value}: ${category.count} respondents`}
          />
        ))}
      </div>
      {stats && (
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-gray-500">
          <span>{decimal.format(stats.min)}</span>
          <span className="text-gray-600">mean {decimal.format(stats.mean)}</span>
          <span>{decimal.format(stats.max)}</span>
        </div>
      )}
    </div>
  );
}

/** Space attributes get a range readout: bars over 77 coordinates would say nothing. */
function RangeReadout({ profile }: { profile: AttributeProfile }) {
  const { stats } = profile;
  return (
    <div className="text-[11px] text-gray-600">
      <div className="tabular-nums">
        {stats ? `${plain.format(stats.min)} to ${plain.format(stats.max)}` : 'n/a'}
      </div>
      <div className="mt-0.5 text-gray-500">{profile.unique} distinct values</div>
    </div>
  );
}

function Distribution({ profile }: { profile: AttributeProfile }) {
  const color = TYPE_COLOR[profile.spec.type];

  if (profile.spec.type === 'Space') return <RangeReadout profile={profile} />;
  if (profile.categories.length > 8) return <Histogram profile={profile} color={color} />;
  return <CategoryBars profile={profile} color={color} />;
}

function Legend() {
  const types = [...new Set(SCHEMA.map((spec) => spec.type))];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {types.map((type) => (
        <TypeBadge key={type} type={type} />
      ))}
    </div>
  );
}

export function DatasetSummary() {
  const { data, error } = useDataset();
  const profile = useMemo(() => (data ? profileDataset(data.rows, data.columns) : null), [data]);

  if (error) {
    return (
      <div className="p-8 text-sm text-red-700">
        <p className="font-medium">Could not load the dataset.</p>
        <p className="mt-1 text-red-600">{error}</p>
      </div>
    );
  }

  if (!data || !profile) {
    return <div className="p-8 text-sm text-gray-500">Loading dataset…</div>;
  }

  const postalAreas = profile.attributes.find((a) => a.spec.key === 'Pin code')?.unique ?? 0;

  return (
    <div className="h-full w-full overflow-y-auto bg-gray-50">
      <div className="mx-auto max-w-5xl px-8 py-10">
        <header>
          <p className="text-[11px] font-semibold tracking-[0.35em] text-gray-500 uppercase">
            Week 2
          </p>
          <h1 className="mt-1 text-2xl font-light text-gray-900">
            Online food ordering in Bengaluru
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            A survey of online food-delivery customers in Bengaluru, India. One row per respondent,
            covering demographics, delivery area, and whether they ordered again. Parsed in the
            browser from the CSV in <code>public/data/online-food-orders/</code>.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Source:{' '}
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-gray-700"
            >
              Online Food Dataset on Kaggle
            </a>
          </p>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            value={integer.format(profile.rowCount)}
            label="Rows"
            hint="one per respondent"
          />
          <StatTile
            value={integer.format(profile.usableColumnCount)}
            label="Attributes"
            hint={`${profile.columnCount} columns, 1 redundant`}
          />
          <StatTile
            value={integer.format(profile.missingCells)}
            label="Missing cells"
            hint="every cell populated"
          />
          <StatTile
            value={integer.format(postalAreas)}
            label="Postal areas"
            hint={formatBytes(data.bytes)}
          />
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Attributes</h2>
            <Legend />
          </div>

          <div className="mt-3 divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {profile.attributes.map((attribute) => (
              <div
                key={attribute.spec.label}
                className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[15rem_1fr]"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-[13px] text-gray-900">
                    {attribute.spec.label}
                  </div>
                  <div className="mt-1">
                    <TypeBadge type={attribute.spec.type} />
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">{attribute.spec.detail}</div>
                </div>

                <div className="min-w-0">
                  <Distribution profile={attribute} />
                  {attribute.spec.note && (
                    <p className="mt-2 text-[11px] text-gray-500">{attribute.spec.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-gray-900">Data quality</h2>
          <ul className="mt-2 space-y-1.5 text-xs text-gray-600">
            <li>
              <span className="font-medium text-gray-800">
                {profile.duplicateRows} rows duplicate another row.
              </span>{' '}
              Expected rather than corrupt: with this few low-cardinality attributes, two
              respondents collide naturally. Deduping would bias the counts toward unusual
              respondents.
            </li>
            <li>
              <span className="font-medium text-gray-800">
                Negative feedback is stored with a trailing space.
              </span>{' '}
              Values are trimmed on parse, or the grouping would silently split in two.
            </li>
            <li>
              <span className="font-medium text-gray-800">
                Pin code and latitude/longitude are perfectly redundant.
              </span>{' '}
              {postalAreas} postal codes map 1:1 onto {postalAreas} coordinate pairs, so the
              coordinates are area centroids, not household locations.
            </li>
            <li>
              <span className="font-medium text-gray-800">There is no time attribute.</span> No
              order date or timestamp, so every chart from this dataset is cross-sectional.
            </li>
          </ul>
          <p className="mt-3 text-[11px] text-gray-500">
            Full documentation, including the source and the per-attribute type analysis, is in{' '}
            <code>public/data/online-food-orders/README.md</code>.
          </p>
        </section>
      </div>
    </div>
  );
}
