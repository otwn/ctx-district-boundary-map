import { useEffect, useRef, useState, type RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import type { DistrictFeatureCollection, DistrictGeometry, OperationResult } from '../types/domain';
// @ts-expect-error library ships no declaration for this subpath import.
import { createGeomanInstance } from '@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.es.js';

type DrawMode = 'idle' | 'edit' | 'create' | 'create-pending' | 'simple_select';

type GeomanApi = {
  disableDraw: () => void;
  disableGlobalEditMode: () => void;
  enableGlobalEditMode: () => void;
  enableDraw: (shape: 'polygon') => void;
  destroy: (options: { removeSources: boolean }) => Promise<void>;
  features: {
    deleteAll: () => void;
    importGeoJsonFeature: (feature: {
      type: 'Feature';
      properties: Record<string, unknown>;
      geometry: DistrictGeometry;
    }) => unknown;
    exportGeoJson: () => {
      features?: Array<{ geometry?: DistrictGeometry | null }>;
    };
  };
};

type DrawControlsProps = {
  mapRef: RefObject<maplibregl.Map | null>;
  mapReady: boolean;
  districts: DistrictFeatureCollection;
  selectedDistrictId: string | null;
  canEdit: boolean;
  canAdmin: boolean;
  onSave: (districtId: string, geometry: DistrictGeometry) => Promise<OperationResult>;
  onCreate: (name: string, geometry: DistrictGeometry) => Promise<OperationResult>;
  onDelete: (districtId: string) => Promise<OperationResult>;
};

export default function DrawControls({
  mapRef,
  mapReady,
  districts,
  selectedDistrictId,
  canEdit,
  canAdmin,
  onSave,
  onCreate,
  onDelete,
}: DrawControlsProps) {
  const geomanRef = useRef<GeomanApi | null>(null);
  const modeRef = useRef<DrawMode>('idle');
  const [editing, setEditing] = useState(false);

  const setMode = (mode: DrawMode) => {
    modeRef.current = mode;
    window.__districtDrawMode = mode;
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !canEdit || !mapReady || geomanRef.current) {
      return;
    }

    let cancelled = false;
    const onCreateEvent = () => {
      const geoman = geomanRef.current;
      if (!geoman || modeRef.current !== 'create-pending') {
        return;
      }
      geoman.disableDraw();
      setMode('create');
      setEditing(true);
    };

    void (async () => {
      try {
        const geoman = (await createGeomanInstance(map, {
          settings: {
            controlsUiEnabledByDefault: false,
          },
        })) as GeomanApi;

        if (cancelled || !geoman) {
          await geoman?.destroy({ removeSources: false });
          return;
        }

        geomanRef.current = geoman;
        setMode('idle');
        map.on('gm:create', onCreateEvent);
      } catch (error) {
        console.error('Geoman setup failed:', error);
      }
    })();

    return () => {
      cancelled = true;
      map.off('gm:create', onCreateEvent);
      const geoman = geomanRef.current;
      geomanRef.current = null;
      setMode('idle');
      setEditing(false);
      if (geoman) {
        void geoman.destroy({ removeSources: false }).catch(() => {});
      }
    };
  }, [canEdit, mapReady, mapRef]);

  const startEditing = () => {
    const geoman = geomanRef.current;
    if (!geoman || !selectedDistrictId || editing) {
      return;
    }

    const target = districts.features.find((feature) => feature.properties?.id === selectedDistrictId);
    if (!target?.geometry) {
      return;
    }

    geoman.disableDraw();
    geoman.disableGlobalEditMode();
    geoman.features.deleteAll();
    const imported = geoman.features.importGeoJsonFeature({
      type: 'Feature',
      properties: {
        districtId: target.properties?.id,
        name: target.properties?.name,
      },
      geometry: target.geometry,
    });
    if (!imported) {
      return;
    }

    geoman.enableGlobalEditMode();
    setMode('edit');
    setEditing(true);
  };

  const startCreate = () => {
    const geoman = geomanRef.current;
    if (!geoman || !canAdmin || editing) {
      return;
    }

    geoman.disableGlobalEditMode();
    geoman.features.deleteAll();
    geoman.enableDraw('polygon');
    setMode('create-pending');
    setEditing(false);
  };

  const cancelEditing = () => {
    const geoman = geomanRef.current;
    if (!geoman) {
      return;
    }
    geoman.disableDraw();
    geoman.disableGlobalEditMode();
    geoman.features.deleteAll();
    setMode('idle');
    setEditing(false);
  };

  const saveEditing = async () => {
    const geoman = geomanRef.current;
    if (!geoman) {
      return;
    }

    const collection = geoman.features.exportGeoJson();
    const feature = collection?.features?.find(
      (entry) => entry?.geometry?.type === 'Polygon' || entry?.geometry?.type === 'MultiPolygon',
    );
    const geometry = feature?.geometry;
    if (!geometry) {
      return;
    }

    let result: OperationResult;
    if (modeRef.current === 'create') {
      const nameInput = window.prompt('Enter new district name');
      const name = nameInput?.trim();
      if (!name) {
        return;
      }
      result = await onCreate(name, geometry);
    } else {
      if (!selectedDistrictId) {
        return;
      }
      result = await onSave(selectedDistrictId, geometry);
    }

    if (!result.ok) {
      return;
    }

    cancelEditing();
  };

  const deleteSelected = async () => {
    if (!canAdmin || editing || !selectedDistrictId) {
      return;
    }

    const selectedDistrict = districts.features.find((feature) => feature.properties?.id === selectedDistrictId);
    const districtName = selectedDistrict?.properties?.name || selectedDistrictId;
    const confirmation = window.prompt(`Type "${districtName}" to confirm archive/delete`);
    if (confirmation !== districtName) {
      return;
    }

    await onDelete(selectedDistrictId);
  };

  if (!canEdit) {
    return null;
  }

  return (
    <div className="draw-controls">
      <button onClick={startEditing} disabled={!selectedDistrictId || editing}>
        Edit Selected
      </button>
      {canAdmin ? (
        <button onClick={startCreate} disabled={editing}>
          Add Polygon
        </button>
      ) : null}
      <button className="primary" onClick={() => void saveEditing()} disabled={!editing || modeRef.current === 'create-pending'}>
        Save
      </button>
      <button className="danger" onClick={cancelEditing} disabled={!editing}>
        Cancel
      </button>
      {canAdmin ? (
        <button className="danger" onClick={() => void deleteSelected()} disabled={!selectedDistrictId || editing}>
          Delete Selected
        </button>
      ) : null}
    </div>
  );
}
