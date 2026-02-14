type GeocodingResult = {
  lat: number;
  lon: number;
  displayName: string;
};

export async function geocodeAddress(query: string): Promise<GeocodingResult | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  const params = new URLSearchParams({
    q: trimmed,
    format: 'json',
    limit: '1',
    addressdetails: '0',
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { 'User-Agent': 'CTXDistrictMap/1.0' },
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed: ${response.status}`);
  }

  const results: Array<{ lat: string; lon: string; display_name: string }> = await response.json();
  const first = results[0];
  if (!first) {
    return null;
  }

  return {
    lat: parseFloat(first.lat),
    lon: parseFloat(first.lon),
    displayName: first.display_name,
  };
}
