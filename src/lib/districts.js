import fallbackDistrictsRaw from '../data/districts.geojson?raw';
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

const fallbackDistricts = normalizeFallbackDistricts(JSON.parse(fallbackDistrictsRaw));

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

export async function fetchDistricts() {
  if (!supabase) {
    return fallbackDistricts;
  }

  const { data, error } = await supabase.from('districts').select('id,name,color,geometry').order('name');
  if (error || !data?.length) {
    return fallbackDistricts;
  }

  return rowsToFeatureCollection(data);
}

export async function updateDistrictBoundary(id, newGeometry, userId) {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data: current, error: currentError } = await supabase
    .from('districts')
    .select('geometry,name')
    .eq('id', id)
    .single();

  if (currentError) {
    throw new Error(currentError.message);
  }

  const { error: updateError } = await supabase
    .from('districts')
    .update({ geometry: newGeometry, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: insertError } = await supabase.from('boundary_edits').insert({
    district_id: id,
    district_name: current.name,
    edited_by: userId,
    old_geometry: current.geometry,
    new_geometry: newGeometry,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function fetchEditHistory(districtId) {
  if (!supabase) {
    return [];
  }

  let query = supabase
    .from('boundary_edits')
    .select('id,district_id,district_name,edited_by,edited_by_email,created_at')
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
