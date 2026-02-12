import fallbackDistrictsRaw from '../data/districts.geojson?raw';
import { supabase } from './supabase';

const fallbackDistricts = JSON.parse(fallbackDistrictsRaw);

function rowsToFeatureCollection(rows) {
  return {
    type: 'FeatureCollection',
    features: rows.map((row) => ({
      type: 'Feature',
      properties: {
        id: row.id,
        name: row.name,
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
