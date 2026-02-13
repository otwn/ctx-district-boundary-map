import { useEffect, useMemo, useState } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import AuthModal from './components/AuthModal';
import {
  createDistrictBoundary,
  fetchDistricts,
  fetchEditHistory,
  softDeleteDistrict,
  updateDistrictBoundary,
} from './lib/districts';
import { getSessionAndRole, signOut } from './lib/auth';
import { supabase } from './lib/supabase';

export default function App() {
  const [districts, setDistricts] = useState({ type: 'FeatureCollection', features: [] });
  const [history, setHistory] = useState([]);
  const [basemap, setBasemap] = useState('osm-standard');
  const [viewState, setViewState] = useState({ center: [-97.74, 30.28], zoom: 9 });
  const [selectedDistrictId, setSelectedDistrictId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('viewer');
  const isEditor = useMemo(() => role === 'editor' || role === 'admin', [role]);
  const isAdmin = useMemo(() => role === 'admin', [role]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      const [districtData, edits, sessionData] = await Promise.all([
        fetchDistricts(),
        fetchEditHistory(),
        getSessionAndRole().catch(() => ({ user: null, role: 'viewer' })),
      ]);

      if (!alive) {
        return;
      }

      setDistricts(districtData);
      setHistory(edits);
      setUser(sessionData.user);
      setRole(sessionData.role);
      setLoading(false);
    };

    load();

    const sub = supabase?.auth.onAuthStateChange(async (event) => {
      // load() handles the initial session; only react to real auth changes.
      if (event === 'INITIAL_SESSION') {
        return;
      }
      try {
        const sessionData = await getSessionAndRole();
        if (!alive) {
          return;
        }
        setUser(sessionData.user);
        setRole(sessionData.role);
      } catch {
        // Don't overwrite state on transient errors.
      }
    });

    return () => {
      alive = false;
      sub?.data?.subscription?.unsubscribe();
    };
  }, []);

  const refreshDistrictsAndHistory = async () => {
    const [districtData, edits] = await Promise.all([fetchDistricts(), fetchEditHistory()]);
    setDistricts(districtData);
    setHistory(edits);
  };

  const handleBoundarySave = async (districtId, geometry) => {
    if (!user) {
      setAuthOpen(true);
      return { ok: false, message: 'Login required.' };
    }

    try {
      await updateDistrictBoundary(districtId, geometry);
      await refreshDistrictsAndHistory();
      return { ok: true, message: 'Boundary saved.' };
    } catch (error) {
      return { ok: false, message: error.message || 'Failed to save boundary.' };
    }
  };

  const handleDistrictCreate = async (name, geometry) => {
    if (!user) {
      setAuthOpen(true);
      return { ok: false, message: 'Login required.' };
    }
    if (!isAdmin) {
      return { ok: false, message: 'Only admins can add districts.' };
    }
    try {
      await createDistrictBoundary(name, geometry);
      await refreshDistrictsAndHistory();
      return { ok: true, message: 'District created.' };
    } catch (error) {
      return { ok: false, message: error.message || 'Failed to create district.' };
    }
  };

  const handleDistrictDelete = async (districtId) => {
    if (!user) {
      setAuthOpen(true);
      return { ok: false, message: 'Login required.' };
    }
    if (!isAdmin) {
      return { ok: false, message: 'Only admins can delete districts.' };
    }
    try {
      await softDeleteDistrict(districtId);
      setSelectedDistrictId((current) => (current === districtId ? null : current));
      await refreshDistrictsAndHistory();
      return { ok: true, message: 'District archived (soft delete).' };
    } catch (error) {
      return { ok: false, message: error.message || 'Failed to delete district.' };
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      setUser(null);
      setRole('viewer');
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        districts={districts.features}
        selectedDistrictId={selectedDistrictId}
        onSelectDistrict={setSelectedDistrictId}
        basemap={basemap}
        onBasemapChange={setBasemap}
        history={history}
        user={user}
        role={role}
        onLogin={() => setAuthOpen(true)}
        onLogout={handleSignOut}
      />
      <main className="map-pane">
        <MapView
          key={basemap}
          basemap={basemap}
          initialView={viewState}
          onViewChange={setViewState}
          districts={districts}
          selectedDistrictId={selectedDistrictId}
          onSelectDistrict={setSelectedDistrictId}
          canEdit={isEditor}
          canAdmin={isAdmin}
          onBoundarySave={handleBoundarySave}
          onDistrictCreate={handleDistrictCreate}
          onDistrictDelete={handleDistrictDelete}
          loading={loading}
        />
      </main>
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthSuccess={async () => {
          const sessionData = await getSessionAndRole();
          setUser(sessionData.user);
          setRole(sessionData.role);
          setAuthOpen(false);
        }}
      />
    </div>
  );
}
