import { useEffect, useRef } from 'react';
import { select } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { area, curveCatmullRom, line } from 'd3-shape';
import { easeBackOut, easeCubicInOut } from 'd3-ease';
import 'd3-transition';
import { useDimensions } from './useDimensions';

interface DataPoint {
  x: number;
  y: number;
  name: string;
}

// The six points from the starter, now doubling as the stars of a constellation.
const data: DataPoint[] = [
  { x: 132, y: 391, name: 'Saiph' },
  { x: 330, y: 349, name: 'Rigel' },
  { x: 410, y: 192, name: 'Alnitak' },
  { x: 527, y: 257, name: 'Alnilam' },
  { x: 688, y: 119, name: 'Bellatrix' },
  { x: 878, y: 55, name: 'Betelgeuse' },
];

const ORIGINAL_WIDTH = 960;
const ORIGINAL_HEIGHT = 500;
const RADIUS = 34;
const STAR_COUNT = 120;

interface BackgroundStar {
  x: number;
  y: number;
  r: number;
  opacity: number;
  period: number;
  delay: number;
}

// Seeded PRNG, so the starfield is identical on every render and every reload.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const backgroundStars: BackgroundStar[] = (() => {
  const random = mulberry32(1729);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: random() * ORIGINAL_WIDTH,
    y: random() * ORIGINAL_HEIGHT,
    r: 0.4 + random() * 1.7,
    opacity: 0.25 + random() * 0.7,
    period: 2.5 + random() * 4,
    delay: random() * 5,
  }));
})();

export function ConstellationPlot() {
  const svgRef = useRef<SVGSVGElement>(null);
  const hasAnimatedRef = useRef(false);
  const { ref: divRef, dimensions } = useDimensions();

  useEffect(() => {
    const svg = svgRef.current;
    const { width, height } = dimensions;
    if (!svg || width === 0 || height === 0) return;

    const xScale = scaleLinear().domain([0, ORIGINAL_WIDTH]).range([0, width]);
    const yScale = scaleLinear().domain([0, ORIGINAL_HEIGHT]).range([0, height]);

    // Keep marks in proportion as the viewport changes, rather than a fixed pixel radius.
    const k = Math.min(width / ORIGINAL_WIDTH, height / ORIGINAL_HEIGHT);

    // Higher stars in the sky read as brighter and larger.
    const colorScale = scaleLinear<string>()
      .domain([ORIGINAL_HEIGHT, 0])
      .range(['#38bdf8', '#fde68a']);
    const magnitudeScale = scaleLinear().domain([ORIGINAL_HEIGHT, 0]).range([0.55, 1]);
    const radiusOf = (d: DataPoint) => RADIUS * k * magnitudeScale(d.y);
    const fontSize = Math.max(10, 14 * k);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = !hasAnimatedRef.current && !prefersReducedMotion;
    hasAnimatedRef.current = true;

    const root = select(svg);

    // --- Background starfield -------------------------------------------------
    root
      .select<SVGGElement>('.starfield')
      .selectAll<SVGCircleElement, BackgroundStar>('circle')
      .data(backgroundStars)
      .join((enter) =>
        enter
          .append('circle')
          .attr('fill', '#e2e8f0')
          .style('--star-opacity', (d) => d.opacity)
          .style(
            'animation',
            (d) => `twinkle ${d.period}s ease-in-out ${d.delay}s infinite alternate`,
          ),
      )
      .attr('cx', (d) => xScale(d.x))
      .attr('cy', (d) => yScale(d.y))
      .attr('r', (d) => Math.max(0.4, d.r * k));

    // --- Area + connecting curve ----------------------------------------------
    const curve = curveCatmullRom.alpha(0.5);

    const areaGenerator = area<DataPoint>()
      .x((d) => xScale(d.x))
      .y0(height)
      .y1((d) => yScale(d.y))
      .curve(curve);

    const lineGenerator = line<DataPoint>()
      .x((d) => xScale(d.x))
      .y((d) => yScale(d.y))
      .curve(curve);

    // Anchor the edge-fade mask to the data extent so the area dissolves at both ends
    // instead of ending on a hard vertical cut.
    root
      .select('#edge-fade-gradient')
      .attr('x1', xScale(data[0].x))
      .attr('x2', xScale(data[data.length - 1].x));

    root
      .select<SVGGElement>('.area')
      .selectAll<SVGPathElement, DataPoint[]>('path')
      .data([data])
      .join('path')
      .attr('fill', 'url(#area-gradient)')
      .attr('d', areaGenerator);

    const linePath = root
      .select<SVGGElement>('.line')
      .selectAll<SVGPathElement, DataPoint[]>('path')
      .data([data])
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', 'url(#line-gradient)')
      .attr('stroke-width', Math.max(1.5, 3 * k))
      .attr('stroke-linecap', 'round')
      .attr('filter', 'url(#glow)')
      .attr('d', lineGenerator);

    if (animate) {
      const length = linePath.node()?.getTotalLength() ?? 0;
      linePath
        .attr('stroke-dasharray', length)
        .attr('stroke-dashoffset', length)
        .transition()
        .duration(1600)
        .ease(easeCubicInOut)
        .attr('stroke-dashoffset', 0)
        .on('end', function () {
          select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
        });
    }

    // --- Stars of the constellation --------------------------------------------
    const nodes = root
      .select<SVGGElement>('.nodes')
      .selectAll<SVGGElement, DataPoint>('g.node')
      .data(data)
      .join((enter) => {
        const group = enter.append('g').attr('class', 'node').style('cursor', 'pointer');
        group.append('circle').attr('class', 'halo');
        group.append('circle').attr('class', 'core');
        const label = group.append('text').attr('class', 'label').attr('opacity', 0);
        label.append('tspan').attr('class', 'label-name');
        label.append('tspan').attr('class', 'label-coords');
        return group;
      })
      .attr('transform', (d) => `translate(${xScale(d.x)},${yScale(d.y)})`);

    if (!animate) nodes.selectAll('*').interrupt();

    const halo = nodes
      .select<SVGCircleElement>('.halo')
      .attr('fill', (d) => colorScale(d.y))
      .attr('opacity', 0.18);

    const core = nodes
      .select<SVGCircleElement>('.core')
      .attr('fill', (d) => colorScale(d.y))
      .attr('stroke', 'rgba(255,255,255,0.9)')
      .attr('stroke-width', Math.max(1, 1.5 * k))
      .attr('filter', 'url(#glow)');

    if (animate) {
      halo
        .attr('r', 0)
        .transition()
        .delay((_, i) => 300 + i * 140)
        .duration(900)
        .ease(easeBackOut)
        .attr('r', (d) => radiusOf(d) * 1.9);
      core
        .attr('r', 0)
        .transition()
        .delay((_, i) => 300 + i * 140)
        .duration(700)
        .ease(easeBackOut)
        .attr('r', radiusOf);
    } else {
      halo.attr('r', (d) => radiusOf(d) * 1.9);
      core.attr('r', radiusOf);
    }

    // Two-line labels sit above the star, or flip below it when the top edge is close.
    const labelOffset = (d: DataPoint) => radiusOf(d) * 1.9 + 12 * k;
    const fitsAbove = (d: DataPoint) => yScale(d.y) - labelOffset(d) - fontSize * 1.6 > 8;

    nodes
      .select<SVGTextElement>('.label')
      .attr('text-anchor', 'middle')
      .attr('y', (d) =>
        fitsAbove(d) ? -(labelOffset(d) + fontSize * 1.3) : labelOffset(d) + fontSize,
      )
      .attr('fill', '#e2e8f0')
      .attr('font-size', fontSize)
      .style('pointer-events', 'none');

    nodes
      .select<SVGTSpanElement>('.label-name')
      .attr('x', 0)
      .attr('font-weight', 600)
      .attr('letter-spacing', 0.5)
      .text((d) => d.name);

    nodes
      .select<SVGTSpanElement>('.label-coords')
      .attr('x', 0)
      .attr('dy', '1.3em')
      .attr('font-size', fontSize * 0.8)
      .attr('opacity', 0.7)
      .text((d) => `${d.x}, ${d.y}`);

    const setHovered = (node: SVGGElement, d: DataPoint, hovered: boolean) => {
      const group = select(node);
      group
        .select('.core')
        .transition()
        .duration(200)
        .attr('r', radiusOf(d) * (hovered ? 1.22 : 1));
      group
        .select('.halo')
        .transition()
        .duration(200)
        .attr('r', radiusOf(d) * (hovered ? 2.6 : 1.9))
        .attr('opacity', hovered ? 0.45 : 0.18);
      group
        .select('.label')
        .transition()
        .duration(200)
        .attr('opacity', hovered ? 1 : 0);
    };

    nodes
      .on('mouseenter', function (_event, d) {
        setHovered(this, d, true);
      })
      .on('mouseleave', function (_event, d) {
        setHovered(this, d, false);
      });
  }, [dimensions]);

  return (
    <div ref={divRef} className="relative h-full w-full overflow-hidden bg-[#05070f]">
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="A constellation of six stars connected by a glowing curve, plotted from six data points"
      >
        <defs>
          <radialGradient id="sky-gradient" cx="50%" cy="35%" r="80%">
            <stop offset="0%" stopColor="#151d40" />
            <stop offset="100%" stopColor="#05070f" />
          </radialGradient>
          <linearGradient id="line-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="55%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#fde68a" />
          </linearGradient>
          <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="edge-fade-gradient" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="black" />
            <stop offset="18%" stopColor="white" />
            <stop offset="82%" stopColor="white" />
            <stop offset="100%" stopColor="black" />
          </linearGradient>
          <mask id="edge-fade">
            <rect width="100%" height="100%" fill="url(#edge-fade-gradient)" />
          </mask>
          <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="100%" height="100%" fill="url(#sky-gradient)" />
        <g className="starfield" />
        <g className="area" mask="url(#edge-fade)" />
        <g className="line" />
        <g className="nodes" />
      </svg>

      <div className="pointer-events-none absolute top-6 left-7 select-none">
        <p className="text-[11px] font-semibold tracking-[0.35em] text-slate-400 uppercase">
          Week 1
        </p>
        <h1 className="mt-1 text-2xl font-light text-slate-100">Six points, one constellation</h1>
        <p className="mt-1 text-xs text-slate-400">Hover a star to read its coordinates</p>
      </div>
    </div>
  );
}
