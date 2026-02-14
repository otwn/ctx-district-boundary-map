/// <reference types="vite/client" />

declare module '*.geojson?raw' {
  const content: string;
  export default content;
}

declare module '*.geojson?url' {
  const content: string;
  export default content;
}

declare module '@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.es.js' {
  export function createGeomanInstance(map: unknown, options?: unknown): Promise<any>;
}

declare global {
  interface Window {
    __districtDrawMode?: string;
  }
}

export {};
