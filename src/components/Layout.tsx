import type { ReactNode } from 'react';
import type { GameState } from '../types';

type NavItem = 'dashboard' | 'roster' | 'transfers' | 'matchday' | 'standings';

interface Props {
  state: GameState;
  active: NavItem;
  onNav: (item: NavItem) => void;
  children: ReactNode;
}

const NAV_ITEMS: { id: NavItem; label: string }[] = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'roster',     label: 'Roster' },
  { id: 'transfers',  label: 'Market' },
  { id: 'matchday',   label: 'Matches' },
  { id: 'standings',  label: 'Standings' },
];

function phaseTag(state: GameState) {
  const p = state.phase;
  if (p === 'regular_season') return `S${state.season} A${state.act} W${state.week}`;
  if (p === 'playoffs') return `S${state.season} PO`;
  if (p === 'offseason') return `Offseason`;
  if (p === 'preseason') return `Preseason`;
  return '';
}

export function Layout({ state, active, onNav, children }: Props) {
  const unread = state.notifications.filter(n => !n.read).length;
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
          {NAV_ITEMS.map(item => (
            <div
              key={item.id}
              onClick={() => onNav(item.id)}
              style={{
                padding: '9px 14px',
                cursor: 'pointer',
                fontFamily: 'var(--font-head)',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: active === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: active === item.id ? 'var(--bg-3)' : 'transparent',
                borderLeft: active === item.id ? '3px solid var(--red)' : '3px solid transparent',
                transition: 'all 0.1s',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              {item.label}
              {item.id === 'dashboard' && unread > 0 && (
                <span style={{
                  background: 'var(--red)', color: '#fff',
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  padding: '1px 5px', borderRadius: 10,
                }}>{unread}</span>
              )}
            </div>
          ))}
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
        {children}
      </div>
    </div>
  );
}
