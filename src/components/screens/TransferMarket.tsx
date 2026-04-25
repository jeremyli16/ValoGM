import { useState, useMemo } from 'react';
import type { GameState, Player, PlayerRole } from '../../types';
import { RoleBadge } from '../shared/RoleBadge';
import { StatBar } from '../shared/StatBar';

interface Props { state: GameState; }

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

export function TransferMarket({ state }: Props) {
  const [filterRole, setFilterRole] = useState<FilterRole>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [offerTarget, setOfferTarget] = useState<Player | null>(null);
  const [sentOffers, setSentOffers] = useState<string[]>([]);

  const allPlayers = useMemo(() => {
    const out: Player[] = [];
    state.players.forEach(p => {
      if (p.teamId === state.playerTeamId) return; // already on team
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

  const handleSendOffer = (salary: number, length: number, fee: number) => {
    if (offerTarget) {
      setSentOffers(prev => [...prev, offerTarget.id]);
      setOfferTarget(null);
    }
  };

  return (
    <div className="flex-col" style={{ height: '100%', padding: 16, gap: 12, overflow: 'hidden' }}>
      <div className="flex justify-between items-center">
        <h2 className="font-head" style={{ fontSize: 18 }}>Transfer Market</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search player..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', padding: '5px 10px', width: 180 }}
          />
        </div>
      </div>

      {/* Filters */}
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
    </div>
  );
}
