import { useState, useEffect } from 'react';
import type { GameState, Player, PlayerRoleRatingRecord, Coach } from '../../types';
import { playerMatchStatsRepo } from '../../db/repos';
import { RoleBadge } from '../shared/RoleBadge';
import { StatBar } from '../shared/StatBar';

interface Props {
  state: GameState;
  onMovePlayer: (playerId: string, to: 'starter' | 'bench') => void;
  onReleasePlayer?: (playerId: string) => void;
}

const ROLE_COLORS: Record<string, string> = {
  duelist:    'var(--role-duelist)',
  initiator:  'var(--role-initiator)',
  controller: 'var(--role-controller)',
  sentinel:   'var(--role-sentinel)',
};

interface SeasonAvg {
  games: number;
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  acs: number;
  rating: number;
}

function avgFromStats(stats: { kills: number; deaths: number; assists: number; adr: number; acs: number; rounds?: number; rating: number }[]): SeasonAvg | null {
  if (stats.length === 0) return null;
  const n = stats.length;
  return {
    games:   n,
    kills:   Math.round(stats.reduce((s, e) => s + e.kills,   0) / n * 10) / 10,
    deaths:  Math.round(stats.reduce((s, e) => s + e.deaths,  0) / n * 10) / 10,
    assists: Math.round(stats.reduce((s, e) => s + e.assists, 0) / n * 10) / 10,
    adr:     Math.round(stats.reduce((s, e) => s + e.adr,     0) / n),
    acs:     Math.round(stats.reduce((s, e) => s + e.acs,     0) / n),
    rating:  Math.round(stats.reduce((s, e) => s + e.rating,  0) / n * 100) / 100,
  };
}

function PlayerDetail({ player, roleRatings, seasonAvg, careerAvg, isStarter, canPromote, onMove, onRelease }: {
  player: Player;
  roleRatings: PlayerRoleRatingRecord[];
  seasonAvg: SeasonAvg | null;
  careerAvg: SeasonAvg | null;
  isStarter: boolean;
  canPromote: boolean;
  onMove: (playerId: string, to: 'starter' | 'bench') => void;
  onRelease?: (playerId: string) => void;
}) {
  const [confirmRelease, setConfirmRelease] = useState(false);
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

      {seasonAvg ? (
        <div>
          <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 8 }}>
            Season Avg <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({seasonAvg.games}g)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 0' }}>
            {([
              { label: 'K', value: seasonAvg.kills },
              { label: 'D', value: seasonAvg.deaths },
              { label: 'A', value: seasonAvg.assists },
            ] as const).map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div className="text-dim" style={{ fontSize: 10, fontFamily: 'var(--font-head)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                <div className="font-mono" style={{ fontSize: 13 }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            <div>
              <span className="text-dim text-xs">ACS </span>
              <span className="font-mono text-xs">{seasonAvg.acs}</span>
            </div>
            <div>
              <span className="text-dim text-xs">ADR </span>
              <span className="font-mono text-xs">{seasonAvg.adr}</span>
            </div>
            <div>
              <span className="text-dim text-xs">Rating </span>
              <span className="font-mono text-xs" style={{
                color: seasonAvg.rating >= 1.2 ? 'var(--teal)' : seasonAvg.rating < 0.8 ? 'var(--red)' : 'var(--text-primary)',
              }}>{seasonAvg.rating.toFixed(2)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-dim text-xs">No matches played this season.</div>
      )}

      {careerAvg && careerAvg.games > (seasonAvg?.games ?? 0) && (
        <div style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 10 }}>
          <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 6 }}>
            Career <span style={{ fontWeight: 400 }}>({careerAvg.games}g)</span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <span className="text-dim text-xs">K/D </span>
              <span className="font-mono text-xs">
                {careerAvg.deaths > 0 ? (careerAvg.kills / careerAvg.deaths).toFixed(2) : careerAvg.kills.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-dim text-xs">ACS </span>
              <span className="font-mono text-xs">{careerAvg.acs}</span>
            </div>
            <div>
              <span className="text-dim text-xs">ADR </span>
              <span className="font-mono text-xs">{careerAvg.adr}</span>
            </div>
            <div>
              <span className="text-dim text-xs">Rating </span>
              <span className="font-mono text-xs" style={{
                color: careerAvg.rating >= 1.2 ? 'var(--teal)' : careerAvg.rating < 0.8 ? 'var(--red)' : 'var(--text-primary)',
              }}>{careerAvg.rating.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
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
        {onRelease && (
          confirmRelease ? (
            <div className="flex gap-2">
              <button
                className="btn btn-red"
                style={{ flex: 1, fontSize: 12 }}
                onClick={() => { onRelease(player.id); setConfirmRelease(false); }}
              >
                Confirm Release
              </button>
              <button className="btn" style={{ flex: 1, fontSize: 12 }} onClick={() => setConfirmRelease(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="btn"
              style={{ width: '100%', fontSize: 12, color: 'var(--red)', borderColor: 'var(--red)' }}
              onClick={() => setConfirmRelease(true)}
            >
              Release Player
            </button>
          )
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

function CoachSection({ coaches }: { coaches: { coach: Coach; role: 'head' | 'assistant' }[] }) {
  if (coaches.length === 0) return null;
  return (
    <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 10, letterSpacing: '0.08em' }}>
        Coaching Staff
      </div>
      {coaches.map(({ coach, role }) => (
        <div key={coach.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 0',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {coach.firstName} {coach.lastName}
              <span className="text-dim text-xs font-head" style={{ marginLeft: 8 }}>
                {role === 'head' ? 'HEAD COACH' : 'ASSISTANT'}
              </span>
            </div>
            <div className="text-dim" style={{ fontSize: 11, marginTop: 2 }}>
              {coach.nationality} · Age {coach.age} · ${coach.salary.toLocaleString()}/yr
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px 12px', minWidth: 180 }}>
            {([
              { label: 'TACTICS', value: coach.tactics, color: 'var(--blue)' },
              { label: 'SCOUTING', value: coach.scouting, color: 'var(--teal)' },
              { label: 'MORALE', value: coach.moraleBoost, color: 'var(--amber)' },
            ] as const).map(({ label, value, color }) => (
              <div key={label}>
                <div className="text-dim" style={{ fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
                <div style={{ height: 4, background: 'var(--bg-2)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 2 }} />
                </div>
                <div className="font-mono" style={{ fontSize: 10, marginTop: 1, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Roster({ state, onMovePlayer, onReleasePlayer }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'starters' | 'subs'>('starters');
  const [statsCache, setStatsCache] = useState<Map<string, SeasonAvg>>(new Map());
  const [careerAvg, setCareerAvg] = useState<SeasonAvg | null>(null);

  const team = state.teams.get(state.playerTeamId);
  const starterIds = new Set(team?.rosterIds ?? []);
  const ROLE_ORDER = { duelist: 0, initiator: 1, controller: 2, sentinel: 3 } as const;
  const byRole = (a: Player, b: Player) => ROLE_ORDER[a.primaryRole] - ROLE_ORDER[b.primaryRole];
  const starters = ([...starterIds].map(id => state.players.get(id)).filter(Boolean) as Player[]).sort(byRole);
  const subs = ((team?.subIds ?? [])
    .filter(id => !starterIds.has(id))
    .map(id => state.players.get(id))
    .filter(Boolean) as Player[]).sort(byRole);
  const listed = tab === 'starters' ? starters : subs;

  const coachEntries: { coach: Coach; role: 'head' | 'assistant' }[] = [];
  if (team?.headCoachId) {
    const c = state.coaches.get(team.headCoachId);
    if (c) coachEntries.push({ coach: c, role: 'head' });
  }
  if (team?.assistantCoachId) {
    const c = state.coaches.get(team.assistantCoachId);
    if (c) coachEntries.push({ coach: c, role: 'assistant' });
  }

  useEffect(() => {
    const team = state.teams.get(state.playerTeamId);
    const playerIds = [...(team?.rosterIds ?? []), ...(team?.subIds ?? [])];
    if (playerIds.length === 0) return;
    let cancelled = false;
    Promise.all(
      playerIds.map(id =>
        playerMatchStatsRepo.getByPlayerSeason(id, state.season).then(s => [id, avgFromStats(s)] as const)
      )
    ).then(entries => {
      if (cancelled) return;
      const map = new Map<string, SeasonAvg>();
      entries.forEach(([id, avg]) => { if (avg) map.set(id, avg); });
      setStatsCache(map);
    });
    return () => { cancelled = true; };
  }, [state.playerTeamId, state.season, state.week]);

  useEffect(() => {
    if (!selectedId) { setCareerAvg(null); return; }
    let cancelled = false;
    playerMatchStatsRepo.getByPlayer(selectedId).then(all => {
      if (cancelled) return;
      setCareerAvg(avgFromStats(all));
    });
    return () => { cancelled = true; };
  }, [selectedId]);

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
          <CoachSection coaches={coachEntries} />
        </div>
      </div>

      {/* Right detail panel */}
      {selectedPlayer && (
        <div className="scroll-area" style={{ width: 340, padding: 16, borderLeft: '1px solid var(--border)' }}>
          <PlayerDetail
            player={selectedPlayer}
            roleRatings={selectedRoleRatings}
            seasonAvg={statsCache.get(selectedPlayer.id) ?? null}
            careerAvg={careerAvg}
            isStarter={starterIds.has(selectedPlayer.id)}
            canPromote={starters.length < 5}
            onMove={onMovePlayer}
            onRelease={onReleasePlayer ? (id) => { onReleasePlayer(id); setSelectedId(null); } : undefined}
          />
        </div>
      )}
    </div>
  );
}
