import type { ReactNode } from 'react';
import type { GameState } from '../types';

type NavItem = 'dashboard' | 'roster' | 'transfers' | 'matchday' | 'standings' | 'schedule' | 'playoffs' | 'history' | 'finances';

interface Props {
  state: GameState;
  active: NavItem;
  onNav: (item: NavItem) => void;
  onAdvanceWeek: () => void;
  children: ReactNode;
}

const NAV_ITEMS: { id: NavItem; label: string }[] = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'roster',     label: 'Roster' },
  { id: 'transfers',  label: 'Market' },
  { id: 'finances',   label: 'Finances' },
  { id: 'matchday',   label: 'Matches' },
  { id: 'standings',  label: 'Standings' },
  { id: 'schedule',   label: 'Schedule' },
  { id: 'playoffs',   label: 'Playoffs' },
  { id: 'history',    label: 'History' },
];

function phaseTag(state: GameState) {
  const calSeason = Math.ceil(state.season / 3);
  const splitNum  = ((state.season - 1) % 3) + 1;
  const p = state.phase;
  if (p === 'regular_season') return `Season ${calSeason} — Split ${splitNum} — Week ${state.week}`;
  if (p === 'playoffs') return `Season ${calSeason} — Split ${splitNum} — Playoffs`;
  if (p === 'offseason') return `Offseason`;
  if (p === 'preseason') return 'Preseason';
  return '';
}

export function Layout({ state, active, onNav, onAdvanceWeek, children }: Props) {
  const unread = state.notifications.filter(n => !n.read).length;
  const pendingRenewals = state.pendingDecisions.filter(d => d.type === 'contract_renewal').length;
  const team = state.teams.get(state.playerTeamId);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{
        width: 180, background: 'var(--bg-1)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid var(--border)' }}>
          <div className="font-head text-red" style={{ fontSize: 18, letterSpacing: '0.1em' }}>VALORANT GM</div>
          <div className="text-dim" style={{ fontSize: 11, marginTop: 2 }}>{team?.name ?? ''}</div>
        </div>

        {/* Phase badge */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-dim)' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: state.phase === 'playoffs' ? 'var(--amber)' : 'var(--text-secondary)',
          }}>
            {phaseTag(state)}
          </span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {NAV_ITEMS.map(item => {
            const isActive = active === item.id;
            return (
              <div
                key={item.id}
                className={`nav-item${isActive ? ' nav-active' : ''}`}
                onClick={() => onNav(item.id)}
                style={{
                  position: 'relative',
                  padding: '9px 14px 9px 17px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-head)',
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    left: 0, top: 0, bottom: 0,
                    width: 3,
                    background: 'var(--red)',
                  }} />
                )}
                {item.label}
                {item.id === 'dashboard' && unread > 0 && (
                  <span style={{
                    background: 'var(--red)', color: '#fff',
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    padding: '1px 5px', borderRadius: 10,
                  }}>{unread}</span>
                )}
                {item.id === 'finances' && pendingRenewals > 0 && (
                  <span style={{
                    background: 'var(--amber)', color: '#000',
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    padding: '1px 5px', borderRadius: 10,
                  }}>{pendingRenewals}</span>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
          <div className="text-dim" style={{ fontSize: 10 }}>
            {team?.wins ?? 0}W — {team?.losses ?? 0}L · {team?.points ?? 0}pts
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <div style={{
          height: 44, flexShrink: 0,
          background: 'var(--bg-1)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="font-head text-red" style={{ fontSize: 14, letterSpacing: '0.06em' }}>
              {state.teams.get(state.playerTeamId)?.name ?? ''}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
              {phaseTag(state)}
            </span>
          </div>
          <button className="btn btn-teal" style={{ fontSize: 12, padding: '5px 16px' }} onClick={onAdvanceWeek}>
            Advance Week ▶
          </button>
        </div>
        {/* Page content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
