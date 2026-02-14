import { useEffect, useRef, useState } from 'react';
import type { SystemAuthStatus, SystemSupabaseStatus } from '../types/domain';

type StatusIndicatorProps = {
  supabaseStatus: SystemSupabaseStatus;
  authStatus: SystemAuthStatus;
};

function dotColorClass(state: SystemSupabaseStatus['state']): string {
  if (state === 'connected') return 'dot-green';
  if (state === 'fallback') return 'dot-yellow';
  return 'dot-gray';
}

function supabaseLabel(state: SystemSupabaseStatus['state']): string {
  if (state === 'connected') return 'Connected';
  if (state === 'fallback') return 'Fallback';
  return 'Checking';
}

function authLabel(state: SystemAuthStatus['state']): string {
  if (state === 'authenticated') return 'Authenticated';
  if (state === 'auth_failed') return 'Auth Failed';
  return 'Not Logged In';
}

export default function StatusIndicator({ supabaseStatus, authStatus }: StatusIndicatorProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="status-indicator" ref={panelRef}>
      <button
        className={`status-dot ${dotColorClass(supabaseStatus.state)}`}
        onClick={() => setOpen((prev) => !prev)}
        title="System Status"
        aria-label="Toggle system status panel"
      />
      {open ? (
        <div className="status-panel">
          <div className="status-panel-row">
            <span className="status-panel-label">Supabase</span>
            <span className={`status-chip ${supabaseStatus.state}`}>
              {supabaseLabel(supabaseStatus.state)}
            </span>
          </div>
          {supabaseStatus.message ? (
            <div className="status-panel-detail">{supabaseStatus.message}</div>
          ) : null}
          <div className="status-panel-row">
            <span className="status-panel-label">Auth</span>
            <span className={`status-chip ${authStatus.state}`}>
              {authLabel(authStatus.state)}
            </span>
          </div>
          {authStatus.message ? (
            <div className="status-panel-detail">{authStatus.message}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
