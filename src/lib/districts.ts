import type { Geometry } from 'geojson';
import fallbackRaw from '../data/districts.geojson?raw';
import fallbackUrl from '../data/districts.geojson?url';
import { supabase } from './supabase';
import type { BoundaryEdit, DistrictFeature, DistrictFeatureCollection, DistrictGeometry } from '../types/domain';

const FALLBACK_DISTRICT_ORDER = [
  'Leander',
  'Round Rock',
  'Cedar Park',
  'Pflugerville',
  'Lakeline',
  'Wells Branch',
  'Walnut Creek',
  'Hyde Park',
  'Dellwood',
  'Downtown',
  'South-Mopac',
  'Live Oak',
  'Brodie',
  'Searight',
  'Hill Country',
  'Bastrop',
  'College Station',
  'Del Valle',
] as const;

const SOURCE_NAME_TO_CANONICAL: Record<string, (typeof FALLBACK_DISTRICT_ORDER)[number]> = {
  'Crystal Falls': 'Leander',
  'Crystal Fall': 'Leander',
  'Round Rock': 'Round Rock',
  'Cedar Park': 'Cedar Park',
  Pflugerville: 'Pflugerville',
  Lakeline: 'Lakeline',
  'Wells Branch': 'Wells Branch',
  'Walnut Creek': 'Walnut Creek',
  'Hyde Park': 'Hyde Park',
  Delwood: 'Dellwood',
  Downtown: 'Downtown',
  'South Mopac': 'South-Mopac',
  'Live Oak': 'Live Oak',
  Brodie: 'Brodie',
  Searight: 'Searight',
  'Hill Country': 'Hill Country',
  Bastrop: 'Bastrop',
  'College Station': 'College Station',
  'Del Valle': 'Del Valle',
};

const DISTRICT_ID_BY_NAME: Record<(typeof FALLBACK_DISTRICT_ORDER)[number], string> = {
  Leander: 'leander',
  'Round Rock': 'round-rock',
  'Cedar Park': 'cedar-park',
  Pflugerville: 'pflugerville',
  Lakeline: 'lakeline',
  'Wells Branch': 'wells-branch',
  'Walnut Creek': 'walnut-creek',
  'Hyde Park': 'hyde-park',
  Dellwood: 'dellwood',
  Downtown: 'downtown',
  'South-Mopac': 'south-mopac',
  'Live Oak': 'live-oak',
  Brodie: 'brodie',
  Searight: 'searight',
  'Hill Country': 'hill-country',
  Bastrop: 'bastrop',
  'College Station': 'college-station',
  'Del Valle': 'del-valle',
};

type DistrictRow = {
  id: string;
  name: string;
  color: string | null;
  geometry: Geometry | string | null;
  is_active: boolean;
};

type DistrictFetchMeta = {
  data: DistrictFeatureCollection;
  source: 'supabase' | 'fallback';
  message: string;
};

type FallbackFeatureLike = {
  type?: string;
  properties?: Record<string, unknown>;
  geometry?: Geometry;
};

type FallbackCollectionLike = {
  type?: string;
  features?: FallbackFeatureLike[];
};

const EMPTY_FC: DistrictFeatureCollection = { type: 'FeatureCollection', features: [] };
let fallbackDistrictsCache: DistrictFeatureCollection | null = null;
const SUPABASE_READ_TIMEOUT_MS = 6000;
const SAFE_EDIT_ACTIONS = new Set(['update', 'insert', 'soft_delete', 'restore']);

function normalizeDistrictName(name: string): string {
  if (name === 'Crystal Falls' || name === 'Crystal Fall') {
    return 'Leander';
  }
  return name;
}

function normalizeFallbackDistricts(rawCollection: FallbackCollectionLike): DistrictFeatureCollection {
  const featuresByName = new Map<string, DistrictFeature>();

  for (const feature of rawCollection?.features || []) {
    const sourceName =
      (feature?.properties?.name as string | undefined) ||
      (feature?.properties?.Name as string | undefined) ||
      (feature?.properties?.District as string | undefined) ||
      '';

    const canonicalName = SOURCE_NAME_TO_CANONICAL[sourceName];
    if (!canonicalName || featuresByName.has(canonicalName) || !feature.geometry) {
      continue;
    }

    featuresByName.set(canonicalName, {
      type: 'Feature',
      properties: {
        id: DISTRICT_ID_BY_NAME[canonicalName],
        name: canonicalName,
        color: '#FFD700',
      },
      geometry: feature.geometry as DistrictGeometry,
    });
  }

  return {
    type: 'FeatureCollection',
    features: FALLBACK_DISTRICT_ORDER.map((name) => featuresByName.get(name)).filter(
      (feature): feature is DistrictFeature => Boolean(feature),
    ),
  };
}

async function loadFallbackDistricts(): Promise<DistrictFeatureCollection> {
  if (fallbackDistrictsCache) {
    return fallbackDistrictsCache;
  }
  try {
    const raw = JSON.parse(fallbackRaw) as FallbackCollectionLike;
    fallbackDistrictsCache = normalizeFallbackDistricts(raw);
    if (fallbackDistrictsCache.features.length) {
      return fallbackDistrictsCache;
    }
  } catch {
    // Fall through to URL fetch path.
  }

  try {
    const response = await fetch(fallbackUrl, { cache: 'no-store' });
    if (!response.ok) {
      console.error('Fallback geojson fetch failed:', response.status);
      return EMPTY_FC;
    }
    const raw = (await response.json()) as FallbackCollectionLike;
    fallbackDistrictsCache = normalizeFallbackDistricts(raw);
    return fallbackDistrictsCache;
  } catch (err) {
    console.error('Failed to load fallback districts:', err);
    return EMPTY_FC;
  }
}

function parseMaybeJson(value: Geometry | string | null): Geometry | null {
  if (value && typeof value === 'object') {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  try {
    return JSON.parse(value) as Geometry;
  } catch {
    return null;
  }
}

function isValidGeometry(geometry: Geometry | null): geometry is DistrictGeometry {
  if (!geometry || typeof geometry !== 'object') {
    return false;
  }
  const allowedTypes = new Set(['Polygon', 'MultiPolygon']);
  if (!allowedTypes.has(geometry.type)) {
    return false;
  }
  return Array.isArray((geometry as DistrictGeometry).coordinates) && (geometry as DistrictGeometry).coordinates.length > 0;
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function rowsToFeatureCollection(rows: DistrictRow[]): DistrictFeatureCollection {
  const features = rows
    .map((row): DistrictFeature | null => {
      const geometry = parseMaybeJson(row.geometry);
      if (!isValidGeometry(geometry)) {
        return null;
      }
      return {
        type: 'Feature',
        properties: {
          id: row.id,
          name: normalizeDistrictName(row.name),
          color: row.color,
        },
        geometry,
      };
    })
    .filter((feature): feature is DistrictFeature => Boolean(feature));

  return {
    type: 'FeatureCollection',
    features,
  };
}

export async function fetchDistricts(): Promise<DistrictFeatureCollection> {
  const { data } = await fetchDistrictsWithMeta();
  return data;
}

export async function fetchDistrictsWithMeta(): Promise<DistrictFetchMeta> {
  const fallback = await loadFallbackDistricts();

  if (!supabase) {
    return { data: fallback, source: 'fallback', message: 'Supabase client is not configured.' };
  }

  try {
    const result = await withTimeout<{
      data: DistrictRow[] | null;
      error: { message: string } | null;
    }>(
      supabase
        .from('districts')
        .select('id,name,color,geometry,is_active')
        .eq('is_active', true)
        .order('name') as unknown as Promise<{
        data: DistrictRow[] | null;
        error: { message: string } | null;
      }>,
      SUPABASE_READ_TIMEOUT_MS,
      'Supabase districts query',
    );
    const { data, error } = result;

    if (error) {
      console.warn('Supabase districts read failed. Using local fallback:', error.message);
      return { data: fallback, source: 'fallback', message: error.message || 'Supabase read failed.' };
    }

    if (data?.length) {
      const fromDb = rowsToFeatureCollection(data as DistrictRow[]);
      if (fromDb.features.length) {
        return { data: fromDb, source: 'supabase', message: 'Loaded from Supabase.' };
      }
      console.warn('Supabase districts rows were present but invalid. Using local fallback.');
      return { data: fallback, source: 'fallback', message: 'Supabase rows were invalid geometry.' };
    }

    return { data: fallback, source: 'fallback', message: 'Supabase returned no active districts.' };
  } catch (error) {
    console.warn('Using local fallback districts due to Supabase read failure:', error);
    return {
      data: fallback,
      source: 'fallback',
      message: error instanceof Error ? error.message : 'Supabase read failed unexpectedly.',
    };
  }
}

async function runDistrictEdit(
  action: 'update' | 'insert' | 'soft_delete' | 'restore',
  payload: { id?: string; name?: string; geometry?: DistrictGeometry | null; color?: string },
): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  if (!SAFE_EDIT_ACTIONS.has(action)) {
    throw new Error('Invalid district action.');
  }

  const { error } = await supabase.rpc('apply_district_operation', {
    p_action: action,
    p_district_id: payload.id ?? null,
    p_name: payload.name ?? null,
    p_geometry: payload.geometry ?? null,
    p_color: payload.color ?? '#FFD700',
  });

  if (error) {
    throw new Error(error.message);
  }
}

function toDistrictId(name: string): string {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function updateDistrictBoundary(id: string, newGeometry: DistrictGeometry): Promise<void> {
  await runDistrictEdit('update', { id, geometry: newGeometry });
}

export async function createDistrictBoundary(
  name: string,
  newGeometry: DistrictGeometry,
  color = '#FFD700',
): Promise<void> {
  const id = toDistrictId(name);
  if (!id) {
    throw new Error('District name is required.');
  }
  await runDistrictEdit('insert', { id, name, geometry: newGeometry, color });
}

export async function softDeleteDistrict(id: string): Promise<void> {
  await runDistrictEdit('soft_delete', { id });
}

export async function fetchEditHistory(districtId?: string): Promise<BoundaryEdit[]> {
  if (!supabase) {
    return [];
  }

  let query = supabase
    .from('boundary_edits')
    .select('id,district_id,district_name,action,edited_by,edited_by_email,created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (districtId) {
    query = query.eq('district_id', districtId);
  }

  const { data, error } = await query;
  if (error) {
    return [];
  }

  return (data ?? []) as BoundaryEdit[];
}
