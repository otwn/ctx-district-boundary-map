import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';

function wrapLiteralArraysInExpression(value) {
  if (!Array.isArray(value)) {
    return value;
  }
  if (!value.length) {
    return value;
  }

  const [first, ...rest] = value;

  // Expression form: [operator, ...args]
  if (typeof first === 'string') {
    return [
      first,
      ...rest.map((arg) => {
        if (Array.isArray(arg) && arg.length && typeof arg[0] === 'number') {
          return ['literal', arg];
        }
        return wrapLiteralArraysInExpression(arg);
      }),
    ];
  }

  return value.map((item) => wrapLiteralArraysInExpression(item));
}

function getMapLibreCompatibleDrawStyles() {
  const baseStyles = Array.isArray(MapboxDraw?.lib?.theme) ? MapboxDraw.lib.theme : [];
  return baseStyles.map((style) => {
    if (!style?.paint || !('line-dasharray' in style.paint)) {
      return style;
    }
    return {
      ...style,
      paint: {
        ...style.paint,
        'line-dasharray': wrapLiteralArraysInExpression(style.paint['line-dasharray']),
      },
    };
  });
}

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
  const drawRef = useRef(null);
  const activeFeatureRef = useRef(null);
  const modeRef = useRef('idle');
  const [editing, setEditing] = useState(false);

  const setMode = (mode) => {
    modeRef.current = mode;
    window.__districtDrawMode = mode;
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !canEdit || !mapReady || drawRef.current) {
      return;
    }

    // MapLibre compatibility: MapboxDraw still expects mapboxgl-* class names by default.
    MapboxDraw.constants.classes.CANVAS = 'maplibregl-canvas';
    MapboxDraw.constants.classes.CANVAS_CONTAINER = 'maplibregl-canvas-container';
    MapboxDraw.constants.classes.CONTROL_BASE = 'maplibregl-ctrl';
    MapboxDraw.constants.classes.CONTROL_PREFIX = 'maplibregl-ctrl-';
    MapboxDraw.constants.classes.CONTROL_GROUP = 'maplibregl-ctrl-group';
    MapboxDraw.constants.classes.ATTRIBUTION = 'maplibregl-ctrl-attrib';

    window.mapboxgl = maplibregl;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: 'simple_select',
      styles: getMapLibreCompatibleDrawStyles(),
    });

    try {
      map.addControl(draw, 'top-left');
    } catch (error) {
      console.error('Draw control setup failed:', error);
      return undefined;
    }
    drawRef.current = draw;
    setMode('simple_select');

    const handleCreate = (event) => {
      if (modeRef.current !== 'create-pending') {
        return;
      }
      const featureId = event.features?.[0]?.id;
      if (!featureId) {
        return;
      }
      activeFeatureRef.current = featureId;
      setMode('create');
      setEditing(true);
      draw.changeMode('direct_select', { featureId });
    };

    const handleModeChange = (event) => {
      setMode(event.mode || 'simple_select');
    };

    map.on('draw.create', handleCreate);
    map.on('draw.modechange', handleModeChange);

    return () => {
      map.off('draw.create', handleCreate);
      map.off('draw.modechange', handleModeChange);
      map.removeControl(draw);
      drawRef.current = null;
      activeFeatureRef.current = null;
      setMode('idle');
      setEditing(false);
    };
  }, [canEdit, mapReady, mapRef]);

  const startEditing = () => {
    const draw = drawRef.current;
    if (!draw || !selectedDistrictId || editing) {
      return;
    }

    const target = districts.features.find((feature) => feature.properties?.id === selectedDistrictId);
    if (!target) {
      return;
    }

    draw.deleteAll();
    const drawId = draw.add({
      type: 'Feature',
      properties: {
        districtId: target.properties.id,
      },
      geometry: target.geometry,
    })[0];

    activeFeatureRef.current = drawId;
    setMode('edit');
    draw.changeMode('simple_select', { featureIds: [drawId] });
    draw.changeMode('direct_select', { featureId: drawId });
    setEditing(true);
  };

  const startCreate = () => {
    const draw = drawRef.current;
    if (!draw || !canAdmin || editing) {
      return;
    }
    draw.deleteAll();
    activeFeatureRef.current = null;
    setMode('create-pending');
    setEditing(false);
    draw.changeMode('draw_polygon');
  };

  const cancelEditing = () => {
    const draw = drawRef.current;
    if (!draw) {
      return;
    }
    draw.deleteAll();
    activeFeatureRef.current = null;
    setMode('idle');
    setEditing(false);
  };

  const saveEditing = async () => {
    const draw = drawRef.current;
    const activeId = activeFeatureRef.current;
    if (!draw || !activeId) {
      return;
    }

    const feature = draw.get(activeId);
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
