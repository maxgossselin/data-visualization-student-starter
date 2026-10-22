import { useState } from 'react';
import { COUNTRIES, type CountryKey } from './heritage';
import { SortedStreamChart } from './SortedStreamChart';

const REFERENCE = {
  page: 'https://100.datavizproject.com/data-type/viz42/',
  image: 'https://100.datavizproject.com/wp-content/uploads/viz/viz-42.png',
  project: 'https://100.datavizproject.com/',
  studio: 'https://ferdio.com/',
};

const ORDERINGS = [
  { sorted: true, label: 'Sorted each year' },
  { sorted: false, label: 'Fixed 2004 order' },
];

export function SortedStreamPlot() {
  const [sorted, setSorted] = useState(true);
  const [highlighted, setHighlighted] = useState<CountryKey | null>(null);

  return (
    <div className="h-full w-full overflow-y-auto bg-gray-50">
      <div className="mx-auto max-w-5xl px-8 py-8">
        <p className="text-[11px] font-semibold tracking-[0.35em] text-gray-500 uppercase">
          Week 7 · Recreating a reference
        </p>

        <section className="mt-3 rounded-lg border border-gray-200 bg-white p-6">
          <h1 className="max-w-3xl text-lg leading-snug font-semibold text-gray-900">
            Denmark overtook Norway in World Heritage sites, and the sorted stream makes the pass
            the event
          </h1>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-gray-600">
            A rebuild of visualization #42 from Ferdio&rsquo;s{' '}
            <a
              href={REFERENCE.project}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-gray-900"
            >
              1 dataset. 100 visualizations.
            </a>{' '}
            Each year&rsquo;s column stacks the three countries largest first, so a country that
            changes rank has to cross another to get to its new place. Ferdio&rsquo;s own note on
            it: &ldquo;Because it is sorted, the switch of Denmark and Norway ends up getting a lot
            of attention.&rdquo; The toggle shows the same data without the sort.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div
              className="inline-flex rounded-md border border-gray-300 p-0.5"
              role="group"
              aria-label="Band order"
            >
              {ORDERINGS.map((ordering) => (
                <button
                  key={ordering.label}
                  type="button"
                  onClick={() => setSorted(ordering.sorted)}
                  aria-pressed={sorted === ordering.sorted}
                  className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                    sorted === ordering.sorted
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {ordering.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4" role="group" aria-label="Countries">
              {COUNTRIES.map((country) => (
                <button
                  key={country.key}
                  type="button"
                  onMouseEnter={() => setHighlighted(country.key)}
                  onMouseLeave={() => setHighlighted(null)}
                  onFocus={() => setHighlighted(country.key)}
                  onBlur={() => setHighlighted(null)}
                  className="flex items-center gap-2 text-xs text-gray-600 transition-opacity hover:text-gray-900"
                  style={{ opacity: highlighted && highlighted !== country.key ? 0.4 : 1 }}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: country.fill }}
                  />
                  {country.name}
                  <span className="text-gray-400">{country.key}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mx-auto mt-4 max-w-md">
            <SortedStreamChart
              sorted={sorted}
              highlighted={highlighted}
              onHighlight={setHighlighted}
            />
          </div>

          <p className="mt-3 max-w-3xl text-[11px] leading-relaxed text-gray-500">
            <span className="font-medium text-gray-700">What it trades away.</span> Two time points
            is the least a stream graph can have, so the curve between the rules is decoration: it
            shows no year between 2004 and 2022, and where Denmark crosses Norway says nothing about
            when it actually passed it. The bands are honest only at the two rules, which is why the
            counts are printed there.
          </p>
        </section>

        <p className="mt-3 text-xs text-gray-500">
          Reference:{' '}
          <a
            href={REFERENCE.page}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-gray-700"
          >
            Data Viz Project, visualization #42
          </a>{' '}
          by{' '}
          <a
            href={REFERENCE.studio}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-gray-700"
          >
            Ferdio
          </a>{' '}
          (
          <a
            href={REFERENCE.image}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-gray-700"
          >
            original image
          </a>
          ). Rebuilt in React and D3 from the published image; no source code was available.
        </p>
      </div>
    </div>
  );
}
