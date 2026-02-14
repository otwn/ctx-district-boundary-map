import type { User } from '@supabase/supabase-js';
import type {
  AppRole,
  BoundaryEdit,
  DistrictFeature,
  SystemAuthStatus,
  SystemSupabaseStatus,
} from '../types/domain';

type SidebarProps = {
  districts: DistrictFeature[];
  selectedDistrictId: string | null;
  onSelectDistrict: (districtId: string | null) => void;
  basemap: string;
  onBasemapChange: (basemap: string) => void;
  history: BoundaryEdit[];
  user: User | null;
  role: AppRole;
  supabaseStatus: SystemSupabaseStatus;
  authStatus: SystemAuthStatus;
  onLogin: () => void;
  onLogout: () => void;
};

export default function Sidebar({
  districts,
  selectedDistrictId,
  onSelectDistrict,
  basemap,
  onBasemapChange,
  history,
  user,
  role,
  supabaseStatus,
  authStatus,
  onLogin,
  onLogout,
}: SidebarProps) {
  const supabaseLabel =
    supabaseStatus.state === 'connected' ? 'Connected' : supabaseStatus.state === 'checking' ? 'Checking' : 'Fallback';

  const authLabel =
    authStatus.state === 'authenticated'
      ? 'Authenticated'
      : authStatus.state === 'auth_failed'
        ? 'Auth Failed'
        : 'Not Logged In';

  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>CTX District Map</h1>
        <p>Austin-area district boundaries</p>
      </div>

      <section className="section">
        <h2>System Status</h2>
        <div className="status-grid">
          <div className="status-item">
            <strong>Supabase</strong>
            <div className={`status-chip ${supabaseStatus.state}`}>{supabaseLabel}</div>
            {supabaseStatus.message ? <div className="status-detail">{supabaseStatus.message}</div> : null}
          </div>
          <div className="status-item">
            <strong>Auth</strong>
            <div className={`status-chip ${authStatus.state}`}>{authLabel}</div>
            {authStatus.message ? <div className="status-detail">{authStatus.message}</div> : null}
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Account</h2>
        {user ? (
          <div className="user-card">
            <div>{user.email}</div>
            <div>Role: {role}</div>
            <button onClick={onLogout}>Log out</button>
          </div>
        ) : (
          <button onClick={onLogin}>Login / Register</button>
        )}
      </section>

      <section className="section">
        <h2>Basemap</h2>
        <select className="basemap-select" value={basemap} onChange={(event) => onBasemapChange(event.target.value)}>
          <option value="osm-standard">OSM Standard</option>
          <option value="osm-de">OSM DE (Clear Roads)</option>
          <option value="esri-streets">Esri Streets</option>
          <option value="google-like-voyager">Google-like (Free)</option>
          <option value="esri-navigation">Esri Navigation</option>
          <option value="esri-light-gray">Esri Light Gray Canvas</option>
          <option value="esri-imagery-hybrid">Esri Imagery Hybrid</option>
          <option value="open-topo">OpenTopoMap</option>
        </select>
      </section>

      <section className="section">
        <h2>Districts</h2>
        <ul className="district-list">
          {districts.map((feature) => {
            const id = feature.properties?.id;
            const name = feature.properties?.name;
            if (!id) {
              return null;
            }
            return (
              <li key={id}>
                <button className={selectedDistrictId === id ? 'active' : ''} onClick={() => onSelectDistrict(id)}>
                  {name}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="section">
        <h2>Recent Edits</h2>
        <ul className="history-list">
          {history.length ? (
            history.map((entry) => (
              <li key={entry.id} className="history-item">
                <div>{entry.district_name || entry.district_id}</div>
                <div>Action: {entry.action || 'update'}</div>
                <div>By: {entry.edited_by_email || entry.edited_by || 'Unknown'}</div>
                <div className="history-time">{new Date(entry.created_at).toLocaleString()}</div>
              </li>
            ))
          ) : (
            <li className="history-item">No edit history yet.</li>
          )}
        </ul>
      </section>
    </aside>
  );
}
