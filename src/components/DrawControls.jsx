import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';

export default function DrawControls({ mapRef, districts, selectedDistrictId, canEdit, onSave }) {
  const drawRef = useRef(null);
  const activeFeatureRef = useRef(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !canEdit || drawRef.current) {
      return;
    }

    window.mapboxgl = maplibregl;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: 'simple_select',
    });

    map.addControl(draw, 'top-left');
    drawRef.current = draw;

    return () => {
      map.removeControl(draw);
      drawRef.current = null;
      activeFeatureRef.current = null;
      setEditing(false);
    };
  }, [canEdit, mapRef]);

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
    draw.changeMode('direct_select', { featureId: drawId });
    setEditing(true);
  };

  const cancelEditing = () => {
    const draw = drawRef.current;
    if (!draw) {
      return;
    }
    draw.deleteAll();
    activeFeatureRef.current = null;
    setEditing(false);
  };

  const saveEditing = async () => {
    const draw = drawRef.current;
    const activeId = activeFeatureRef.current;
    if (!draw || !activeId || !selectedDistrictId) {
      return;
    }

    const feature = draw.get(activeId);
    const result = await onSave(selectedDistrictId, feature.geometry);
    if (!result.ok) {
      return;
    }

    cancelEditing();
  };

  if (!canEdit) {
    return null;
  }

  return (
    <div className="draw-controls">
      <button onClick={startEditing} disabled={!selectedDistrictId || editing}>Edit Selected</button>
      <button className="primary" onClick={saveEditing} disabled={!editing}>Save</button>
      <button className="danger" onClick={cancelEditing} disabled={!editing}>Cancel</button>
    </div>
  );
}
