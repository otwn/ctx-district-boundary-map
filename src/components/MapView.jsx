import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import DrawControls from './DrawControls';

const EMPTY_FC = { type: 'FeatureCollection', features: [] };
const BASEMAPS = {
  'osm-standard': {
    tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '&copy; OpenStreetMap contributors',
  },
  'osm-de': {
    tiles: ['https://tile.openstreetmap.de/{z}/{x}/{y}.png'],
    attribution: '&copy; OpenStreetMap contributors',
  },
  'esri-streets': {
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    ],
    attribution: 'Tiles &copy; Esri',
  },
  'open-topo': {
    tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
    attribution: '&copy; OpenStreetMap contributors, SRTM | OpenTopoMap',
  },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildAttributesHtml(properties) {
  const rows = Object.entries(properties || {})
    .map(([key, value]) => `<tr><td><strong>${escapeHtml(key)}</strong></td><td>${escapeHtml(value)}</td></tr>`)
    .join('');
  return `<div><h4 style="margin:0 0 6px 0;">${escapeHtml(properties?.name || 'District')}</h4><table>${rows}</table></div>`;
}

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
  basemap,
  initialView,
  onViewChange,
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
  const hoverPopupRef = useRef(null);
  const clickPopupRef = useRef(null);
  const [message, setMessage] = useState('');

  const basemapConfig = BASEMAPS[basemap] || BASEMAPS['osm-standard'];

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
            tiles: basemapConfig.tiles,
            tileSize: 256,
            attribution: basemapConfig.attribution,
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: initialView?.center || [-97.74, 30.28],
      zoom: initialView?.zoom ?? 9,
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
          'fill-opacity': 0.06,
        },
      });

      map.addLayer({
        id: 'district-outline',
        type: 'line',
        source: 'districts',
        paint: {
          'line-color': '#000000',
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
        const feature = event.features?.[0];
        const id = feature?.properties?.id;
        if (id) {
          onSelectDistrict(id);
        }

        if (clickPopupRef.current) {
          clickPopupRef.current.remove();
        }
        clickPopupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '320px' })
          .setLngLat(event.lngLat)
          .setHTML(buildAttributesHtml(feature?.properties || {}))
          .addTo(map);
      });

      map.on('mouseenter', 'district-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mousemove', 'district-fill', (event) => {
        const name = event.features?.[0]?.properties?.name || 'District';
        if (!hoverPopupRef.current) {
          hoverPopupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 12,
          });
        }
        hoverPopupRef.current.setLngLat(event.lngLat).setHTML(`<strong>${escapeHtml(name)}</strong>`).addTo(map);
      });

      map.on('mouseleave', 'district-fill', () => {
        map.getCanvas().style.cursor = '';
        if (hoverPopupRef.current) {
          hoverPopupRef.current.remove();
        }
      });
    });

    map.on('moveend', () => {
      const center = map.getCenter();
      onViewChange({
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
      });
    });

    mapRef.current = map;

    return () => {
      if (hoverPopupRef.current) {
        hoverPopupRef.current.remove();
        hoverPopupRef.current = null;
      }
      if (clickPopupRef.current) {
        clickPopupRef.current.remove();
        clickPopupRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, [basemapConfig, districts, initialView, onSelectDistrict, onViewChange, selectedDistrictId]);

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
