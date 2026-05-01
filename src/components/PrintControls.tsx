import { useCallback, useEffect, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';

type PaperSize = 'letter' | 'legal' | 'tabloid' | 'a4' | 'a3';
type Orientation = 'landscape' | 'portrait';

type PrintControlsProps = {
  mapRef: React.RefObject<maplibregl.Map | null>;
};

const PAPER_LABELS: Record<PaperSize, string> = {
  letter: 'Letter (8.5 × 11")',
  legal: 'Legal (8.5 × 14")',
  tabloid: 'Tabloid (11 × 17")',
  a4: 'A4 (210 × 297mm)',
  a3: 'A3 (297 × 420mm)',
};

export default function PrintControls({ mapRef }: PrintControlsProps) {
  const [printMode, setPrintMode] = useState(false);
  const [paperSize, setPaperSize] = useState<PaperSize>('letter');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [zoom, setZoom] = useState(9);
  const styleTagRef = useRef<HTMLStyleElement | null>(null);
  const savedViewRef = useRef<{ center: [number, number]; zoom: number } | null>(null);

  // Sync zoom slider with map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onMove = () => {
      if (printMode) {
        setZoom(Math.round(map.getZoom() * 10) / 10);
      }
    };
    map.on('moveend', onMove);
    return () => {
      map.off('moveend', onMove);
    };
  }, [mapRef, printMode]);

  const enterPrintMode = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const center = map.getCenter();
    savedViewRef.current = {
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
    };
    setZoom(Math.round(map.getZoom() * 10) / 10);
    setPrintMode(true);
  }, [mapRef]);

  const exitPrintMode = useCallback(() => {
    const map = mapRef.current;
    if (map && savedViewRef.current) {
      map.jumpTo({
        center: savedViewRef.current.center,
        zoom: savedViewRef.current.zoom,
      });
    }
    savedViewRef.current = null;
    setPrintMode(false);
  }, [mapRef]);

  const handleZoomChange = useCallback(
    (newZoom: number) => {
      setZoom(newZoom);
      const map = mapRef.current;
      if (map) {
        map.zoomTo(newZoom, { duration: 300 });
      }
    },
    [mapRef],
  );


  const handlePrint = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Force map to render at current size before printing
    map.resize();

    // Inject print-specific CSS
    const style = document.createElement('style');
    style.setAttribute('data-print-controls', 'true');
    style.textContent = `
      @media print {
        @page {
          size: ${paperSize} ${orientation};
          margin: 0.4in;
        }
      }
    `;
    document.head.appendChild(style);
    styleTagRef.current = style;

    // Wait for map tiles to load, then print
    const doPrint = () => {
      window.print();
      // Clean up after print dialog closes
      if (styleTagRef.current) {
        styleTagRef.current.remove();
        styleTagRef.current = null;
      }
    };

    if (map.areTilesLoaded()) {
      setTimeout(doPrint, 200);
    } else {
      const onIdle = () => {
        map.off('idle', onIdle);
        setTimeout(doPrint, 200);
      };
      map.on('idle', onIdle);
    }
  }, [mapRef, paperSize, orientation]);

  if (!printMode) {
    return (
      <button
        className="print-btn"
        onClick={enterPrintMode}
        title="Print map"
        aria-label="Print map"
      >
        🖨️
      </button>
    );
  }

  return (
    <div className="print-controls-panel">
      <div className="print-controls-header">
        <strong>Print Setup</strong>
        <button className="print-close-btn" onClick={exitPrintMode} title="Cancel print">
          ✕
        </button>
      </div>

      <div className="print-control-group">
        <label htmlFor="print-paper-size">Paper</label>
        <select
          id="print-paper-size"
          value={paperSize}
          onChange={(e) => setPaperSize(e.target.value as PaperSize)}
        >
          {Object.entries(PAPER_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="print-control-group">
        <label>Orientation</label>
        <div className="print-orientation-btns">
          <button
            className={orientation === 'landscape' ? 'active' : ''}
            onClick={() => setOrientation('landscape')}
          >
            ⛶ Landscape
          </button>
          <button
            className={orientation === 'portrait' ? 'active' : ''}
            onClick={() => setOrientation('portrait')}
          >
            ▯ Portrait
          </button>
        </div>
      </div>

      <div className="print-control-group">
        <label htmlFor="print-zoom">Zoom: {zoom}</label>
        <input
          id="print-zoom"
          type="range"
          min="4"
          max="18"
          step="0.1"
          value={zoom}
          onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
        />
        <div className="print-zoom-hints">
          <span>Overview</span>
          <span>Detail</span>
        </div>
      </div>

      <p className="print-hint">
        Pan & zoom the map to frame the area you want to print.
      </p>

      <div className="print-actions">
        <button className="print-action-btn primary" onClick={handlePrint}>
          🖨️ Print
        </button>
        <button className="print-action-btn" onClick={exitPrintMode}>
          Cancel
        </button>
      </div>
    </div>
  );
}
