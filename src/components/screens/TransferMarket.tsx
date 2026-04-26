import { useState, useMemo } from 'react';
import type { GameState, Player, PlayerRole, Coach, CoachRole } from '../../types';
import { RoleBadge } from '../shared/RoleBadge';
import { StatBar } from '../shared/StatBar';

interface Props {
  state: GameState;
  onHireCoach?: (coachId: string, role: CoachRole) => void;
  onFireCoach?: (role: CoachRole) => void;
}

type Tab = 'players' | 'coaches';
type FilterRole = PlayerRole | 'all';
type FilterStatus = 'all' | 'free' | 'contracted';

function acceptanceLikelihood(
  player: Player,
  offeredSalary: number,
  orgPrestige: number
): number {
  const salaryRatio = offeredSalary / player.salary;
  const salaryScore = Math.min(1, salaryRatio - 0.5) * 60;
  const prestigeScore = (orgPrestige / 100) * 40;
  return Math.round(Math.max(5, Math.min(95, salaryScore + prestigeScore)));
}

function PlayerCard({ player, onOffer, showOffer }: {
  player: Player;
  onOffer: (p: Player) => void;
  showOffer: boolean;
}) {
  return (
    <div className="card" style={{ padding: '10px 12px' }}>
      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <RoleBadge role={player.primaryRole} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{player.alias}</div>
            <div className="text-dim text-xs">{player.firstName} {player.lastName}</div>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <div className="text-right">
            <div className="font-mono text-xs">${player.salary.toLocaleString()}/yr</div>
            <div className="text-dim text-xs">{player.nationality} · Age {player.age}</div>
          </div>
          {showOffer && (
            <button className="btn btn-teal" style={{ fontSize: 11 }} onClick={() => onOffer(player)}>
              Make Offer
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-3" style={{ marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <StatBar label="AIM" value={player.aim} color="var(--red)" />
        </div>
        <div style={{ flex: 1 }}>
          <StatBar label="GS" value={player.gameSense} color="var(--blue)" />
        </div>
        <div style={{ flex: 1 }}>
          <StatBar label="CLUTCH" value={player.clutch} color="var(--amber)" />
        </div>
      </div>
      {player.teamId && (
        <div className="text-dim text-xs" style={{ marginTop: 4 }}>
          Under contract — transfer fee required
        </div>
      )}
    </div>
  );
}

function OfferModal({ player, state, onClose, onSend }: {
  player: Player;
  state: GameState;
  onClose: () => void;
  onSend: (salary: number, length: number, fee: number) => void;
}) {
  const [salary, setSalary] = useState(Math.round(player.salary * 1.1 / 10000) * 10000);
  const [length, setLength] = useState(2);
  const [fee, setFee] = useState(player.teamId ? Math.round(player.salary * 2 / 10000) * 10000 : 0);

  const org = [...state.orgs.values()].find(o => o.teamId === state.playerTeamId);
  const likelihood = acceptanceLikelihood(player, salary, org?.prestige ?? 50);
  const likelihoodColor = likelihood >= 60 ? 'var(--teal)' : likelihood >= 35 ? 'var(--amber)' : 'var(--red)';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000a', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div className="card p-4 flex-col gap-3" style={{ width: 380 }}>
        <div className="flex justify-between items-center">
          <h3 className="font-head" style={{ fontSize: 16 }}>Transfer Offer — {player.alias}</h3>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        {player.teamId && (
          <div>
            <label className="text-dim text-xs font-head uppercase">Transfer Fee ($)</label>
            <input
              type="number"
              value={fee}
              onChange={e => setFee(Number(e.target.value))}
              style={{ width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', padding: '6px 10px', marginTop: 4 }}
            />
          </div>
        )}

        <div>
          <label className="text-dim text-xs font-head uppercase">Offered Salary ($/yr)</label>
          <input
            type="number"
            value={salary}
            step={5000}
            onChange={e => setSalary(Number(e.target.value))}
            style={{ width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', padding: '6px 10px', marginTop: 4 }}
          />
          <div className="text-dim text-xs" style={{ marginTop: 3 }}>Current: ${player.salary.toLocaleString()}/yr</div>
        </div>

        <div>
          <label className="text-dim text-xs font-head uppercase">Contract Length (seasons)</label>
          <div className="flex gap-2" style={{ marginTop: 4 }}>
            {[1, 2, 3].map(l => (
              <button key={l} className={`btn ${length === l ? 'btn-teal' : ''}`} onClick={() => setLength(l)}>
                {l}yr
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center" style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
          <span className="text-dim text-xs font-head uppercase">Acceptance Likelihood</span>
          <span className="font-mono bold" style={{ color: likelihoodColor, fontSize: 18 }}>{likelihood}%</span>
        </div>

        <button className="btn btn-teal" onClick={() => onSend(salary, length, fee)}>
          Send Offer
        </button>
      </div>
    </div>
  );
}

function CoachCard({ coach, currentTeamName, onHire, canHire }: {
  coach: Coach;
  currentTeamName?: string;
  onHire?: (c: Coach) => void;
  canHire: boolean;
}) {
  return (
    <div className="card" style={{ padding: '10px 12px' }}>
      <div className="flex justify-between items-center">
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{coach.firstName} {coach.lastName}</div>
          <div className="text-dim text-xs">{coach.nationality} · Age {coach.age}</div>
          {currentTeamName && (
            <div className="text-xs" style={{ color: 'var(--teal)', marginTop: 2 }}>{currentTeamName}</div>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <div className="text-right">
            <div className="font-mono text-xs">${coach.salary.toLocaleString()}/yr</div>
          </div>
          {canHire && onHire && (
            <button className="btn btn-teal" style={{ fontSize: 11 }} onClick={() => onHire(coach)}>
              Hire
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-3" style={{ marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <StatBar label="TACTICS" value={coach.tactics} color="var(--red)" />
        </div>
        <div style={{ flex: 1 }}>
          <StatBar label="SCOUTING" value={coach.scouting} color="var(--blue)" />
        </div>
        <div style={{ flex: 1 }}>
          <StatBar label="MORALE" value={coach.moraleBoost} color="var(--amber)" />
        </div>
      </div>
    </div>
  );
}

function HireModal({ coach, state, onClose, onHire }: {
  coach: Coach;
  state: GameState;
  onClose: () => void;
  onHire: (role: CoachRole) => void;
}) {
  const [role, setRole] = useState<CoachRole>('head');
  const team = state.teams.get(state.playerTeamId);
  const currentHead = team?.headCoachId ? state.coaches.get(team.headCoachId) : null;
  const currentAsst = team?.assistantCoachId ? state.coaches.get(team.assistantCoachId) : null;
  const displaced = role === 'head' ? currentHead : currentAsst;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000a', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div className="card p-4 flex-col gap-3" style={{ width: 360 }}>
        <div className="flex justify-between items-center">
          <h3 className="font-head" style={{ fontSize: 16 }}>Hire Coach</h3>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600 }}>{coach.firstName} {coach.lastName}</div>
          <div className="text-dim text-xs">{coach.nationality} · ${coach.salary.toLocaleString()}/yr</div>
        </div>

        <div>
          <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 6 }}>Hire as</div>
          <div className="flex gap-2">
            <button className={`btn ${role === 'head' ? 'btn-teal' : ''}`} style={{ flex: 1 }} onClick={() => setRole('head')}>
              Head Coach
              {currentHead && <div className="text-xs" style={{ marginTop: 2, opacity: 0.7 }}>replaces {currentHead.firstName} {currentHead.lastName}</div>}
            </button>
            <button className={`btn ${role === 'assistant' ? 'btn-teal' : ''}`} style={{ flex: 1 }} onClick={() => setRole('assistant')}>
              Assistant
              {currentAsst && <div className="text-xs" style={{ marginTop: 2, opacity: 0.7 }}>replaces {currentAsst.firstName} {currentAsst.lastName}</div>}
              {!currentAsst && <div className="text-xs" style={{ marginTop: 2, opacity: 0.7 }}>empty slot</div>}
            </button>
          </div>
        </div>

        {displaced && (
          <div style={{ fontSize: 12, color: 'var(--amber)', padding: '6px 10px', background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
            {displaced.firstName} {displaced.lastName} will be released to free agency.
          </div>
        )}

        <button className="btn btn-teal" onClick={() => onHire(role)}>
          Confirm Hire
        </button>
      </div>
    </div>
  );
}

export function TransferMarket({ state, onHireCoach, onFireCoach }: Props) {
  const [tab, setTab] = useState<Tab>('players');

  // ── Players tab state ──
  const [filterRole, setFilterRole] = useState<FilterRole>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [offerTarget, setOfferTarget] = useState<Player | null>(null);
  const [sentOffers, setSentOffers] = useState<string[]>([]);

  // ── Coaches tab state ──
  const [coachSearch, setCoachSearch] = useState('');
  const [hireTarget, setHireTarget] = useState<Coach | null>(null);

  const allPlayers = useMemo(() => {
    const out: Player[] = [];
    state.players.forEach(p => {
      if (p.teamId === state.playerTeamId) return;
      out.push(p);
    });
    return out.sort((a, b) => (b.aim + b.gameSense) - (a.aim + a.gameSense));
  }, [state]);

  const filtered = useMemo(() => {
    return allPlayers.filter(p => {
      if (filterRole !== 'all' && p.primaryRole !== filterRole) return false;
      if (filterStatus === 'free' && p.teamId) return false;
      if (filterStatus === 'contracted' && !p.teamId) return false;
      if (search && !p.alias.toLowerCase().includes(search.toLowerCase()) &&
          !p.firstName.toLowerCase().includes(search.toLowerCase()) &&
          !p.lastName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [allPlayers, filterRole, filterStatus, search]);

  const freeAgentCoaches = useMemo(() => {
    return state.freeAgentCoaches
      .map(id => state.coaches.get(id))
      .filter((c): c is Coach => !!c)
      .filter(c => {
        if (!coachSearch) return true;
        const q = coachSearch.toLowerCase();
        return `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
               c.nationality.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.tactics + b.scouting + b.moraleBoost) - (a.tactics + a.scouting + a.moraleBoost));
  }, [state, coachSearch]);

  const playerTeam = state.teams.get(state.playerTeamId);
  const headCoach = playerTeam?.headCoachId ? state.coaches.get(playerTeam.headCoachId) : null;
  const asstCoach = playerTeam?.assistantCoachId ? state.coaches.get(playerTeam.assistantCoachId) : null;

  const teamNames = useMemo(() => {
    const map = new Map<string, string>();
    state.teams.forEach(t => map.set(t.id, t.name));
    return map;
  }, [state]);

  const handleSendOffer = (_salary: number, _length: number, _fee: number) => {
    if (offerTarget) {
      setSentOffers(prev => [...prev, offerTarget.id]);
      setOfferTarget(null);
    }
  };

  const handleConfirmHire = (role: CoachRole) => {
    if (!hireTarget || !onHireCoach) return;
    onHireCoach(hireTarget.id, role);
    setHireTarget(null);
  };

  return (
    <div className="flex-col" style={{ height: '100%', padding: 16, gap: 12, overflow: 'hidden' }}>
      <div className="flex justify-between items-center">
        <h2 className="font-head" style={{ fontSize: 18 }}>Transfer Market</h2>
        <div className="flex gap-1">
          <button className={`btn ${tab === 'players' ? 'btn-red' : ''}`} onClick={() => setTab('players')}>Players</button>
          <button className={`btn ${tab === 'coaches' ? 'btn-red' : ''}`} onClick={() => setTab('coaches')}>Coaches</button>
        </div>
      </div>

      {tab === 'players' && (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search player..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', padding: '5px 10px', width: 180 }}
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <div className="flex gap-1">
              {(['all', 'duelist', 'initiator', 'controller', 'sentinel'] as const).map(r => (
                <button key={r} className={`btn ${filterRole === r ? 'btn-red' : ''}`} style={{ fontSize: 11 }}
                  onClick={() => setFilterRole(r)}>
                  {r === 'all' ? 'All Roles' : r.slice(0, 4).toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['all', 'free', 'contracted'] as const).map(s => (
                <button key={s} className={`btn ${filterStatus === s ? 'btn-red' : ''}`} style={{ fontSize: 11 }}
                  onClick={() => setFilterStatus(s)}>
                  {s === 'all' ? 'All' : s === 'free' ? 'Free Agents' : 'Contracted'}
                </button>
              ))}
            </div>
          </div>

          <div className="text-dim text-xs">{filtered.length} players found</div>

          <div className="scroll-area flex-col gap-2" style={{ flex: 1 }}>
            {filtered.map(p => (
              <PlayerCard
                key={p.id}
                player={p}
                onOffer={setOfferTarget}
                showOffer={!sentOffers.includes(p.id)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="text-dim text-sm" style={{ padding: 20 }}>No players match your filters.</div>
            )}
          </div>

          {offerTarget && (
            <OfferModal
              player={offerTarget}
              state={state}
              onClose={() => setOfferTarget(null)}
              onSend={handleSendOffer}
            />
          )}
        </>
      )}

      {tab === 'coaches' && (
        <>
          {/* Current staff */}
          <div>
            <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 6 }}>Your Coaching Staff</div>
            <div className="flex gap-2">
              <div style={{ flex: 1 }}>
                <div className="text-dim text-xs" style={{ marginBottom: 4 }}>HEAD COACH</div>
                {headCoach ? (
                  <div className="card" style={{ padding: '8px 10px' }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{headCoach.firstName} {headCoach.lastName}</div>
                        <div className="text-dim text-xs">{headCoach.nationality} · ${headCoach.salary.toLocaleString()}/yr</div>
                      </div>
                      {onFireCoach && (
                        <button className="btn" style={{ fontSize: 10 }} onClick={() => onFireCoach('head')}>Release</button>
                      )}
                    </div>
                    <div className="flex gap-2" style={{ marginTop: 6 }}>
                      <StatBar label="TAC" value={headCoach.tactics} color="var(--red)" />
                      <StatBar label="SCT" value={headCoach.scouting} color="var(--blue)" />
                      <StatBar label="MOR" value={headCoach.moraleBoost} color="var(--amber)" />
                    </div>
                  </div>
                ) : (
                  <div className="card text-dim text-xs" style={{ padding: '10px', textAlign: 'center' }}>No head coach</div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div className="text-dim text-xs" style={{ marginBottom: 4 }}>ASSISTANT COACH</div>
                {asstCoach ? (
                  <div className="card" style={{ padding: '8px 10px' }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{asstCoach.firstName} {asstCoach.lastName}</div>
                        <div className="text-dim text-xs">{asstCoach.nationality} · ${asstCoach.salary.toLocaleString()}/yr</div>
                      </div>
                      {onFireCoach && (
                        <button className="btn" style={{ fontSize: 10 }} onClick={() => onFireCoach('assistant')}>Release</button>
                      )}
                    </div>
                    <div className="flex gap-2" style={{ marginTop: 6 }}>
                      <StatBar label="TAC" value={asstCoach.tactics} color="var(--red)" />
                      <StatBar label="SCT" value={asstCoach.scouting} color="var(--blue)" />
                      <StatBar label="MOR" value={asstCoach.moraleBoost} color="var(--amber)" />
                    </div>
                  </div>
                ) : (
                  <div className="card text-dim text-xs" style={{ padding: '10px', textAlign: 'center' }}>No assistant coach</div>
                )}
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
              <div className="text-dim text-xs font-head uppercase">Free Agent Coaches</div>
              <input
                type="text"
                placeholder="Search..."
                value={coachSearch}
                onChange={e => setCoachSearch(e.target.value)}
                style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', padding: '4px 8px', width: 140, fontSize: 12 }}
              />
            </div>
            <div className="text-dim text-xs" style={{ marginBottom: 6 }}>{freeAgentCoaches.length} coaches available</div>
          </div>

          <div className="scroll-area flex-col gap-2" style={{ flex: 1 }}>
            {freeAgentCoaches.map(c => {
              const coachTeam = c.teamId ? teamNames.get(c.teamId) : undefined;
              return (
                <CoachCard
                  key={c.id}
                  coach={c}
                  currentTeamName={coachTeam}
                  onHire={onHireCoach ? setHireTarget : undefined}
                  canHire={!!onHireCoach}
                />
              );
            })}
            {freeAgentCoaches.length === 0 && (
              <div className="text-dim text-sm" style={{ padding: 20 }}>No free agent coaches available.</div>
            )}
          </div>

          {hireTarget && (
            <HireModal
              coach={hireTarget}
              state={state}
              onClose={() => setHireTarget(null)}
              onHire={handleConfirmHire}
            />
          )}
        </>
      )}
    </div>
  );
}
