import fallbackGeoJsonRaw from '../data/districts.geojson?raw';
import fallbackGeoJsonUrl from '../data/districts.geojson?url';
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

function toDistrictId(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function canonicalizeDistrictName(rawName) {
  const normalized = String(rawName || '').trim();
  if (!normalized) {
    return '';
  }
  if (SOURCE_NAME_TO_CANONICAL[normalized]) {
    return SOURCE_NAME_TO_CANONICAL[normalized];
  }
  // Industry-standard fallback: preserve source semantics instead of dropping unknown names.
  return normalized;
}

function normalizeFallbackDistricts(rawCollection) {
  const featuresById = new Map();

  for (const feature of rawCollection?.features || []) {
    const properties = feature?.properties || {};
    const sourceName =
      properties.name ||
      properties.Name ||
      properties.District ||
      properties.district ||
      '';
    const canonicalName = canonicalizeDistrictName(sourceName);
    const sourceId =
      properties.id ||
      properties.ID ||
      properties.district_id ||
      properties.districtId ||
      '';
    const canonicalId = sourceId
      ? toDistrictId(sourceId)
      : DISTRICT_ID_BY_NAME[canonicalName] || toDistrictId(canonicalName);

    if (!canonicalId || !feature?.geometry || featuresById.has(canonicalId)) {
      continue;
    }

    featuresById.set(canonicalId, {
      type: 'Feature',
      properties: {
        id: canonicalId,
        name: canonicalName || canonicalId,
        color: properties.color || properties.Color || '#FFD700',
      },
      geometry: feature.geometry,
    });
  }

  const features = Array.from(featuresById.values());
  features.sort((left, right) => {
    const leftName = left.properties?.name || '';
    const rightName = right.properties?.name || '';
    const leftIndex = FALLBACK_DISTRICT_ORDER.indexOf(leftName);
    const rightIndex = FALLBACK_DISTRICT_ORDER.indexOf(rightName);
    if (leftIndex === -1 && rightIndex === -1) {
      return leftName.localeCompare(rightName);
    }
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

const EMPTY_FC = { type: 'FeatureCollection', features: [] };
let fallbackDistrictsCache = null;
let fallbackParseErrorLogged = false;
const SUPABASE_READ_TIMEOUT_MS = 6000;

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
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function loadFallbackDistricts() {
  if (fallbackDistrictsCache) {
    return fallbackDistrictsCache;
  }

  const setCacheFromRawCollection = (rawCollection) => {
    fallbackDistrictsCache = normalizeFallbackDistricts(rawCollection);
    if (!fallbackDistrictsCache.features.length) {
      console.error('Fallback districts normalization produced 0 features. Check source GeoJSON properties.');
    }
    return fallbackDistrictsCache;
  };

  try {
    const maybeUrlLike = typeof fallbackGeoJsonRaw === 'string' && !fallbackGeoJsonRaw.trim().startsWith('{');
    if (!maybeUrlLike) {
      const raw = JSON.parse(fallbackGeoJsonRaw);
      return setCacheFromRawCollection(raw);
    }
  } catch (err) {
    // Keep this one-time to avoid noisy logs during retries.
    if (!fallbackParseErrorLogged) {
      fallbackParseErrorLogged = true;
      console.warn('Failed to parse bundled fallback districts GeoJSON. Will try URL fetch fallback:', err);
    }
  }

  try {
    const response = await fetch(fallbackGeoJsonUrl, { cache: 'no-store' });
    if (response.ok) {
      const raw = await response.json();
      return setCacheFromRawCollection(raw);
    }
    console.error('Fallback GeoJSON URL fetch failed:', response.status);
  } catch (err) {
    console.error('Fallback GeoJSON URL fetch failed:', err);
  }

  try {
    const response = await fetch('/districts.geojson', { cache: 'no-store' });
    if (response.ok) {
      const raw = await response.json();
      return setCacheFromRawCollection(raw);
    }
  } catch {
    // no-op: this is a best-effort final fallback path for static hosting setups.
  }

  if (!fallbackParseErrorLogged) {
    fallbackParseErrorLogged = true;
    console.error('All fallback district loading strategies failed. Returning empty collection.');
  }

  try {
    return EMPTY_FC;
  } catch {
    return EMPTY_FC;
  }
}

const SAFE_EDIT_ACTIONS = new Set(['update', 'insert', 'soft_delete', 'restore']);

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
  const fallback = await loadFallbackDistricts();

  if (!supabase) {
    return fallback;
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
      return fallback;
    }

    if (data?.length) {
      const fromDb = rowsToFeatureCollection(data);
      if (fromDb.features.length) {
        return fromDb;
      }
      console.warn('Supabase districts rows were present but had invalid geometry. Falling back to local GeoJSON.');
    }

    return fallback;
  } catch (error) {
    console.warn('Using local fallback districts due to Supabase read failure:', error?.message || error);
    return fallback;
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
