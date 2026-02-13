import fallbackRaw from '../data/districts.geojson?raw';
import fallbackUrl from '../data/districts.geojson?url';
import { supabase } from './supabase';

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
];

function normalizeDistrictName(name) {
  if (!name) {
    return name;
  }
  if (name === 'Crystal Falls' || name === 'Crystal Fall') {
    return 'Leander';
  }
  return name;
}

const SOURCE_NAME_TO_CANONICAL = {
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

const DISTRICT_ID_BY_NAME = {
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

function normalizeFallbackDistricts(rawCollection) {
  const featuresByName = new Map();

  for (const feature of rawCollection?.features || []) {
    const sourceName =
      feature?.properties?.name ||
      feature?.properties?.Name ||
      feature?.properties?.District ||
      '';

    const canonicalName = SOURCE_NAME_TO_CANONICAL[sourceName];
    if (!canonicalName || featuresByName.has(canonicalName)) {
      continue;
    }

    featuresByName.set(canonicalName, {
      type: 'Feature',
      properties: {
        id: DISTRICT_ID_BY_NAME[canonicalName],
        name: canonicalName,
        color: '#FFD700',
      },
      geometry: feature.geometry,
    });
  }

  return {
    type: 'FeatureCollection',
    features: FALLBACK_DISTRICT_ORDER.map((name) => featuresByName.get(name)).filter(Boolean),
  };
}

const EMPTY_FC = { type: 'FeatureCollection', features: [] };
let fallbackDistrictsCache = null;
const SUPABASE_READ_TIMEOUT_MS = 6000;

async function loadFallbackDistricts() {
  if (fallbackDistrictsCache) {
    return fallbackDistrictsCache;
  }
  try {
    const raw = JSON.parse(fallbackRaw);
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
    const raw = await response.json();
    fallbackDistrictsCache = normalizeFallbackDistricts(raw);
    return fallbackDistrictsCache;
  } catch (err) {
    console.error('Failed to load fallback districts:', err);
    return EMPTY_FC;
  }
}

const SAFE_EDIT_ACTIONS = new Set(['update', 'insert', 'soft_delete', 'restore']);

function parseMaybeJson(value) {
  if (value && typeof value === 'object') {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isValidGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') {
    return false;
  }
  const allowedTypes = new Set(['Polygon', 'MultiPolygon']);
  if (!allowedTypes.has(geometry.type)) {
    return false;
  }
  return Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0;
}

async function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function rowsToFeatureCollection(rows) {
  const features = rows
    .map((row) => {
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
    .filter(Boolean);

  return {
    type: 'FeatureCollection',
    features,
  };
}

export async function fetchDistricts() {
  const { data } = await fetchDistrictsWithMeta();
  return data;
}

export async function fetchDistrictsWithMeta() {
  const fallback = await loadFallbackDistricts();

  if (!supabase) {
    return { data: fallback, source: 'fallback' };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('districts')
        .select('id,name,color,geometry,is_active')
        .eq('is_active', true)
        .order('name'),
      SUPABASE_READ_TIMEOUT_MS,
      'Supabase districts query',
    );

    if (error) {
      console.warn('Supabase districts read failed. Using local fallback:', error.message);
      return { data: fallback, source: 'fallback' };
    }

    if (data?.length) {
      const fromDb = rowsToFeatureCollection(data);
      if (fromDb.features.length) {
        return { data: fromDb, source: 'supabase' };
      }
      console.warn('Supabase districts rows were present but invalid. Using local fallback.');
    }

    return { data: fallback, source: 'fallback' };
  } catch (error) {
    console.warn('Using local fallback districts due to Supabase read failure:', error?.message || error);
    return { data: fallback, source: 'fallback' };
  }
}

async function runDistrictEdit(action, payload) {
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

function toDistrictId(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function updateDistrictBoundary(id, newGeometry) {
  await runDistrictEdit('update', { id, geometry: newGeometry });
}

export async function createDistrictBoundary(name, newGeometry, color = '#FFD700') {
  const id = toDistrictId(name);
  if (!id) {
    throw new Error('District name is required.');
  }
  await runDistrictEdit('insert', { id, name, geometry: newGeometry, color });
}

export async function softDeleteDistrict(id) {
  await runDistrictEdit('soft_delete', { id });
}

export async function fetchEditHistory(districtId) {
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

  return data;
}
