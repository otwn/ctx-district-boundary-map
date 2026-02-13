export default function Sidebar({
  districts,
  selectedDistrictId,
  onSelectDistrict,
  basemap,
  onBasemapChange,
  history,
  user,
  role,
  onLogin,
  onLogout,
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>CTX District Map</h1>
        <p>Austin-area district boundaries</p>
      </div>

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
            return (
              <li key={id}>
                <button
                  className={selectedDistrictId === id ? 'active' : ''}
                  onClick={() => onSelectDistrict(id)}
                >
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
