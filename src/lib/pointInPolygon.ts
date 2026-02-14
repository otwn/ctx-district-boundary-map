import type { DistrictFeature, DistrictFeatureCollection } from '../types/domain';

// Ray-casting algorithm for point-in-polygon
function isInsideRing(point: [number, number], ring: number[][]): boolean {
  const [px, py] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

function isInsidePolygon(point: [number, number], coordinates: number[][][]): boolean {
  if (!isInsideRing(point, coordinates[0])) {
    return false;
  }
  // Check holes
  for (let i = 1; i < coordinates.length; i++) {
    if (isInsideRing(point, coordinates[i])) {
      return false;
    }
  }
  return true;
}

export function findDistrictAtPoint(
  point: [number, number],
  districts: DistrictFeatureCollection,
): DistrictFeature | null {
  for (const feature of districts.features) {
    const geometry = feature.geometry;
    if (geometry.type === 'Polygon') {
      if (isInsidePolygon(point, geometry.coordinates)) {
        return feature;
      }
    } else if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) {
        if (isInsidePolygon(point, polygon)) {
          return feature;
        }
      }
    }
  }
  return null;
}
