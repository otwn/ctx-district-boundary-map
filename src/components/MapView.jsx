import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import DrawControls from './DrawControls';

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

function getFeatureCenter(feature) {
  const ring = feature?.geometry?.coordinates?.[0] || [];
  if (!ring.length) {
    return null;
  }
  let lon = 0;
  let lat = 0;
  ring.forEach(([x, y]) => {
    lon += x;
    lat += y;
  });
  return [lon / ring.length, lat / ring.length];
}

export default function MapView({
  districts,
  selectedDistrictId,
  onSelectDistrict,
  canEdit,
  onBoundarySave,
  loading,
}) {
  const mapRef = useRef(null);
  const mapNodeRef = useRef(null);
  const districtsRef = useRef(districts);
  const [message, setMessage] = useState('');

  useEffect(() => {
    districtsRef.current = districts;
  }, [districts]);

  useEffect(() => {
    if (mapRef.current || !mapNodeRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [-97.74, 30.28],
      zoom: 9,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      map.addSource('districts', { type: 'geojson', data: districtsRef.current || EMPTY_FC });

      map.addLayer({
        id: 'district-fill',
        type: 'fill',
        source: 'districts',
        paint: {
          'fill-color': ['coalesce', ['get', 'color'], '#FFD700'],
          'fill-opacity': 0.15,
        },
      });

      map.addLayer({
        id: 'district-outline',
        type: 'line',
        source: 'districts',
        paint: {
          'line-color': '#FFD700',
          'line-width': [
            'case',
            ['==', ['get', 'id'], selectedDistrictId || ''],
            4,
            2,
          ],
        },
      });

      map.addLayer({
        id: 'district-label',
        type: 'symbol',
        source: 'districts',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-font': ['Noto Sans Regular'],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 1.2,
        },
      });

      map.on('click', 'district-fill', (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (id) {
          onSelectDistrict(id);
        }
      });

      map.on('mouseenter', 'district-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'district-fill', () => {
        map.getCanvas().style.cursor = '';
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [districts, onSelectDistrict, selectedDistrictId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }
    const source = map.getSource('districts');
    if (source) {
      source.setData(districts || EMPTY_FC);
    }

    if (map.getLayer('district-outline')) {
      map.setPaintProperty('district-outline', 'line-width', [
        'case',
        ['==', ['get', 'id'], selectedDistrictId || ''],
        4,
        2,
      ]);
    }
  }, [districts, selectedDistrictId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedDistrictId) {
      return;
    }

    const feature = districts.features.find((entry) => entry.properties?.id === selectedDistrictId);
    const center = getFeatureCenter(feature);
    if (center) {
      map.flyTo({ center, zoom: 11.2, essential: true });
    }
  }, [districts, selectedDistrictId]);

  return (
    <>
      <div ref={mapNodeRef} className="map-container" />
      {loading ? <div className="map-loading">Loading boundaries...</div> : null}
      {message ? <div className="map-message">{message}</div> : null}
      <DrawControls
        mapRef={mapRef}
        districts={districts}
        selectedDistrictId={selectedDistrictId}
        canEdit={canEdit}
        onSave={async (districtId, geometry) => {
          const result = await onBoundarySave(districtId, geometry);
          setMessage(result.message);
          setTimeout(() => setMessage(''), 2500);
          return result;
        }}
      />
    </>
  );
}
