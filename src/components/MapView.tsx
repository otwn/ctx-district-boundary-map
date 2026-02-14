import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type LayerSpecification, type RasterSourceSpecification } from 'maplibre-gl';
import DrawControls from './DrawControls';
import type { DistrictFeature, DistrictFeatureCollection, DistrictGeometry, OperationResult, ViewState } from '../types/domain';

type BasemapKey =
  | 'osm-standard'
  | 'osm-de'
  | 'esri-streets'
  | 'google-like-voyager'
  | 'esri-navigation'
  | 'esri-light-gray'
  | 'esri-imagery-hybrid'
  | 'open-topo';

type BasemapConfig = {
  sources: Record<string, RasterSourceSpecification>;
  layers: LayerSpecification[];
};

type MapViewProps = {
  basemap: string;
  initialView: ViewState;
  onViewChange: (view: ViewState) => void;
  districts: DistrictFeatureCollection;
  selectedDistrictId: string | null;
  onSelectDistrict: (districtId: string) => void;
  canEdit: boolean;
  canAdmin: boolean;
  onBoundarySave: (districtId: string, geometry: DistrictGeometry) => Promise<OperationResult>;
  onDistrictCreate: (name: string, geometry: DistrictGeometry) => Promise<OperationResult>;
  onDistrictDelete: (districtId: string) => Promise<OperationResult>;
  loading: boolean;
};

const EMPTY_FC: DistrictFeatureCollection = { type: 'FeatureCollection', features: [] };

const BASEMAPS: Record<BasemapKey, BasemapConfig> = {
  'osm-standard': {
    sources: {
      base: {
        type: 'raster',
        tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'basemap-base', type: 'raster', source: 'base' }],
  },
  'osm-de': {
    sources: {
      base: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.de/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'basemap-base', type: 'raster', source: 'base' }],
  },
  'esri-streets': {
    sources: {
      base: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri',
      },
    },
    layers: [{ id: 'basemap-base', type: 'raster', source: 'base' }],
  },
  'google-like-voyager': {
    sources: {
      base: {
        type: 'raster',
        tiles: ['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      },
    },
    layers: [{ id: 'basemap-base', type: 'raster', source: 'base' }],
  },
  'esri-navigation': {
    sources: {
      base: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri',
      },
      transport: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri',
      },
      labels: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri',
      },
    },
    layers: [
      { id: 'basemap-base', type: 'raster', source: 'base' },
      { id: 'basemap-transport', type: 'raster', source: 'transport' },
      { id: 'basemap-labels', type: 'raster', source: 'labels' },
    ],
  },
  'esri-light-gray': {
    sources: {
      base: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri',
      },
      labels: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri',
      },
    },
    layers: [
      { id: 'basemap-base', type: 'raster', source: 'base' },
      { id: 'basemap-labels', type: 'raster', source: 'labels' },
    ],
  },
  'esri-imagery-hybrid': {
    sources: {
      imagery: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri',
      },
      labels: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri',
      },
    },
    layers: [
      { id: 'basemap-imagery', type: 'raster', source: 'imagery' },
      { id: 'basemap-labels', type: 'raster', source: 'labels' },
    ],
  },
  'open-topo': {
    sources: {
      base: {
        type: 'raster',
        tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors, SRTM | OpenTopoMap',
      },
    },
    layers: [{ id: 'basemap-base', type: 'raster', source: 'base' }],
  },
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildAttributesHtml(properties?: Record<string, unknown> | null): string {
  const rows = Object.entries(properties || {})
    .map(([key, value]) => `<tr><td><strong>${escapeHtml(key)}</strong></td><td>${escapeHtml(value)}</td></tr>`)
    .join('');
  return `<div><h4 style="margin:0 0 6px 0;">${escapeHtml(properties?.name || 'District')}</h4><table>${rows}</table></div>`;
}

function getFeatureCenter(feature?: DistrictFeature | null): [number, number] | null {
  if (!feature) {
    return null;
  }

  const geometry = feature.geometry;
  const ring =
    geometry.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates[0]?.[0]
        : undefined;

  if (!ring?.length) {
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

function firstDrawLayerId(map: maplibregl.Map): string | undefined {
  return map
    .getStyle()
    ?.layers?.find((layer) => layer.id.startsWith('gl-draw-'))
    ?.id;
}

function moveDistrictLayersBelowDraw(map: maplibregl.Map): void {
  const drawLayerId = firstDrawLayerId(map);
  if (!drawLayerId) {
    return;
  }
  ['district-fill', 'district-outline', 'district-label'].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.moveLayer(layerId, drawLayerId);
    }
  });
}

function isDrawInteractionActive(): boolean {
  const mode = window.__districtDrawMode;
  return Boolean(mode && mode !== 'idle' && mode !== 'simple_select');
}

function getFeatureId(feature: maplibregl.MapGeoJSONFeature | undefined): string | null {
  const id = feature?.properties?.id;
  return typeof id === 'string' ? id : null;
}

function getFeatureName(feature: maplibregl.MapGeoJSONFeature | undefined): string {
  const name = feature?.properties?.name;
  return typeof name === 'string' ? name : 'District';
}

export default function MapView({
  basemap,
  initialView,
  onViewChange,
  districts,
  selectedDistrictId,
  onSelectDistrict,
  canEdit,
  canAdmin,
  onBoundarySave,
  onDistrictCreate,
  onDistrictDelete,
  loading,
}: MapViewProps) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const districtsRef = useRef(districts);
  const canEditRef = useRef(canEdit);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const clickPopupRef = useRef<maplibregl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [message, setMessage] = useState('');

  const basemapConfig = BASEMAPS[(basemap as BasemapKey) || 'osm-standard'] || BASEMAPS['osm-standard'];

  useEffect(() => {
    districtsRef.current = districts;
  }, [districts]);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  useEffect(() => {
    if (!mapNodeRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: basemapConfig.sources,
        layers: basemapConfig.layers,
      },
      center: initialView?.center || [-97.74, 30.28],
      zoom: initialView?.zoom ?? 9,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    mapRef.current = map;
    setMapReady(true);

    map.on('load', () => {
      try {
        map.addSource('districts', { type: 'geojson', data: districtsRef.current || EMPTY_FC });

        map.addLayer({
          id: 'district-fill',
          type: 'fill',
          source: 'districts',
          paint: {
            'fill-color': '#00A651',
            'fill-opacity': 0,
          },
        });

        map.addLayer({
          id: 'district-outline',
          type: 'line',
          source: 'districts',
          paint: {
            'line-color': '#00A651',
            'line-width': 3,
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

        moveDistrictLayersBelowDraw(map);
      } catch (err) {
        console.error('District layer setup failed:', err);
      }

      map.on('click', 'district-fill', (event) => {
        if (isDrawInteractionActive()) {
          return;
        }
        const feature = event.features?.[0];
        const id = getFeatureId(feature);
        if (id) {
          onSelectDistrict(id);
        }

        if (clickPopupRef.current) {
          clickPopupRef.current.remove();
        }
        clickPopupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '320px' })
          .setLngLat(event.lngLat)
          .setHTML(buildAttributesHtml((feature?.properties as Record<string, unknown> | undefined) || {}))
          .addTo(map);
      });

      map.on('mouseenter', 'district-fill', () => {
        if (isDrawInteractionActive()) {
          return;
        }
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mousemove', 'district-fill', (event) => {
        if (isDrawInteractionActive()) {
          if (hoverPopupRef.current) {
            hoverPopupRef.current.remove();
          }
          return;
        }
        const name = getFeatureName(event.features?.[0]);
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

    const handleStyleData = () => {
      if (canEditRef.current) {
        moveDistrictLayersBelowDraw(map);
      }
    };
    map.on('styledata', handleStyleData);

    return () => {
      map.off('styledata', handleStyleData);
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
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const syncData = () => {
      const source = map.getSource('districts');
      if (source && 'setData' in source) {
        (source as GeoJSONSource).setData(districts || EMPTY_FC);
      }
      if (map.getLayer('district-outline')) {
        map.setPaintProperty('district-outline', 'line-width', [
          'case',
          ['==', ['get', 'id'], selectedDistrictId || ''],
          4,
          2,
        ]);
      }
    };

    if (map.isStyleLoaded()) {
      syncData();
    }

    map.on('load', syncData);
    return () => {
      map.off('load', syncData);
    };
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
        mapReady={mapReady}
        districts={districts}
        selectedDistrictId={selectedDistrictId}
        canEdit={canEdit}
        canAdmin={canAdmin}
        onSave={async (districtId, geometry) => {
          const result = await onBoundarySave(districtId, geometry);
          setMessage(result.message);
          setTimeout(() => setMessage(''), 2500);
          return result;
        }}
        onCreate={async (name, geometry) => {
          const result = await onDistrictCreate(name, geometry);
          setMessage(result.message);
          setTimeout(() => setMessage(''), 2500);
          return result;
        }}
        onDelete={async (districtId) => {
          const result = await onDistrictDelete(districtId);
          setMessage(result.message);
          setTimeout(() => setMessage(''), 2500);
          return result;
        }}
      />
    </>
  );
}
