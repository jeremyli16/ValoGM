import { useState } from 'react';
import type { ReactNode } from 'react';
import type { GameState } from '../types';

type NavItem = 'dashboard' | 'roster' | 'transfers' | 'matchday' | 'standings' | 'schedule' | 'playoffs' | 'history' | 'finances' | 'tactics' | 'stats' | 'tournament';

interface Props {
  state: GameState;
  active: NavItem;
  onNav: (item: NavItem) => void;
  onAdvanceWeek: () => void;
  onResetGame: () => void;
  children: ReactNode;
}

const NAV_GROUPS: { label: string; items: { id: NavItem; label: string }[] }[] = [
  {
    label: 'Manage',
    items: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'roster',    label: 'Roster' },
      { id: 'transfers', label: 'Market' },
      { id: 'finances',  label: 'Finances' },
      { id: 'tactics',   label: 'Tactics' },
    ],
  },
  {
    label: 'Compete',
    items: [
      { id: 'matchday',   label: 'Matches' },
      { id: 'schedule',   label: 'Schedule' },
      { id: 'standings',  label: 'Standings' },
      { id: 'playoffs',   label: 'Playoffs' },
      { id: 'tournament', label: 'Worlds' },
    ],
  },
  {
    label: 'Review',
    items: [
      { id: 'stats',   label: 'Stats' },
      { id: 'history', label: 'History' },
    ],
  },
];

function phaseTag(state: GameState) {
  const calSeason = Math.ceil(state.season / 3);
  const splitNum  = ((state.season - 1) % 3) + 1;
  const p = state.phase;
  if (p === 'regular_season') return `Season ${calSeason} — Split ${splitNum} — Week ${state.week}`;
  if (p === 'playoffs') return `Season ${calSeason} — Split ${splitNum} — Playoffs`;
  if (p === 'inter_tournament') {
    const name = state.activeInternationalTournament?.name ?? 'Tournament';
    return `${name} — Week ${state.week}`;
  }
  if (p === 'offseason') return `Offseason`;
  if (p === 'preseason') return 'Preseason';
  return '';
}

function tournamentNavLabel(state: GameState): string {
  if (state.activeInternationalTournament) return state.activeInternationalTournament.name;
  const splitNum = ((state.season - 1) % 3) + 1;
  return splitNum === 1 ? 'Masters 1' : splitNum === 2 ? 'Masters 2' : 'Champions';
}

export function Layout({ state, active, onNav, onAdvanceWeek, onResetGame, children }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const unread = state.notifications.filter(n => !n.read).length;
  const team = state.teams.get(state.playerTeamId);
  const renewalsDue = (() => {
    if (!team) return 0;
    const ids = [...(team.rosterIds ?? []), ...(team.subIds ?? [])];
    return ids.filter(id => {
      const p = state.players.get(id);
      if (!p?.contractId) return false;
      const c = state.contracts.get(p.contractId);
      return c && c.endSeason === state.season;
    }).length;
  })();
  const tournamentLabel = tournamentNavLabel(state);

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
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} style={{ marginTop: gi > 0 ? 4 : 0 }}>
              <div style={{
                padding: '6px 14px 3px',
                fontSize: 9,
                fontFamily: 'var(--font-head)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--text-dim)',
              }}>
                {group.label}
              </div>
              {group.items.map(item => {
                const isActive = active === item.id;
                const label = item.id === 'tournament' ? tournamentLabel : item.label;
                return (
                  <div
                    key={item.id}
                    className={`nav-item${isActive ? ' nav-active' : ''}`}
                    onClick={() => onNav(item.id)}
                    style={{
                      position: 'relative',
                      padding: '8px 14px 8px 20px',
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
                    {label}
                    {item.id === 'dashboard' && unread > 0 && (
                      <span style={{
                        background: 'var(--red)', color: '#fff',
                        fontFamily: 'var(--font-mono)', fontSize: 10,
                        padding: '1px 5px', borderRadius: 10,
                      }}>{unread}</span>
                    )}
                    {item.id === 'finances' && renewalsDue > 0 && (
                      <span style={{
                        background: 'var(--amber)', color: '#000',
                        fontFamily: 'var(--font-mono)', fontSize: 10,
                        padding: '1px 5px', borderRadius: 10,
                      }}>{renewalsDue}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

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
          <button className="btn btn-teal" style={{ fontSize: 12, padding: '5px 16px' }} onClick={onAdvanceWeek}>
            Advance Week ▶
          </button>
          <button
            className="btn"
            style={{ fontSize: 11, color: 'var(--text-dim)', borderColor: 'var(--border)' }}
            onClick={() => setConfirmReset(true)}
          >
            Reset Game
          </button>
        </div>

        {confirmReset && (
          <div style={{
            position: 'fixed', inset: 0, background: '#000a',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
          }}>
            <div className="card p-4 flex-col gap-4" style={{ width: 340 }}>
              <div>
                <div className="font-head" style={{ fontSize: 16, marginBottom: 6 }}>Reset Game</div>
                <div className="text-dim text-sm">All progress will be lost. This cannot be undone.</div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-red"
                  style={{ flex: 1 }}
                  onClick={() => { setConfirmReset(false); onResetGame(); }}
                >
                  Confirm Reset
                </button>
                <button className="btn" style={{ flex: 1 }} onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Page content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
