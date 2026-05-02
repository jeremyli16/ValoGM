import { useState } from 'react';
import type { GameState, Player, PlayerRole } from '../../types';
import { MAP_POOL, ROLE_AGENTS, AGENT_ROLE, PRACTICE_BUDGET } from '../../types';

interface Props {
  state: GameState;
  onSetPracticeAllocation: (allocation: Record<string, number>) => void;
  onSetMapComp: (mapName: string, agents: string[]) => void;
}

function scoreColor(score: number): string {
  if (score >= 70) return 'var(--teal)';
  if (score >= 40) return 'var(--amber)';
  return 'var(--red)';
}

// ─── Map Pool Panel ───────────────────────────────────────────────────────────

function MapPoolPanel({ state, onSet }: {
  state: GameState;
  onSet: (allocation: Record<string, number>) => void;
}) {
  const team = state.teams.get(state.playerTeamId);
  const allocation: Record<string, number> = { ...(team?.practiceAllocation ?? {}) };
  const mapPool = team?.mapPool ?? {};
  const active = state.activeMapPool;
  const reserve = MAP_POOL.filter(m => !active.includes(m));

  const totalAllocated = Object.values(allocation).reduce((a, b) => a + b, 0);

  function adjust(mapName: string, delta: number) {
    const current = allocation[mapName] ?? 0;
    const next = Math.max(0, current + delta);
    const newTotal = totalAllocated - current + next;
    if (newTotal > PRACTICE_BUDGET) return;
    onSet({ ...allocation, [mapName]: next });
  }

  function renderMap(mapName: string, isActive: boolean) {
    const score = Math.round(mapPool[mapName] ?? 50);
    const pts = allocation[mapName] ?? 0;
    const noAlloc = isActive && pts === 0;

    return (
      <div key={mapName} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 8px',
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        marginBottom: 4,
      }}>
        {/* Map name */}
        <div style={{ width: 70, fontFamily: 'var(--font-head)', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }}>
          {mapName.toUpperCase()}
        </div>

        {/* Score bar */}
        <div style={{ flex: 1, height: 6, background: 'var(--bg-0)', position: 'relative', minWidth: 60 }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${score}%`,
            background: scoreColor(score),
          }} />
        </div>
        <div style={{ width: 28, fontFamily: 'var(--font-mono)', fontSize: 11, color: scoreColor(score), textAlign: 'right' }}>
          {score}
        </div>

        {/* +/- controls (only for active maps) */}
        {isActive ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className="btn"
              style={{ padding: '1px 7px', fontSize: 14, lineHeight: 1 }}
              onClick={() => adjust(mapName, -1)}
              disabled={pts === 0}
            >−</button>
            <div style={{ width: 16, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {pts}
            </div>
            <button
              className="btn"
              style={{ padding: '1px 7px', fontSize: 14, lineHeight: 1 }}
              onClick={() => adjust(mapName, 1)}
              disabled={totalAllocated >= PRACTICE_BUDGET}
            >+</button>
          </div>
        ) : (
          <div style={{ width: 72, textAlign: 'center', color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            reserve
          </div>
        )}

        {/* Decay warning */}
        {noAlloc && (
          <div style={{ position: 'relative', display: 'inline-flex' }}
            onMouseEnter={e => {
              const tip = (e.currentTarget as HTMLElement).querySelector('.decay-tip') as HTMLElement | null;
              if (tip) tip.style.display = 'block';
            }}
            onMouseLeave={e => {
              const tip = (e.currentTarget as HTMLElement).querySelector('.decay-tip') as HTMLElement | null;
              if (tip) tip.style.display = 'none';
            }}
          >
            <span style={{ color: 'var(--amber)', fontSize: 12, cursor: 'default' }}>⚠</span>
            <div className="decay-tip" style={{
              display: 'none',
              position: 'absolute',
              right: 0, bottom: 'calc(100% + 4px)',
              background: '#1f1f27',
              border: '1px solid var(--amber)',
              color: '#e8e8f0',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '4px 8px',
              whiteSpace: 'nowrap',
              zIndex: 10,
              pointerEvents: 'none',
            }}>
              Map skill will decay this week
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', overflow: 'hidden' }}>
      {/* Budget counter */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <span style={{ fontFamily: 'var(--font-head)', fontSize: 13, letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
          BUDGET
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 13,
          color: totalAllocated >= PRACTICE_BUDGET ? 'var(--teal)' : 'var(--text-primary)',
        }}>
          {totalAllocated} / {PRACTICE_BUDGET} pts
        </span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
          ACTIVE POOL
        </div>
        {active.map(m => renderMap(m, true))}

        <div style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 12, marginBottom: 4 }}>
          RESERVE
        </div>
        {reserve.map(m => renderMap(m, false))}
      </div>
    </div>
  );
}

// ─── Agent Comp Panel ─────────────────────────────────────────────────────────

function getAgentGroups(
  player: Player,
  state: GameState
): { noPenalty: string[]; penalty: string[] } {
  const noPenalty: string[] = [];
  const penalty: string[] = [];
  const allRoles: PlayerRole[] = ['duelist', 'initiator', 'controller', 'sentinel'];

  for (const role of allRoles) {
    const agents = ROLE_AGENTS[role] ?? [];
    if (role === player.primaryRole) {
      for (const a of agents) if (a !== player.mainAgent) noPenalty.push(a);
    } else {
      const rrKey = `${player.id}:${role}`;
      const rating = state.roleRatings.get(rrKey)?.trueRating ?? 0;
      if (rating >= 70) {
        for (const a of agents) noPenalty.push(a);
      } else if (rating >= 50) {
        const sorted = [...agents].sort((a, b) => (state.agentMeta[b] ?? 60) - (state.agentMeta[a] ?? 60));
        const n = Math.floor((rating - 50) / 10) + 1;
        sorted.slice(0, n).forEach(a => noPenalty.push(a));
        sorted.slice(n).forEach(a => penalty.push(a));
      } else {
        for (const a of agents) penalty.push(a);
      }
    }
  }
  return { noPenalty, penalty };
}

function affinityBadge(agent: string, mapName: string, agentMapMeta: Record<string, Record<string, number>>): string {
  const delta = agentMapMeta[agent]?.[mapName];
  if (delta === undefined || Math.abs(delta) < 0.005) return '';
  const pct = Math.round(delta * 100);
  return pct > 0 ? ` [+${pct}]` : ` [${pct}]`;
}

function CompPanel({ state, onSetComp }: {
  state: GameState;
  onSetComp: (mapName: string, agents: string[]) => void;
}) {
  const team = state.teams.get(state.playerTeamId);
  const roster = team?.rosterIds.map(id => state.players.get(id)).filter(Boolean) ?? [];
  const [activeMap, setActiveMap] = useState(state.activeMapPool[0] ?? '');
  const mapComps = team?.mapComps ?? {};
  const comp: string[] = mapComps[activeMap] ?? roster.map(p => p!.mainAgent);

  function setAgent(slotIdx: number, agent: string) {
    const next = [...comp];
    while (next.length < 5) next.push('');
    next[slotIdx] = agent;
    onSetComp(activeMap, next);
  }

  function copyComp(toMap: string) {
    onSetComp(toMap, [...comp]);
  }

  // Role / synergy analysis
  const roles = comp.map(a => AGENT_ROLE[a]).filter(Boolean);
  const roleSet = new Set(roles);
  const fullDiversity = roleSet.size === 4;
  const doubleInitiator = roles.filter(r => r === 'initiator').length >= 2;
  const hasSentinel = comp.some(a => ['Killjoy', 'Cypher'].includes(a));
  const hasSmoker = comp.some(a => AGENT_ROLE[a] === 'controller');
  const anchorSynergy = hasSentinel && hasSmoker;

  let synergyPct = 0;
  if (fullDiversity) synergyPct += 6;
  if (doubleInitiator) synergyPct += 2;
  if (anchorSynergy) synergyPct += 3;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Map tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {state.activeMapPool.map(m => (
          <button
            key={m}
            className={`btn${activeMap === m ? ' btn-teal' : ''}`}
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => setActiveMap(m)}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Player slots */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {roster.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No starters on roster.</div>
        ) : (
          roster.map((player, i) => {
            if (!player) return null;
            const selectedAgent = comp[i] ?? player.mainAgent;
            const { noPenalty, penalty } = getAgentGroups(player, state);
            const noPenaltySet = new Set([player.mainAgent, ...noPenalty]);
            const isPenalized = !noPenaltySet.has(selectedAgent);

            return (
              <div key={player.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', marginBottom: 4,
                background: 'var(--bg-2)', border: '1px solid var(--border)',
              }}>
                <div style={{ width: 80, fontFamily: 'var(--font-head)', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {player.alias.toUpperCase()}
                </div>
                <div style={{ width: 60, color: 'var(--text-dim)', fontSize: 11 }}>
                  {player.primaryRole}
                </div>
                <select
                  value={selectedAgent}
                  onChange={e => setAgent(i, e.target.value)}
                  style={{
                    flex: 1,
                    background: '#17171d',
                    border: `1px solid ${isPenalized ? 'var(--amber)' : 'var(--border)'}`,
                    color: '#e8e8f0',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    padding: '3px 6px',
                    colorScheme: 'dark',
                  }}
                >
                  <optgroup label="★ MAIN (+3%)" style={{ background: '#17171d', color: '#e8e8f0' }}>
                    <option value={player.mainAgent} style={{ background: '#17171d', color: '#e8e8f0' }}>
                      {player.mainAgent}{affinityBadge(player.mainAgent, activeMap, state.agentMapMeta)}
                    </option>
                  </optgroup>
                  {noPenalty.length > 0 && (
                    <optgroup label="── NO PENALTY ──" style={{ background: '#17171d', color: '#e8e8f0' }}>
                      {noPenalty.map(a => (
                        <option key={a} value={a} style={{ background: '#17171d', color: '#9090a8' }}>
                          {a}{affinityBadge(a, activeMap, state.agentMapMeta)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {penalty.length > 0 && (
                    <optgroup label="── PENALTY (−5%) ──" style={{ background: '#17171d', color: '#e8e8f0' }}>
                      {penalty.map(a => (
                        <option key={a} value={a} style={{ background: '#17171d', color: '#f5a623' }}>
                          {a}{affinityBadge(a, activeMap, state.agentMapMeta)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {isPenalized && (
                  <div style={{ color: 'var(--amber)', fontSize: 11 }} title="Off-role agent (−5% combat power)">~</div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Role check & synergy */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['duelist', 'initiator', 'controller', 'sentinel'] as const).map(r => (
              <span key={r} style={{
                fontSize: 11, fontFamily: 'var(--font-mono)',
                color: roles.includes(r) ? 'var(--teal)' : 'var(--text-dim)',
              }}>
                {roles.includes(r) ? '✓' : '✗'} {r[0].toUpperCase()}
              </span>
            ))}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: synergyPct > 0 ? 'var(--teal)' : 'var(--text-dim)' }}>
            Synergy {synergyPct > 0 ? `+${synergyPct}%` : '—'}
          </div>
        </div>

        {/* Copy to other maps */}
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Copy to:</span>
          {state.activeMapPool.filter(m => m !== activeMap).map(m => (
            <button key={m} className="btn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => copyComp(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Meta Panel ───────────────────────────────────────────────────────────────

function MetaPanel({ state }: { state: GameState }) {
  const meta = state.agentMeta;
  const sorted = Object.entries(meta).sort(([, a], [, b]) => b - a);

  const tiers = [
    { label: 'S', min: 70, max: Infinity, color: 'var(--teal)' },
    { label: 'A', min: 60, max: 70,       color: 'var(--amber)' },
    { label: 'B', min: 50, max: 60,       color: 'var(--text-secondary)' },
    { label: 'C', min: 0,  max: 50,       color: 'var(--text-dim)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {tiers.map(tier => {
        const agents = sorted.filter(([, s]) => s >= tier.min && s < tier.max);
        if (agents.length === 0) return null;
        return (
          <div key={tier.label} style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <span style={{
              fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 700,
              color: tier.color, width: 20, flexShrink: 0,
            }}>
              {tier.label}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {agents.map(([agent, strength]) => (
                <span key={agent} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: tier.color,
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  padding: '1px 7px',
                }}>
                  {agent} <span style={{ color: 'var(--text-dim)' }}>({Math.round(strength)})</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tactics Screen ───────────────────────────────────────────────────────────

export function Tactics({ state, onSetPracticeAllocation, onSetMapComp }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div className="font-head text-red" style={{ fontSize: 16, letterSpacing: '0.08em' }}>TACTICS</div>
      </div>

      {/* Main two-column layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Left: Map Pool */}
        <div style={{
          width: 320, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          padding: 14,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div className="font-head" style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 10 }}>
            MAP POOL
          </div>
          <MapPoolPanel state={state} onSet={onSetPracticeAllocation} />
        </div>

        {/* Right: Agent Comps */}
        <div style={{
          flex: 1,
          padding: 14,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          borderRight: '1px solid var(--border)',
        }}>
          <div className="font-head" style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 10 }}>
            AGENT COMPS
          </div>
          <CompPanel state={state} onSetComp={onSetMapComp} />
        </div>
      </div>

      {/* Bottom: Meta */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid var(--border)',
        padding: 14,
        background: 'var(--bg-1)',
      }}>
        <div className="font-head" style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 8 }}>
          META THIS SPLIT
        </div>
        <MetaPanel state={state} />
      </div>
    </div>
  );
}
