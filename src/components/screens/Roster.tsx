import { useState } from 'react';
import type { GameState, Player, PlayerRoleRatingRecord } from '../../types';
import { RoleBadge } from '../shared/RoleBadge';
import { StatBar } from '../shared/StatBar';

interface Props {
  state: GameState;
  onMovePlayer: (playerId: string, to: 'starter' | 'bench') => void;
}

const ROLE_COLORS: Record<string, string> = {
  duelist:    'var(--role-duelist)',
  initiator:  'var(--role-initiator)',
  controller: 'var(--role-controller)',
  sentinel:   'var(--role-sentinel)',
};

function PlayerDetail({ player, roleRatings, isStarter, canPromote, onMove }: {
  player: Player;
  roleRatings: PlayerRoleRatingRecord[];
  isStarter: boolean;
  canPromote: boolean;
  onMove: (playerId: string, to: 'starter' | 'bench') => void;
}) {
  return (
    <div className="card p-4 flex-col gap-3" style={{ minWidth: 300 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700, letterSpacing: '0.06em' }}>
          {player.alias.toUpperCase()}
        </div>
        <div className="text-dim text-sm">{player.firstName} {player.lastName} · {player.nationality}</div>
        <div className="flex gap-2 items-center" style={{ marginTop: 6 }}>
          <RoleBadge role={player.primaryRole} />
          <span className="text-xs text-dim font-head uppercase">{player.archetype}</span>
          <span className="text-xs text-dim font-mono">Age {player.age}</span>
        </div>
      </div>

      <div className="flex-col gap-2">
        <StatBar label="AIM" value={player.aim} color="var(--red)" />
        <StatBar label="GAME SENSE" value={player.gameSense} color="var(--blue)" />
        <StatBar label="CLUTCH" value={player.clutch} color="var(--amber)" />
        <StatBar label="COMMUNICATION" value={player.communication} color="var(--teal)" />
        <StatBar label="ADAPTABILITY" value={player.adaptability} color="var(--role-controller)" />
        <StatBar label="MORALE" value={player.morale} color={player.morale >= 70 ? 'var(--teal)' : player.morale >= 45 ? 'var(--amber)' : 'var(--red)'} />
      </div>

      <div>
        <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 8 }}>Role Ratings</div>
        {(['duelist', 'initiator', 'controller', 'sentinel'] as const).map(role => {
          const rr = roleRatings.find(r => r.role === role);
          const isPrimary = role === player.primaryRole;
          const rating = rr?.scoutedRating ?? null;
          const confidence = rr?.scoutConfidence ?? 0;
          return (
            <div key={role} className="flex items-center gap-2" style={{ marginBottom: 6 }}>
              <span className={`role-badge ${role}`} style={{ minWidth: 32 }}>{role.slice(0, 3).toUpperCase()}</span>
              {rating !== null ? (
                <div style={{ flex: 1 }}>
                  <div className="flex justify-between text-xs" style={{ marginBottom: 2 }}>
                    <span style={{ color: isPrimary ? ROLE_COLORS[role] : 'var(--text-secondary)' }}>
                      {isPrimary ? '★' : ''} {rating}
                    </span>
                    <span className="text-dim">{confidence}% conf.</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${rating}%`, background: ROLE_COLORS[role], opacity: 0.4 + confidence / 100 * 0.6 }} />
                  </div>
                </div>
              ) : (
                <span className="text-dim text-xs">Not scouted</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-xs">
        <div>
          <span className="text-dim">Salary:</span>{' '}
          <span className="font-mono">${player.salary.toLocaleString()}/yr</span>
        </div>
      </div>

      <div>
        <span className="text-dim text-xs">Main agent: </span>
        <span className="text-xs font-head uppercase" style={{ color: ROLE_COLORS[player.primaryRole] }}>{player.mainAgent}</span>
      </div>

      <div style={{ paddingTop: 4 }}>
        {isStarter ? (
          <button className="btn btn-red" style={{ width: '100%' }} onClick={() => onMove(player.id, 'bench')}>
            Move to Bench
          </button>
        ) : (
          <button
            className="btn btn-teal"
            style={{ width: '100%' }}
            disabled={!canPromote}
            title={!canPromote ? 'Starting lineup is full (5/5)' : undefined}
            onClick={() => onMove(player.id, 'starter')}
          >
            Promote to Starting
          </button>
        )}
      </div>
    </div>
  );
}

function PlayerRow({ player, selected, onClick }: { player: Player; selected: boolean; onClick: () => void }) {
  const highlight = selected ? 'highlight' : '';
  return (
    <tr className={highlight} style={{ cursor: 'pointer' }} onClick={onClick}>
      <td><RoleBadge role={player.primaryRole} /></td>
      <td>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{player.alias}</div>
        <div className="text-dim" style={{ fontSize: 11 }}>{player.nationality} · {player.mainAgent}</div>
      </td>
      <td className="font-mono">{player.aim}</td>
      <td className="font-mono">{player.gameSense}</td>
      <td className="font-mono">{player.clutch}</td>
      <td className="font-mono">{player.morale}</td>
      <td className="font-mono text-xs">{player.age}</td>
    </tr>
  );
}

export function Roster({ state, onMovePlayer }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'starters' | 'subs'>('starters');

  const team = state.teams.get(state.playerTeamId);
  const starterIds = new Set(team?.rosterIds ?? []);
  const starters = [...starterIds].map(id => state.players.get(id)).filter(Boolean) as Player[];
  const subs = (team?.subIds ?? [])
    .filter(id => !starterIds.has(id))
    .map(id => state.players.get(id))
    .filter(Boolean) as Player[];
  const listed = tab === 'starters' ? starters : subs;

  const selectedPlayer = selectedId ? state.players.get(selectedId) ?? null : null;
  const selectedRoleRatings = selectedPlayer
    ? [...state.roleRatings.values()].filter(rr => rr.playerId === selectedPlayer.id)
    : [];

  return (
    <div className="flex" style={{ height: '100%' }}>
      {/* Left panel */}
      <div className="flex-col" style={{ flex: 1, padding: 16, overflow: 'hidden' }}>
        <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
          <h2 className="font-head" style={{ fontSize: 18 }}>{team?.name ?? 'Roster'}</h2>
        </div>

        <div className="tabs" style={{ marginBottom: 12 }}>
          <div className={`tab ${tab === 'starters' ? 'active' : ''}`} onClick={() => setTab('starters')}>
            Starters ({starters.length})
          </div>
          <div className={`tab ${tab === 'subs' ? 'active' : ''}`} onClick={() => setTab('subs')}>
            Substitutes ({subs.length})
          </div>
        </div>

        <div className="scroll-area" style={{ flex: 1 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Player</th>
                <th>AIM</th>
                <th>GS</th>
                <th>CLUTCH</th>
                <th>MORALE</th>
                <th>AGE</th>
              </tr>
            </thead>
            <tbody>
              {listed.map(p => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  selected={p.id === selectedId}
                  onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right detail panel */}
      {selectedPlayer && (
        <div className="scroll-area" style={{ width: 340, padding: 16, borderLeft: '1px solid var(--border)' }}>
          <PlayerDetail
            player={selectedPlayer}
            roleRatings={selectedRoleRatings}
            isStarter={starterIds.has(selectedPlayer.id)}
            canPromote={starters.length < 5}
            onMove={onMovePlayer}
          />
        </div>
      )}
    </div>
  );
}
