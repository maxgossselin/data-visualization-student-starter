# Online Food Ordering — Bengaluru Customer Survey

## What this dataset is

A survey of **388 online food-delivery customers in Bengaluru (Bangalore), India**. Each row is
one respondent. The columns cover who they are (age, gender, marital status, occupation, income
band, education, household size), where they are (latitude/longitude and postal code of their
delivery area), how they use the service (customer type), and how it went (whether they ordered
again, and whether their feedback was positive or negative).

It is real survey data, not synthetic. It is small — 388 rows, 39 KB — but unusually well suited
to teaching: it mixes categorical, ordinal, quantitative, and geographic attributes in a single
flat table, with no time dimension at all (see [Missing dimensions](#missing-dimensions)).

The natural questions it supports: does income band or household size predict repeat ordering?
Is negative feedback concentrated in particular postal codes? Do students and salaried employees
behave differently?

## Source

- **Platform:** Kaggle — _Online Food Dataset_, uploaded by Sudarshan Nagarajan
  (<https://www.kaggle.com/datasets/sudarshan24byte/online-food-dataset>)
- **File in this repo:** `online-food-orders.csv` (downloaded copy, renamed; contents unmodified)
- **License:** as stated on the Kaggle dataset page
- **Downloaded:** August 2025

> **Provenance note.** This copy carries a `Customer Type` column that is not present in the
> base Kaggle upload, so it is likely a re-upload or lightly extended variant of that dataset.
> The other thirteen columns match the original exactly. Confirm the precise source URL before
> citing it.

## Shape

| | |
| --- | --- |
| Rows | 388 |
| Columns | 14 (13 meaningful + 1 unnamed duplicate) |
| File size | 39 KB |
| Missing values | none — every cell is populated |
| Geographic extent | Bengaluru, India (12.865–13.102 °N, 77.484–77.758 °E) |
| Time extent | none — the dataset is a single undated snapshot |

## Attribute analysis

| # | Attribute | Type | Values / range | Notes |
| --- | --- | --- | --- | --- |
| 1 | `Age` | **Quantitative** (discrete, ratio) | 18–33, mean 24.6 | Whole years. Heavily skewed young — 60% are 22–26, consistent with a student-dominated sample. |
| 2 | `Gender` | **Categorical** (nominal, 2) | Male (222), Female (166) | Binary as collected; no other options were offered. |
| 3 | `Marital Status` | **Categorical** (nominal, 3) | Single (268), Married (108), Prefer not to say (12) | "Prefer not to say" is a **non-response sentinel**, not a third marital state — treat it as missing, don't rank it. |
| 4 | `Occupation` | **Categorical** (nominal, 4) | Student (207), Employee (118), Self Employeed (54), House wife (9) | "Self Employeed" is misspelled in the source data; kept as-is. |
| 5 | `Monthly Income` | **Ordinal** (5 levels) | No Income (187) < Below Rs.10000 (25) < 10001 to 25000 (45) < 25001 to 50000 (69) < More than 50000 (62) | **Binned quantitative.** Rupees per month. The bands are unequal and the top one is open-ended, so encode it on an ordinal scale, never as a number. "No Income" is a genuine floor (mostly students), not missing data. |
| 6 | `Educational Qualifications` | **Ordinal** (5 levels) | Uneducated (2) < School (12) < Graduate (177) < Post Graduate (174) < Ph.D (23) | Ranked by attainment. The two extremes are tiny — beware of per-category rates computed on n=2. |
| 7 | `Family size` | **Quantitative** (discrete count, ratio) | 1–6, mode 3 | Number of people in the household. With only six distinct values it reads equally well as ordinal. |
| 8 | `Customer Type` | **Ordinal** (3 levels) | New (24) < Regular (218) < Frequent (146) | Ordered by ordering frequency. The source does not define the frequency cutoffs. |
| 9 | `latitude` | **Space** — geographic coordinate | 12.8652–13.1020 °N | Decimal degrees, WGS 84. Pairs with `longitude`. |
| 10 | `longitude` | **Space** — geographic coordinate | 77.4842–77.7582 °E | Decimal degrees, WGS 84. |
| 11 | `Pin code` | **Space** — geographic ID | 77 distinct codes, 560001–560109 | Indian postal code. **Numeric but not quantitative** — the arithmetic is meaningless; 560076 is not "more" than 560038. Use it as a nominal key or a join key to boundary geometry. |
| 12 | `Output` | **Categorical** (binary) | Yes (301), No (87) | Whether the respondent ordered online again — the dataset's target variable. The source does not define it more precisely than that. |
| 13 | `Feedback` | **Categorical** (binary) | Positive (317), Negative (71) | Could be read as ordinal with only two levels, but binary makes the distinction moot. |
| 14 | _(unnamed)_ | **Redundant — drop** | Yes (301), No (87) | Header is empty (the CSV header line ends in a trailing comma). Verified byte-for-byte identical to `Output` in all 388 rows. Almost certainly an export artifact. |

### Missing dimensions

Worth stating explicitly, because it constrains what can be built from this data:

- **No time attribute.** No order date, timestamp, or interval — nothing here supports a time
  series, and every chart from this dataset is cross-sectional.
- **No order-level detail.** No basket size, price, cuisine, restaurant, or delivery duration.
  The unit of analysis is the *customer*, not the *order*, despite the dataset's name.

## Data quality notes

Four things a consumer of this file needs to know:

1. **The 14th column is a duplicate.** The header line ends with a trailing comma, producing an
   unnamed column that copies `Output` exactly. Drop it on load.
2. **`Feedback` has a trailing space.** Every negative value is `"Negative "`, not `"Negative"`.
   Trim string values on parse, or grouping silently splits.
3. **103 rows are exact duplicates of another row.** This is expected rather than corrupt: with
   only a handful of low-cardinality attributes, two respondents of the same age, gender, job,
   income band, and area collide naturally. Do **not** dedupe — each row is a distinct survey
   response, and dropping collisions would bias the counts toward unusual respondents.
4. **`Pin code` and `latitude`/`longitude` are perfectly redundant.** 77 postal codes map 1:1
   onto 77 coordinate pairs, so the coordinates are area centroids, not household locations.
   They identify a neighbourhood, and mapping them as precise points overstates their precision.

## Loading it

Served from Vite's `public/` directory, so it is fetched at runtime rather than bundled:

```ts
import { csvParse } from 'd3-dsv';

const text = await fetch(`${import.meta.env.BASE_URL}data/online-food-orders/online-food-orders.csv`)
  .then((r) => r.text());
const rows = csvParse(text);
```

See `src/assignments/week-02/` for the loading, parsing, and summary code that consumes it.
