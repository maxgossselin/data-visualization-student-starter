import { useMemo } from 'react';
import { scaleLinear, scaleSqrt } from 'd3-scale';
import type { ScaleLinear } from 'd3-scale';
import type { Cell } from './aggregate';
import type { Margin } from './margin';

// How much of a grid cell the largest circle is allowed to fill. At half a cell the
// biggest neighbours just touch, and the surface ring keeps them legible where they do.
// Pushed this high so that even a single-respondent circle stays big enough to hold its
// own label - see labelFits in renderMarks.ts.
const CELL_FILL = 0.5;

// Below this column width the age labels collide, so every other one is dropped.
const MIN_AGE_LABEL_WIDTH = 34;

export interface UseScalesOptions {
  data: Cell[] | null;
  width: number;
  height: number;
  margin: Margin;
}

export interface Scales {
  innerWidth: number;
  innerHeight: number;
  xScale: ScaleLinear<number, number>;
  yScale: ScaleLinear<number, number>;
  /** Maps a respondent count to a circle radius. Area-proportional, so sqrt. */
  rScale: (count: number) => number;
  ageTicks: number[];
  /** The subset of ageTicks that still has room for a label at this width. */
  visibleAgeTicks: number[];
  familyTicks: number[];
  maxCount: number;
  maxRadius: number;
}

function integerRange(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

export function useScales({ data, width, height, margin }: UseScalesOptions): Scales | null {
  return useMemo(() => {
    // No data or no measured container yet, so no scales can be constructed.
    if (!data || data.length === 0) return null;

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    if (innerWidth <= 0 || innerHeight <= 0) return null;

    // Both axes are counts of whole things, so every integer in range gets its own
    // column or row - including any that happen to hold no respondents.
    const ageTicks = integerRange(
      Math.min(...data.map((cell) => cell.age)),
      Math.max(...data.map((cell) => cell.age)),
    );
    const familyTicks = integerRange(
      Math.min(...data.map((cell) => cell.family)),
      Math.max(...data.map((cell) => cell.family)),
    );
    const maxCount = Math.max(...data.map((cell) => cell.count));

    // Half a step of padding on each side gives every integer value its own full-width
    // cell, so the outermost circles are not clipped by the plot edge.
    const xScale = scaleLinear()
      .domain([ageTicks[0] - 0.5, ageTicks[ageTicks.length - 1] + 0.5])
      .range([0, innerWidth]);

    // Flip the y range so that larger households appear higher on the screen.
    const yScale = scaleLinear()
      .domain([familyTicks[0] - 0.5, familyTicks[familyTicks.length - 1] + 0.5])
      .range([innerHeight, 0]);

    const cellWidth = innerWidth / ageTicks.length;
    const cellHeight = innerHeight / familyTicks.length;

    // Area encodes the count, so the radius scale is sqrt: a cell of 22 respondents
    // covers 22x the ink of a cell of 1, not 22x the width.
    const maxRadius = Math.max(4, Math.min(cellWidth, cellHeight) * CELL_FILL);
    const radius = scaleSqrt().domain([0, maxCount]).range([0, maxRadius]);

    const labelStep = cellWidth < MIN_AGE_LABEL_WIDTH ? 2 : 1;

    return {
      innerWidth,
      innerHeight,
      xScale,
      yScale,
      // Floored at 2px so a single-respondent cell stays a visible mark instead of
      // vanishing on a very narrow viewport. Only the smallest counts are affected.
      rScale: (count: number) => Math.max(radius(count), 2),
      ageTicks,
      visibleAgeTicks: ageTicks.filter((_, index) => index % labelStep === 0),
      familyTicks,
      maxCount,
      maxRadius,
    };
  }, [data, width, height, margin]);
}
