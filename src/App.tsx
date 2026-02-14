import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import AuthModal from './components/AuthModal';
import {
  createDistrictBoundary,
  fetchDistrictsWithMeta,
  fetchEditHistory,
  softDeleteDistrict,
  updateDistrictBoundary,
} from './lib/districts';
import { getSessionAndRole, signOut } from './lib/auth';
import { supabase } from './lib/supabase';
import type {
  AppRole,
  BoundaryEdit,
  DistrictFeatureCollection,
  DistrictGeometry,
  OperationResult,
  SystemAuthStatus,
  SystemSupabaseStatus,
  ViewState,
} from './types/domain';

const EMPTY_FC: DistrictFeatureCollection = { type: 'FeatureCollection', features: [] };

export default function App() {
  const [districts, setDistricts] = useState<DistrictFeatureCollection>(EMPTY_FC);
  const [history, setHistory] = useState<BoundaryEdit[]>([]);
  const [basemap, setBasemap] = useState('osm-standard');
  const [viewState, setViewState] = useState<ViewState>({ center: [-97.74, 30.28], zoom: 9 });
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole>('viewer');
  const [supabaseStatus, setSupabaseStatus] = useState<SystemSupabaseStatus>({
    state: 'checking',
    message: 'Checking districts source...',
  });
  const [authStatus, setAuthStatus] = useState<SystemAuthStatus>({
    state: 'not_logged_in',
    message: '',
  });
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditor = useMemo(() => true, []);
  const isAdmin = useMemo(() => role === 'admin', [role]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      const { data: districtData, source, message } = await fetchDistrictsWithMeta();

      if (!alive) {
        return;
      }

      setDistricts(districtData);
      setSupabaseStatus({
        state: source === 'supabase' ? 'connected' : 'fallback',
        message: source === 'supabase' ? '' : message || 'Using local fallback boundaries.',
      });
      setLoading(false);

      const retrySupabaseDistricts = async () => {
        if (!alive) {
          return;
        }
        const result = await fetchDistrictsWithMeta();
        if (!alive) {
          return;
        }
        if (result.source === 'supabase') {
          setDistricts(result.data);
          setSupabaseStatus({ state: 'connected', message: '' });
          retryTimeoutRef.current = null;
          return;
        }
        setSupabaseStatus({
          state: 'fallback',
          message: result.message || 'Using local fallback boundaries.',
        });
        retryTimeoutRef.current = setTimeout(retrySupabaseDistricts, 15000);
      };

      if (source === 'fallback') {
        retryTimeoutRef.current = setTimeout(retrySupabaseDistricts, 15000);
      }

      fetchEditHistory()
        .then((edits) => {
          if (alive) {
            setHistory(edits);
          }
        })
        .catch(() => {
          if (alive) {
            setHistory([]);
          }
        });

      getSessionAndRole()
        .then((sessionData) => {
          if (alive) {
            setUser(sessionData.user);
            setRole(sessionData.role);
            setAuthStatus({
              state: sessionData.user ? 'authenticated' : 'not_logged_in',
              message: '',
            });
          }
        })
        .catch(() => {
          if (alive) {
            setUser(null);
            setRole('viewer');
            setAuthStatus({
              state: 'auth_failed',
              message: 'Could not verify authentication session.',
            });
          }
        });
    };

    void load();

    const sub = supabase?.auth.onAuthStateChange(async (event) => {
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
        setAuthStatus({
          state: sessionData.user ? 'authenticated' : 'not_logged_in',
          message: '',
        });
      } catch {
        if (!alive) {
          return;
        }
        setAuthStatus({
          state: 'auth_failed',
          message: 'Session refresh failed.',
        });
      }
    });

    return () => {
      alive = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      sub?.data?.subscription?.unsubscribe();
    };
  }, []);

  const refreshDistrictsAndHistory = async () => {
    const [districtDataResult, editsResult] = await Promise.allSettled([fetchDistrictsWithMeta(), fetchEditHistory()]);
    const districtData = districtDataResult.status === 'fulfilled' ? districtDataResult.value.data : EMPTY_FC;

    if (districtDataResult.status === 'fulfilled') {
      setSupabaseStatus({
        state: districtDataResult.value.source === 'supabase' ? 'connected' : 'fallback',
        message:
          districtDataResult.value.source === 'supabase'
            ? ''
            : districtDataResult.value.message || 'Using local fallback boundaries.',
      });
    } else {
      setSupabaseStatus({ state: 'fallback', message: 'District refresh failed. Using fallback boundaries.' });
    }

    const edits = editsResult.status === 'fulfilled' ? editsResult.value : [];
    setDistricts(districtData);
    setHistory(edits);
  };

  const handleBoundarySave = async (districtId: string, geometry: DistrictGeometry): Promise<OperationResult> => {
    if (!user) {
      setAuthOpen(true);
      return { ok: false, message: 'Login required.' };
    }

    try {
      await updateDistrictBoundary(districtId, geometry);
      await refreshDistrictsAndHistory();
      return { ok: true, message: 'Boundary saved.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save boundary.';
      return { ok: false, message };
    }
  };

  const handleDistrictCreate = async (name: string, geometry: DistrictGeometry): Promise<OperationResult> => {
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
      const message = error instanceof Error ? error.message : 'Failed to create district.';
      return { ok: false, message };
    }
  };

  const handleDistrictDelete = async (districtId: string): Promise<OperationResult> => {
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
      const message = error instanceof Error ? error.message : 'Failed to delete district.';
      return { ok: false, message };
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      setUser(null);
      setRole('viewer');
      setAuthStatus({ state: 'not_logged_in', message: '' });
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
        supabaseStatus={supabaseStatus}
        authStatus={authStatus}
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
        onAuthError={(message) => {
          setAuthStatus({ state: 'auth_failed', message });
        }}
        onAuthSuccess={async () => {
          const sessionData = await getSessionAndRole();
          setUser(sessionData.user);
          setRole(sessionData.role);
          setAuthStatus({
            state: sessionData.user ? 'authenticated' : 'not_logged_in',
            message: '',
          });
          setAuthOpen(false);
        }}
      />
    </div>
  );
}
