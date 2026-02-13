import { useEffect, useRef, useState } from 'react';
import { createGeomanInstance } from '@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.es.js';

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
}) {
  const geomanRef = useRef(null);
  const modeRef = useRef('idle');
  const [editing, setEditing] = useState(false);

  const setMode = (mode) => {
    modeRef.current = mode;
    window.__districtDrawMode = mode;
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !canEdit || !mapReady || geomanRef.current) {
      return;
    }

    let cancelled = false;
    const onCreate = () => {
      const geoman = geomanRef.current;
      if (!geoman || modeRef.current !== 'create-pending') {
        return;
      }
      geoman.disableDraw();
      setMode('create');
      setEditing(true);
    };

    (async () => {
      try {
        const geoman = await createGeomanInstance(map, {
          settings: {
            controlsUiEnabledByDefault: false,
          },
        });

        if (cancelled || !geoman) {
          await geoman?.destroy({ removeSources: false });
          return;
        }

        geomanRef.current = geoman;
        setMode('idle');
        map.on('gm:create', onCreate);
      } catch (error) {
        console.error('Geoman setup failed:', error);
      }
    })();

    return () => {
      cancelled = true;
      map.off('gm:create', onCreate);
      const geoman = geomanRef.current;
      geomanRef.current = null;
      setMode('idle');
      setEditing(false);
      if (geoman) {
        geoman.destroy({ removeSources: false }).catch(() => {});
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
    if (!feature?.geometry) {
      return;
    }

    let result;
    if (modeRef.current === 'create') {
      const nameInput = window.prompt('Enter new district name');
      const name = nameInput?.trim();
      if (!name) {
        return;
      }
      result = await onCreate(name, feature.geometry);
    } else {
      if (!selectedDistrictId) {
        return;
      }
      result = await onSave(selectedDistrictId, feature.geometry);
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
      <button onClick={startEditing} disabled={!selectedDistrictId || editing}>Edit Selected</button>
      {canAdmin ? (
        <button onClick={startCreate} disabled={editing}>Add Polygon</button>
      ) : null}
      <button className="primary" onClick={saveEditing} disabled={!editing || modeRef.current === 'create-pending'}>
        Save
      </button>
      <button className="danger" onClick={cancelEditing} disabled={!editing}>Cancel</button>
      {canAdmin ? (
        <button className="danger" onClick={deleteSelected} disabled={!selectedDistrictId || editing}>
          Delete Selected
        </button>
      ) : null}
    </div>
  );
}
