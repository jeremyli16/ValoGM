import { useState, useMemo } from 'react';
import type { GameState, Player, Contract, Decision } from '../../types';
import { RoleBadge } from '../shared/RoleBadge';
import { BENCH_SALARY_FACTOR } from '../../types';

interface Props {
  state: GameState;
  onSubmitRenewal?: (playerId: string, salary: number, length: number) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calYearsLeft(endSeason: number, season: number): number {
  return endSeason / 3 - Math.ceil(season / 3) + 1;
}

function contractStatus(endSeason: number, season: number): 'expired' | 'expiring' | 'active' {
  const yrs = calYearsLeft(endSeason, season);
  if (yrs <= 0) return 'expired';
  if (yrs === 1) return 'expiring';
  return 'active';
}

const STATUS_COLOR: Record<string, string> = {
  expired:  'var(--red)',
  expiring: 'var(--amber)',
  active:   'var(--teal)',
};

// ─── Pending Renewal Card ─────────────────────────────────────────────────────

function RenewalCard({
  decision,
  player,
  onSubmit,
}: {
  decision: Decision;
  player: Player;
  onSubmit: (salary: number, length: number) => void;
}) {
  const asking = decision.data.askingSalary as number;
  const isPending = !!decision.data.offerPending;
  const wasRejected = !isPending && 'offeredSalary' in decision.data;

  const [salary, setSalary] = useState(
    wasRejected ? (decision.data.offeredSalary as number) : asking,
  );
  const [length, setLength] = useState(2);

  const salaryRatio = salary / asking;
  const likelihoodColor = salaryRatio >= 1.0
    ? 'var(--teal)'
    : salaryRatio >= 0.85
    ? 'var(--amber)'
    : 'var(--red)';

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div className="flex justify-between items-start">
        <div className="flex gap-2 items-center">
          <RoleBadge role={player.primaryRole} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-head)', letterSpacing: '0.04em' }}>
              {player.alias.toUpperCase()}
            </div>
            <div className="text-dim text-xs">
              {player.firstName} {player.lastName} · Age {player.age}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xs" style={{ color: 'var(--amber)' }}>
            Asking ${asking.toLocaleString()}/yr
          </div>
          <div className="text-dim text-xs">
            Morale {player.morale}
          </div>
        </div>
      </div>

      {isPending ? (
        <div style={{
          marginTop: 10, padding: '8px 10px',
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          fontSize: 12, color: 'var(--text-secondary)',
        }}>
          Offer of ${(decision.data.offeredSalary as number).toLocaleString()}/yr ·{' '}
          {decision.data.offeredLength}yr — response next week
        </div>
      ) : (
        <>
          {wasRejected && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red)' }}>
              Rejected ${(decision.data.offeredSalary as number).toLocaleString()}/yr — revise offer
            </div>
          )}
          <div className="flex gap-3 items-end" style={{ marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="text-dim text-xs font-head uppercase">Offered Salary</label>
              <input
                type="number"
                value={salary}
                step={5000}
                onChange={e => setSalary(Number(e.target.value))}
                style={{
                  width: '100%', marginTop: 3,
                  background: 'var(--bg-3)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
                  padding: '5px 8px', fontSize: 13,
                }}
              />
            </div>
            <div>
              <label className="text-dim text-xs font-head uppercase">Years</label>
              <div className="flex gap-1" style={{ marginTop: 3 }}>
                {[1, 2, 3].map(l => (
                  <button
                    key={l}
                    className={`btn ${length === l ? 'btn-teal' : ''}`}
                    style={{ padding: '5px 10px' }}
                    onClick={() => setLength(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-dim text-xs font-head uppercase" style={{ marginBottom: 3 }}>Likelihood</div>
              <div className="font-mono bold" style={{ color: likelihoodColor, fontSize: 16 }}>
                {salaryRatio >= 1.05 ? '~90%' : salaryRatio >= 1.0 ? '~80%' : salaryRatio >= 0.9 ? '~60%' : salaryRatio >= 0.8 ? '~30%' : '~10%'}
              </div>
            </div>
            <button
              className="btn btn-teal"
              style={{ fontSize: 12 }}
              onClick={() => onSubmit(salary, length)}
            >
              Send Offer
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Contract Row ─────────────────────────────────────────────────────────────

function ContractRow({ player, contract, season, isBench }: {
  player: Player;
  contract: Contract;
  season: number;
  isBench: boolean;
}) {
  const status = contractStatus(contract.endSeason, season);
  const yearsLeft = calYearsLeft(contract.endSeason, season);
  const effectiveSalary = isBench ? contract.salary * BENCH_SALARY_FACTOR : contract.salary;

  return (
    <tr>
      <td>
        <div className="flex gap-2 items-center">
          <RoleBadge role={player.primaryRole} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{player.alias}</div>
            <div className="text-dim" style={{ fontSize: 10 }}>{isBench ? 'BENCH' : 'STARTER'}</div>
          </div>
        </div>
      </td>
      <td className="font-mono">${contract.salary.toLocaleString()}</td>
      <td className="font-mono" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
        ${effectiveSalary.toLocaleString()}
      </td>
      <td className="font-mono" style={{ fontSize: 12 }}>
        {yearsLeft <= 0 ? '—' : `${yearsLeft}y`}
      </td>
      <td>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-head)', letterSpacing: '0.04em', color: STATUS_COLOR[status] }}>
          {status.toUpperCase()}
        </span>
      </td>
    </tr>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function Finances({ state, onSubmitRenewal }: Props) {
  const team = state.teams.get(state.playerTeamId);
  const org = useMemo(
    () => [...state.orgs.values()].find(o => o.teamId === state.playerTeamId),
    [state],
  );

  // ── Payroll ──
  const starterSalary = useMemo(() => {
    return (team?.rosterIds ?? []).reduce((sum, id) => {
      const p = state.players.get(id);
      const c = p?.contractId ? state.contracts.get(p.contractId) : null;
      return sum + (c?.salary ?? 0);
    }, 0);
  }, [state, team]);

  const benchSalary = useMemo(() => {
    return (team?.subIds ?? []).reduce((sum, id) => {
      const p = state.players.get(id);
      const c = p?.contractId ? state.contracts.get(p.contractId) : null;
      return sum + (c?.salary ?? 0) * BENCH_SALARY_FACTOR;
    }, 0);
  }, [state, team]);

  const headCoach = team?.headCoachId ? state.coaches.get(team.headCoachId) : null;
  const asstCoach = team?.assistantCoachId ? state.coaches.get(team.assistantCoachId) : null;
  const coachSalary = (headCoach?.salary ?? 0) + (asstCoach?.salary ?? 0);
  const totalPayroll = starterSalary + benchSalary + coachSalary;
  const income = (org?.sponsorIncome ?? 0) + (org?.prizeEarnings ?? 0);
  const net = income - totalPayroll;

  // ── Contracts ──
  const starterContracts = useMemo(() => {
    return (team?.rosterIds ?? [])
      .map(id => {
        const player = state.players.get(id);
        if (!player?.contractId) return null;
        const contract = state.contracts.get(player.contractId);
        if (!contract) return null;
        return { player, contract, isBench: false };
      })
      .filter(Boolean) as { player: Player; contract: Contract; isBench: boolean }[];
  }, [state, team]);

  const benchContracts = useMemo(() => {
    const starterSet = new Set(team?.rosterIds ?? []);
    return (team?.subIds ?? [])
      .filter(id => !starterSet.has(id))
      .map(id => {
        const player = state.players.get(id);
        if (!player?.contractId) return null;
        const contract = state.contracts.get(player.contractId);
        if (!contract) return null;
        return { player, contract, isBench: true };
      })
      .filter(Boolean) as { player: Player; contract: Contract; isBench: boolean }[];
  }, [state, team]);

  const allContracts = [...starterContracts, ...benchContracts].sort(
    (a, b) => a.contract.endSeason - b.contract.endSeason,
  );

  // ── Pending renewals ──
  const renewalDecisions = state.pendingDecisions.filter(d => d.type === 'contract_renewal');

  return (
    <div className="scroll-area" style={{ height: '100%', padding: '20px 24px' }}>

      {/* ── Budget balance ── */}
      {org && (
        <div style={{ marginBottom: 20 }}>
          <div className="text-dim text-xs font-head uppercase" style={{ letterSpacing: '0.08em', marginBottom: 10 }}>
            Organization Budget
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 6 }}>CURRENT BUDGET</div>
              <div className="font-mono" style={{ fontSize: 18, color: org.budget >= 0 ? 'var(--teal)' : 'var(--red)' }}>
                ${org.budget.toLocaleString()}
              </div>
            </div>
            <div className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 6 }}>SPONSOR INCOME</div>
              <div className="font-mono" style={{ fontSize: 16, color: 'var(--teal)' }}>${org.sponsorIncome.toLocaleString()}</div>
              <div className="text-dim" style={{ fontSize: 10 }}>/yr</div>
            </div>
            <div className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 6 }}>PRIZE EARNINGS</div>
              <div className="font-mono" style={{ fontSize: 16, color: 'var(--amber)' }}>${org.prizeEarnings.toLocaleString()}</div>
              <div className="text-dim" style={{ fontSize: 10 }}>total</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Payroll summary ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="text-dim text-xs font-head uppercase" style={{ letterSpacing: '0.08em', marginBottom: 12 }}>
          Payroll Summary
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'STARTER PAYROLL', value: starterSalary, color: 'var(--text-primary)' },
            { label: 'BENCH PAYROLL',   value: benchSalary,   color: 'var(--text-secondary)' },
            { label: 'COACHING STAFF',  value: coachSalary,   color: 'var(--text-secondary)' },
            { label: 'TOTAL PAYROLL',   value: totalPayroll,  color: 'var(--red)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-head)', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 6 }}>
                {label}
              </div>
              <div className="font-mono" style={{ fontSize: 16, color }}>
                ${value.toLocaleString()}
              </div>
              <div className="text-dim" style={{ fontSize: 10 }}>/yr</div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 items-center" style={{ marginTop: 10, padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <div>
            <span className="text-dim text-xs font-head uppercase">Annual Net </span>
            <span className="font-mono text-xs" style={{ color: net >= 0 ? 'var(--teal)' : 'var(--red)' }}>
              {net >= 0 ? '+' : ''}${net.toLocaleString()}/yr
            </span>
          </div>
          <span className="text-dim">·</span>
          <div>
            <span className="text-dim text-xs font-head uppercase">Applied at start of each calendar year</span>
          </div>
        </div>
      </div>

      {/* ── Pending renewals ── */}
      {renewalDecisions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 10, fontFamily: 'var(--font-head)', letterSpacing: '0.08em',
            color: 'var(--amber)', marginBottom: 12,
          }}>
            PENDING RENEWALS — {state.phase === 'offseason' ? `OFFSEASON WK ${state.week}` : ''}
          </div>
          <div className="flex-col gap-2">
            {renewalDecisions.map(d => {
              const playerId = d.data.playerId as string;
              const player = state.players.get(playerId);
              if (!player) return null;
              return (
                <RenewalCard
                  key={d.id}
                  decision={d}
                  player={player}
                  onSubmit={(salary, length) => onSubmitRenewal?.(playerId, salary, length)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Player contracts ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="text-dim text-xs font-head uppercase" style={{ letterSpacing: '0.08em', marginBottom: 12 }}>
          Player Contracts
        </div>
        {allContracts.length === 0 ? (
          <div className="text-dim text-sm">No contracts on file.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Salary</th>
                <th>Effective</th>
                <th>Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {allContracts.map(({ player, contract, isBench }) => (
                <ContractRow
                  key={player.id}
                  player={player}
                  contract={contract}
                  season={state.season}
                  isBench={isBench}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Coaching staff ── */}
      {(headCoach || asstCoach) && (
        <div>
          <div className="text-dim text-xs font-head uppercase" style={{ letterSpacing: '0.08em', marginBottom: 12 }}>
            Coaching Staff
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Coach</th><th>Role</th><th>Salary</th><th>Remaining</th><th>Status</th></tr>
            </thead>
            <tbody>
              {headCoach && (() => {
                const end = headCoach.contractEndSeason;
                const status = end != null ? contractStatus(end, state.season) : null;
                const yearsLeft = end != null ? calYearsLeft(end, state.season) : null;
                return (
                  <tr>
                    <td style={{ fontWeight: 600 }}>{headCoach.firstName} {headCoach.lastName}</td>
                    <td><span className="text-dim text-xs font-head">HEAD COACH</span></td>
                    <td className="font-mono">${headCoach.salary.toLocaleString()}</td>
                    <td className="font-mono" style={{ fontSize: 12 }}>{yearsLeft != null && yearsLeft > 0 ? `${yearsLeft}y` : '—'}</td>
                    <td>{status && <span style={{ fontSize: 11, fontFamily: 'var(--font-head)', letterSpacing: '0.04em', color: STATUS_COLOR[status] }}>{status.toUpperCase()}</span>}</td>
                  </tr>
                );
              })()}
              {asstCoach && (() => {
                const end = asstCoach.contractEndSeason;
                const status = end != null ? contractStatus(end, state.season) : null;
                const yearsLeft = end != null ? calYearsLeft(end, state.season) : null;
                return (
                  <tr>
                    <td style={{ fontWeight: 600 }}>{asstCoach.firstName} {asstCoach.lastName}</td>
                    <td><span className="text-dim text-xs font-head">ASSISTANT</span></td>
                    <td className="font-mono">${asstCoach.salary.toLocaleString()}</td>
                    <td className="font-mono" style={{ fontSize: 12 }}>{yearsLeft != null && yearsLeft > 0 ? `${yearsLeft}y` : '—'}</td>
                    <td>{status && <span style={{ fontSize: 11, fontFamily: 'var(--font-head)', letterSpacing: '0.04em', color: STATUS_COLOR[status] }}>{status.toUpperCase()}</span>}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
