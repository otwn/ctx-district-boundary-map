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

async function loadFallbackDistricts() {
  if (fallbackDistrictsCache) {
    return fallbackDistrictsCache;
  }
  try {
    const response = await fetch(fallbackUrl);
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

function rowsToFeatureCollection(rows) {
  return {
    type: 'FeatureCollection',
    features: rows.map((row) => ({
      type: 'Feature',
      properties: {
        id: row.id,
        name: normalizeDistrictName(row.name),
        color: row.color,
      },
      geometry: row.geometry,
    })),
  };
}

async function seedDistrictsToSupabase(features) {
  if (!supabase || !features?.length) return false;

  const rows = features.map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    color: f.properties.color || '#FFD700',
    geometry: f.geometry,
    is_active: true,
  }));

  const { error } = await supabase
    .from('districts')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.warn('Failed to seed districts to Supabase:', error.message);
    return false;
  }
  return true;
}

export async function fetchDistricts() {
  if (!supabase) {
    return loadFallbackDistricts();
  }

  try {
    const { data, error } = await supabase
      .from('districts')
      .select('id,name,color,geometry,is_active')
      .eq('is_active', true)
      .order('name');

    if (!error && data?.length) {
      return rowsToFeatureCollection(data);
    }

    // Supabase is empty or errored — try to seed from fallback
    const fallback = await loadFallbackDistricts();
    const seeded = await seedDistrictsToSupabase(fallback.features);

    if (seeded) {
      // Re-query to get the freshly seeded data
      const { data: freshData, error: freshError } = await supabase
        .from('districts')
        .select('id,name,color,geometry,is_active')
        .eq('is_active', true)
        .order('name');

      if (!freshError && freshData?.length) {
        return rowsToFeatureCollection(freshData);
      }
    }

    return fallback;
  } catch {
    return loadFallbackDistricts();
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
