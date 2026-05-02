import type { DistrictFeature, DistrictGeometry } from '../types/domain';

const SHARED_VERTEX_TOLERANCE = 1e-6;

export type LngLat = [number, number];

export function collectVertices(geometry: DistrictGeometry): LngLat[] {
  const vertices: LngLat[] = [];
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const rings of polygons) {
    for (const ring of rings) {
      for (const point of ring) {
        if (Array.isArray(point) && point.length >= 2) {
          vertices.push([point[0], point[1]]);
        }
      }
    }
  }
  return vertices;
}

export function collectNeighborVertices(
  districts: DistrictFeature[],
  excludeId: string,
): LngLat[] {
  const seen = new Set<string>();
  const vertices: LngLat[] = [];
  for (const feature of districts) {
    if (feature.properties?.id === excludeId || !feature.geometry) {
      continue;
    }
    for (const point of collectVertices(feature.geometry)) {
      const key = `${point[0].toFixed(7)}:${point[1].toFixed(7)}`;
      if (!seen.has(key)) {
        seen.add(key);
        vertices.push(point);
      }
    }
  }
  return vertices;
}

function nearestVertex(target: LngLat, candidates: LngLat[]): { vertex: LngLat; distSq: number } | null {
  let best: { vertex: LngLat; distSq: number } | null = null;
  for (const vertex of candidates) {
    const dx = vertex[0] - target[0];
    const dy = vertex[1] - target[1];
    const distSq = dx * dx + dy * dy;
    if (!best || distSq < best.distSq) {
      best = { vertex, distSq };
    }
  }
  return best;
}

export function snapGeometryToNeighbors(
  geometry: DistrictGeometry,
  neighborVertices: LngLat[],
  tolerance: number = SHARED_VERTEX_TOLERANCE,
): DistrictGeometry {
  if (neighborVertices.length === 0) {
    return geometry;
  }
  const toleranceSq = tolerance * tolerance;

  const snapPoint = (point: number[]): number[] => {
    if (point.length < 2) {
      return point;
    }
    const target: LngLat = [point[0], point[1]];
    const best = nearestVertex(target, neighborVertices);
    if (best && best.distSq <= toleranceSq) {
      return [best.vertex[0], best.vertex[1], ...point.slice(2)];
    }
    return point;
  };

  const snapRing = (ring: number[][]): number[][] => ring.map(snapPoint);
  const snapPolygon = (rings: number[][][]): number[][][] => rings.map(snapRing);

  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: snapPolygon(geometry.coordinates) };
  }
  return { type: 'MultiPolygon', coordinates: geometry.coordinates.map(snapPolygon) };
}

const coordKey = (point: LngLat): string => `${point[0].toFixed(7)}:${point[1].toFixed(7)}`;

export type SharedVertexSnapshot = {
  /** Map of neighbor district id -> set of shared coordinate keys at edit start. */
  byNeighbor: Map<string, Set<string>>;
};

export function snapshotSharedVertices(
  districts: DistrictFeature[],
  editingId: string,
): SharedVertexSnapshot {
  const editing = districts.find((feature) => feature.properties?.id === editingId);
  if (!editing?.geometry) {
    return { byNeighbor: new Map() };
  }
  const editingKeys = new Set(collectVertices(editing.geometry).map(coordKey));
  const byNeighbor = new Map<string, Set<string>>();
  for (const feature of districts) {
    const neighborId = feature.properties?.id;
    if (!neighborId || neighborId === editingId || !feature.geometry) {
      continue;
    }
    const shared = new Set<string>();
    for (const vertex of collectVertices(feature.geometry)) {
      if (editingKeys.has(coordKey(vertex))) {
        shared.add(coordKey(vertex));
      }
    }
    if (shared.size > 0) {
      byNeighbor.set(neighborId, shared);
    }
  }
  return { byNeighbor };
}

function mapPolygonRings(
  rings: number[][][],
  fn: (point: LngLat) => LngLat | null,
): number[][][] {
  return rings.map((ring) =>
    ring.map((point) => {
      if (!Array.isArray(point) || point.length < 2) {
        return point;
      }
      const replaced = fn([point[0], point[1]]);
      if (!replaced) {
        return point;
      }
      return [replaced[0], replaced[1], ...point.slice(2)];
    }),
  );
}

function mapGeometry(geometry: DistrictGeometry, fn: (point: LngLat) => LngLat | null): DistrictGeometry {
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: mapPolygonRings(geometry.coordinates, fn) };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geometry.coordinates.map((rings) => mapPolygonRings(rings, fn)),
  };
}

export type NeighborUpdate = {
  districtId: string;
  geometry: DistrictGeometry;
};

/**
 * Compute updated geometries for any neighbor whose previously-shared vertices
 * no longer match the edited polygon. Each missing vertex in the editing
 * polygon is replaced in the neighbor with the nearest vertex from the new
 * editing geometry, preserving the shared boundary.
 */
export function computeNeighborPropagations(
  snapshot: SharedVertexSnapshot,
  newGeometry: DistrictGeometry,
  districts: DistrictFeature[],
): NeighborUpdate[] {
  if (snapshot.byNeighbor.size === 0) {
    return [];
  }
  const newVertices = collectVertices(newGeometry);
  const newKeys = new Set(newVertices.map(coordKey));
  const updates: NeighborUpdate[] = [];

  for (const [neighborId, sharedKeys] of snapshot.byNeighbor) {
    const orphanedKeys = new Set<string>();
    for (const key of sharedKeys) {
      if (!newKeys.has(key)) {
        orphanedKeys.add(key);
      }
    }
    if (orphanedKeys.size === 0) {
      continue;
    }
    const neighbor = districts.find((feature) => feature.properties?.id === neighborId);
    if (!neighbor?.geometry) {
      continue;
    }
    const candidatePoints = newVertices.filter((vertex) => !sharedKeys.has(coordKey(vertex)));
    if (candidatePoints.length === 0) {
      continue;
    }
    let mutated = false;
    const updatedGeometry = mapGeometry(neighbor.geometry, (point) => {
      if (!orphanedKeys.has(coordKey(point))) {
        return null;
      }
      const best = nearestVertex(point, candidatePoints);
      if (!best) {
        return null;
      }
      mutated = true;
      return best.vertex;
    });
    if (mutated) {
      updates.push({ districtId: neighborId, geometry: updatedGeometry });
    }
  }
  return updates;
}
