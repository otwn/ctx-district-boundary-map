import React from 'react';
import ReactDOM from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.css';
import App from './App';
import './App.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
