import { useMemo, type MouseEvent } from 'react';
import { geoIdentity, geoPath } from 'd3-geo';
import { INK_PRIMARY, SURFACE } from '../week-04/palette';
import { MAP_CLASS_BY_KEY, type MapClass, type ZoneReading } from './assumptions';
import type { ZoneFeatures } from './useHandoffMapData';

const PADDING = 8;

export interface HandoffMapProps {
  outlines: ZoneFeatures;
  readings: Map<number, ZoneReading>;
  width: number;
  height: number;
  selectedId: number | null;
  hoveredId: number | null;
  /** A legend class being pointed at; zones in other classes recede. */
  focusClass: MapClass | null;
  /** When set, zones outside it recede: their class depends on the settings. */
  settled: Set<number> | null;
  onHover: (zoneId: number | null, at?: { x: number; y: number }) => void;
  onSelect: (zoneId: number) => void;
}

export function HandoffMap({
  outlines,
  readings,
  width,
  height,
  selectedId,
  hoveredId,
  focusClass,
  settled,
  onHover,
  onSelect,
}: HandoffMapProps) {
  /*
   * The outlines are in NY State Plane feet, already projected - the same conformal
   * projection the city's own maps use - so the map needs no geographic projection at
   * all, only a scale and a flip. geoIdentity does exactly that (y grows north in
   * State Plane and south on screen), and because it is planar it also avoids d3-geo's
   * spherical rule that rings wind clockwise, which shapefile-derived rings are not
   * guaranteed to follow after simplification.
   */
  const paths = useMemo(() => {
    const projection = geoIdentity()
      .reflectY(true)
      .fitExtent(
        [
          [PADDING, PADDING],
          [width - PADDING, height - PADDING],
        ],
        outlines,
      );
    const path = geoPath(projection);
    return outlines.features.map((feature) => ({
      zoneId: feature.properties.zone_id,
      d: path(feature) ?? '',
    }));
  }, [outlines, width, height]);

  const pointer = (event: MouseEvent<SVGPathElement>, zoneId: number) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    onHover(
      zoneId,
      rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : undefined,
    );
  };

  const outlineOf = (zoneId: number | null) => paths.find((p) => p.zoneId === zoneId)?.d;
  const hoveredPath = outlineOf(hoveredId);
  const selectedPath = outlineOf(selectedId);

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Map of New York taxi zones coloured by the hour the subway hands each zone over to taxis and for-hire cars."
      onMouseLeave={() => onHover(null)}
    >
      {paths.map(({ zoneId, d }) => {
        const reading = readings.get(zoneId);
        const mapClass = reading?.mapClass ?? 'too-quiet';
        const receded =
          (focusClass !== null && focusClass !== mapClass) ||
          (settled !== null && mapClass !== 'too-quiet' && !settled.has(zoneId));
        return (
          <path
            key={zoneId}
            d={d}
            fill={MAP_CLASS_BY_KEY.get(mapClass)?.fill}
            stroke={SURFACE}
            strokeWidth={0.6}
            opacity={receded ? 0.18 : 1}
            className="cursor-pointer"
            style={{ transition: 'fill 250ms, opacity 150ms' }}
            onMouseMove={(event) => pointer(event, zoneId)}
            onClick={() => onSelect(zoneId)}
          />
        );
      })}

      {/*
       * Hover and selection are drawn as separate outlines on top, so a zone's border
       * is never half-hidden under its neighbours'. Neither takes pointer events: the
       * zone underneath stays the target.
       */}
      {selectedPath && (
        <path
          d={selectedPath}
          fill="none"
          stroke={INK_PRIMARY}
          strokeWidth={2}
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
      {hoveredPath && hoveredId !== selectedId && (
        <path
          d={hoveredPath}
          fill="none"
          stroke={INK_PRIMARY}
          strokeWidth={1.25}
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
