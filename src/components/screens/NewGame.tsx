import { useState } from 'react';
import type { RegionId } from '../../types';

interface Props {
  onStart: (regionId: RegionId, teamIndex: number) => void;
}

const REGIONS: { id: RegionId; label: string; teams: string[] }[] = [
  {
    id: 'americas',
    label: 'Americas',
    teams: ['Sentinels', 'NRG Esports', 'Cloud9', 'Evil Geniuses', 'LOUD', 'MIBR',
            'KRÜ Esports', 'Leviatán', '100 Thieves', 'G2 Esports', 'Disguised', 'Ghost Gaming'],
  },
  {
    id: 'emea',
    label: 'EMEA',
    teams: ['Fnatic', 'Team Liquid', 'Natus Vincere', 'Team Vitality', 'BBL Esports', 'NAVI',
            'FUT Esports', 'Karmine Corp', 'Giants Gaming', 'Oxygen Esports', 'Guild Esports', 'M8'],
  },
  {
    id: 'pacific',
    label: 'Pacific',
    teams: ['Paper Rex', 'ZETA DIVISION', 'DRX', 'T1', 'Gen.G', 'Rex Regum Qeon',
            'BOOM Esports', 'Global Esports', 'Bleed Esports', 'TALON Esports', 'Nongshim RedForce', 'Team Secret'],
  },
  {
    id: 'china',
    label: 'China',
    teams: ['EDward Gaming', 'FPXFIRE', 'Bilibili Gaming', 'Wolves Esports', 'Dragon Ranger', 'All Gamers',
            'TYLOO', 'Nova Esports', 'TRACE Esports', 'Weibo Gaming', 'JDG Esports', 'Rare Atom'],
  },
];

export function NewGame({ onStart }: Props) {
  const [region, setRegion] = useState<RegionId>('americas');
  const [teamIndex, setTeamIndex] = useState(0);

  const selectedRegion = REGIONS.find(r => r.id === region)!;

  return (
    <div className="flex-col items-center" style={{ minHeight: '100vh', background: 'var(--bg-base)', padding: 40 }}>
      <div style={{ maxWidth: 600, width: '100%' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 className="font-head text-red" style={{ fontSize: 36, letterSpacing: '0.1em' }}>
            VALORANT GM
          </h1>
          <p className="text-dim" style={{ marginTop: 4 }}>Valorant GM Simulator inspired by ZenGM.</p>
        </div>

        <div className="card p-4" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text-secondary)' }}>SELECT REGION</h2>
          <div className="flex gap-2">
            {REGIONS.map(r => (
              <button
                key={r.id}
                className={`btn ${region === r.id ? 'btn-red' : ''}`}
                onClick={() => { setRegion(r.id); setTeamIndex(0); }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-4" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text-secondary)' }}>SELECT TEAM</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {selectedRegion.teams.map((name, idx) => (
              <button
                key={idx}
                className={`btn ${teamIndex === idx ? 'btn-teal' : ''}`}
                style={{ justifyContent: 'flex-start' }}
                onClick={() => setTeamIndex(idx)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn btn-red"
          style={{ fontSize: 14, padding: '10px 28px' }}
          onClick={() => onStart(region, teamIndex)}
        >
          Start Game
        </button>
      </div>
    </div>
  );
}
