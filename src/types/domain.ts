import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

export type DistrictGeometry = Polygon | MultiPolygon;

export type DistrictProperties = {
  id: string;
  name: string;
  chapter_name?: string | null;
  color?: string | null;
  [key: string]: unknown;
};

export type DistrictFeature = Feature<DistrictGeometry, DistrictProperties>;

export type DistrictFeatureCollection = FeatureCollection<DistrictGeometry, DistrictProperties>;

export type AppRole = 'viewer' | 'admin' | 'editor';

export type SystemSupabaseStatus = {
  state: 'checking' | 'connected' | 'fallback';
  message: string;
};

export type SystemAuthStatus = {
  state: 'authenticated' | 'not_logged_in' | 'auth_failed';
  message: string;
};

export type OperationResult = {
  ok: boolean;
  message: string;
};

export type BoundaryEdit = {
  id: string;
  district_id: string;
  district_name?: string | null;
  action?: string | null;
  edited_by?: string | null;
  edited_by_email?: string | null;
  created_at: string;
};

export type ViewState = {
  center: [number, number];
  zoom: number;
};
