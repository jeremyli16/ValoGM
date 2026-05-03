import { useState, useEffect, useMemo, type ReactNode } from 'react';
import type { GameState, InternationalTournament, PlayoffBracket, PlayoffMatch } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const REGION_ABBR: Record<string, string> = {
  americas: 'AMR', emea: 'EMEA', pacific: 'PAC', china: 'CHN',
};
const REGION_COLOR: Record<string, string> = {
  americas: 'var(--red)', emea: 'var(--blue)', pacific: 'var(--teal)', china: 'var(--amber)',
};
const GROUP_LABELS = ['Group A', 'Group B', 'Group C', 'Group D'];

// ─── Layout Constants ─────────────────────────────────────────────────────────

const CARD_W = 188;
const CARD_H = 74;
const GAP    = 8;
const CONN_W = 22;
const PAIR_H = 2 * CARD_H + GAP;   // 156

const TIER_BORDER: Record<string, string> = {
  upper: 'rgba(74,158,255,0.40)',
  lower: 'rgba(245,166,35,0.38)',
  gf:    'rgba(255,184,0,0.55)',
};
const TIER_BG: Record<string, string> = {
  upper: 'rgba(74,158,255,0.04)',
  lower: 'rgba(245,166,35,0.04)',
  gf:    'rgba(255,184,0,0.07)',
};

// ─── Connector SVGs ───────────────────────────────────────────────────────────

function PairConnector() {
  const y1 = CARD_H / 2;
  const y2 = CARD_H + GAP + CARD_H / 2;
  return (
    <svg width={CONN_W} height={PAIR_H} style={{ flexShrink: 0, display: 'block' }}>
      <line x1={0} y1={y1} x2={CONN_W} y2={y1} stroke="var(--border)" strokeWidth={1} />
      <line x1={0} y1={y2} x2={CONN_W} y2={y2} stroke="var(--border)" strokeWidth={1} />
    </svg>
  );
}

function YConnector() {
  const y1 = CARD_H / 2;
  const y2 = CARD_H + GAP + CARD_H / 2;
  const yMid = PAIR_H / 2;
  const xMid = CONN_W / 2;
  return (
    <svg width={CONN_W} height={PAIR_H} style={{ flexShrink: 0, display: 'block' }}>
      <line x1={0}    y1={y1}   x2={xMid}   y2={y1}   stroke="var(--border)" strokeWidth={1} />
      <line x1={0}    y1={y2}   x2={xMid}   y2={y2}   stroke="var(--border)" strokeWidth={1} />
      <line x1={xMid} y1={y1}   x2={xMid}   y2={y2}   stroke="var(--border)" strokeWidth={1} />
      <line x1={xMid} y1={yMid} x2={CONN_W} y2={yMid} stroke="var(--border)" strokeWidth={1} />
    </svg>
  );
}

function SingleConnector() {
  const y = PAIR_H / 2;
  return (
    <svg width={CONN_W} height={PAIR_H} style={{ flexShrink: 0, display: 'block' }}>
      <line x1={0} y1={y} x2={CONN_W} y2={y} stroke="var(--border)" strokeWidth={1} />
    </svg>
  );
}

// Four cards (R1) → two cards (SF): double-Y connector.
// FourCardCol height = 4*CARD_H + 3*GAP = 320.
// With alignItems:center the TwoCardCol centers in 320, so its card centers land at y=119 and y=201 —
// exactly matching R1 cards 1 and 2, which are the merge outputs.
function QuadToPairConnector() {
  const y0   = CARD_H / 2;
  const y1   = CARD_H + GAP + CARD_H / 2;
  const y2   = 2 * CARD_H + 2 * GAP + CARD_H / 2;
  const y3   = 3 * CARD_H + 3 * GAP + CARD_H / 2;
  const xMid = CONN_W / 2;
  const h    = 4 * CARD_H + 3 * GAP;
  return (
    <svg width={CONN_W} height={h} style={{ flexShrink: 0, display: 'block' }}>
      {/* top pair: R1_0 + R1_1 → SF_0 at y1 */}
      <line x1={0}    y1={y0} x2={xMid}   y2={y0} stroke="var(--border)" strokeWidth={1} />
      <line x1={0}    y1={y1} x2={xMid}   y2={y1} stroke="var(--border)" strokeWidth={1} />
      <line x1={xMid} y1={y0} x2={xMid}   y2={y1} stroke="var(--border)" strokeWidth={1} />
      <line x1={xMid} y1={y1} x2={CONN_W} y2={y1} stroke="var(--border)" strokeWidth={1} />
      {/* bottom pair: R1_2 + R1_3 → SF_1 at y2 */}
      <line x1={0}    y1={y2} x2={xMid}   y2={y2} stroke="var(--border)" strokeWidth={1} />
      <line x1={0}    y1={y3} x2={xMid}   y2={y3} stroke="var(--border)" strokeWidth={1} />
      <line x1={xMid} y1={y2} x2={xMid}   y2={y3} stroke="var(--border)" strokeWidth={1} />
      <line x1={xMid} y1={y2} x2={CONN_W} y2={y2} stroke="var(--border)" strokeWidth={1} />
    </svg>
  );
}

// ─── Column Wrappers ──────────────────────────────────────────────────────────

function TwoCardCol({ top, bottom }: { top: ReactNode; bottom: ReactNode }) {
  return (
    <div style={{ width: CARD_W, display: 'flex', flexDirection: 'column', gap: GAP, flexShrink: 0 }}>
      {top}{bottom}
    </div>
  );
}

function FourCardCol({ a, b, c, d }: { a: ReactNode; b: ReactNode; c: ReactNode; d: ReactNode }) {
  return (
    <div style={{ width: CARD_W, display: 'flex', flexDirection: 'column', gap: GAP, flexShrink: 0 }}>
      {a}{b}{c}{d}
    </div>
  );
}

function OneCardCol({ children }: { children: ReactNode }) {
  return (
    <div style={{ width: CARD_W, height: PAIR_H, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <div style={{ width: '100%' }}>{children}</div>
    </div>
  );
}

interface Props {
  state: GameState;
  tournament?: InternationalTournament;
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function TeamRow({ teamId, t, state, won, score }: {
  teamId: string | null;
  t: InternationalTournament;
  state: GameState;
  won: boolean | null;
  score: number | null;
}) {
  const team     = teamId ? state.teams.get(teamId) : null;
  const seed     = teamId ? t.qualifiedTeams.find(s => s.teamId === teamId) : null;
  const isPlayer = teamId === state.playerTeamId;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0', opacity: won === false ? 0.4 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, minWidth: 30, flexShrink: 0, color: seed ? REGION_COLOR[seed.region] : 'transparent' }}>
          {seed ? REGION_ABBR[seed.region] : ''}
        </span>
        <span style={{
          fontSize: 11, fontWeight: (isPlayer || won === true) ? 700 : 400,
          color: !teamId ? 'var(--text-secondary)' : isPlayer ? 'var(--teal)' : 'var(--text-primary)',
          fontStyle: !teamId ? 'italic' : 'normal',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {team?.name ?? 'TBD'}
        </span>
      </div>
      {score !== null && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, marginLeft: 6, flexShrink: 0, fontWeight: won === true ? 700 : 400, color: won === true ? 'var(--teal)' : 'var(--text-dim)' }}>
          {score}
        </span>
      )}
    </div>
  );
}

function MatchCard({ id, bracket, t, state, tier = 'lower' }: {
  id: string;
  bracket: PlayoffBracket;
  t: InternationalTournament;
  state: GameState;
  tier?: 'upper' | 'lower' | 'gf';
}) {
  const m = bracket.matches.find(x => x.id === id);
  if (!m) return <div style={{ height: CARD_H, width: CARD_W }} />;
  const res = m.result;
  const hasPlayer = m.teamAId === state.playerTeamId || m.teamBId === state.playerTeamId;

  return (
    <div style={{
      padding: '8px 10px',
      border: `1px solid ${hasPlayer ? 'var(--teal)' : TIER_BORDER[tier]}`,
      background: TIER_BG[tier],
      borderRadius: 3,
      width: '100%',
      boxSizing: 'border-box' as const,
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase' as const }}>
        {m.format.toUpperCase()}
      </div>
      <TeamRow teamId={m.teamAId} t={t} state={state} won={res ? res.winner === 'A' : null} score={res ? res.winsA : null} />
      <div style={{ borderTop: '1px solid var(--border-dim)', margin: '2px 0' }} />
      <TeamRow teamId={m.teamBId} t={t} state={state} won={res ? res.winner === 'B' : null} score={res ? res.winsB : null} />
    </div>
  );
}

function SectionTitle({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ fontFamily: 'var(--font-head)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: color ?? 'var(--text-secondary)', marginBottom: 10, borderBottom: '1px solid var(--border-dim)', paddingBottom: 5 }}>
      {children}
    </div>
  );
}

function Col({ label, sublabel, children }: { label: string; sublabel?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontFamily: 'var(--font-head)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 6 }}>
        {label}
      </div>
      {sublabel && (
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 4, opacity: 0.7 }}>
          {sublabel}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

// ─── Swiss Stage ──────────────────────────────────────────────────────────────

function swissRec(teamId: string, matches: PlayoffMatch[]) {
  let w = 0, l = 0;
  for (const m of matches) {
    if (!m.result) continue;
    const isA = m.teamAId === teamId, isB = m.teamBId === teamId;
    if (!isA && !isB) continue;
    (isA ? m.result.winner === 'A' : m.result.winner === 'B') ? w++ : l++;
  }
  return { w, l };
}

function PoolLabel({ label, color }: { label: string; color?: string }) {
  return (
    <div style={{ fontFamily: 'var(--font-head)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.1em', color: color ?? 'var(--text-dim)', marginTop: 8, marginBottom: 4 }}>
      {label}
    </div>
  );
}

function SwissView({ t, state }: { t: InternationalTournament; state: GameState }) {
  const bracket = t.playInBracket;
  if (!bracket) return <div className="text-dim text-sm">Play-in not started.</div>;

  const swissTeams = t.qualifiedTeams.filter(q => q.regionalSeed >= 2);
  const c = (id: string) => <MatchCard key={id} id={id} bracket={bracket} t={t} state={state} />;

  const qualified  = swissTeams.filter(({ teamId }) => swissRec(teamId, bracket.matches).w === 2);
  const eliminated = swissTeams.filter(({ teamId }) => swissRec(teamId, bracket.matches).l === 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* R1 — 0-0 pool */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 6 }}>
            Round 1
          </div>
          <PoolLabel label="0-0 Pool" color="var(--text-secondary)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['SW_R1_0', 'SW_R1_1', 'SW_R1_2', 'SW_R1_3'].map(c)}
          </div>
        </div>

        {/* R2 — split by pool */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 6 }}>
            Round 2
          </div>
          <PoolLabel label="1-0 Pool" color="var(--teal)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['SW_R2_0', 'SW_R2_1'].map(c)}
          </div>
          <PoolLabel label="0-1 Pool" color="var(--red)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['SW_R2_2', 'SW_R2_3'].map(c)}
          </div>
        </div>

        {/* R3 — 1-1 pool */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 6 }}>
            Round 3
          </div>
          <PoolLabel label="1-1 Pool" color="var(--amber)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['SW_R3_0', 'SW_R3_1'].map(c)}
          </div>
        </div>
      </div>

      {(qualified.length > 0 || eliminated.length > 0) && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {qualified.length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: 9, color: 'var(--teal)', letterSpacing: '0.08em', marginBottom: 5 }}>QUALIFIED</div>
              {qualified.map(({ teamId, region }) => {
                const rec = swissRec(teamId, bracket.matches);
                return (
                  <div key={teamId} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: REGION_COLOR[region], minWidth: 30 }}>{REGION_ABBR[region]}</span>
                    <span style={{ color: teamId === state.playerTeamId ? 'var(--teal)' : 'var(--text-primary)', fontWeight: teamId === state.playerTeamId ? 700 : 400 }}>
                      {state.teams.get(teamId)?.name ?? teamId}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--teal)' }}>{rec.w}-{rec.l}</span>
                  </div>
                );
              })}
            </div>
          )}
          {eliminated.length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: 9, color: 'var(--red)', letterSpacing: '0.08em', marginBottom: 5 }}>ELIMINATED</div>
              {eliminated.map(({ teamId, region }) => {
                const rec = swissRec(teamId, bracket.matches);
                return (
                  <div key={teamId} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, marginBottom: 3, opacity: 0.45 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: REGION_COLOR[region], minWidth: 30 }}>{REGION_ABBR[region]}</span>
                    <span>{state.teams.get(teamId)?.name ?? teamId}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--red)' }}>{rec.w}-{rec.l}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Champions Group Stage ────────────────────────────────────────────────────

function ChampionsGroupsView({ t, state }: { t: InternationalTournament; state: GameState }) {
  const bracket = t.playInBracket;
  if (!bracket) return <div className="text-dim text-sm">Group stage not started.</div>;

  const c = (id: string) => <MatchCard key={id} id={id} bracket={bracket} t={t} state={state} />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
      {[0, 1, 2, 3].map(g => {
        const gfMatch = bracket.matches.find(m => m.id === `CG_${g}_GF`);
        const winner  = gfMatch?.result ? (gfMatch.result.winner === 'A' ? gfMatch.teamAId : gfMatch.teamBId) : null;
        const ru      = gfMatch?.result ? (gfMatch.result.winner === 'A' ? gfMatch.teamBId : gfMatch.teamAId) : null;
        return (
          <div key={g}>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 6 }}>
              {GROUP_LABELS[g]}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[`CG_${g}_UBR1_A`, `CG_${g}_UBR1_B`, `CG_${g}_UBF`, `CG_${g}_LBR1`, `CG_${g}_LBF`, `CG_${g}_GF`].map(c)}
            </div>
            {(winner || ru) && (
              <div style={{ marginTop: 6, padding: '5px 7px', background: 'var(--bg-2)', border: '1px solid var(--teal-dim)' }}>
                <div style={{ fontFamily: 'var(--font-head)', fontSize: 8, color: 'var(--teal)', letterSpacing: '0.08em', marginBottom: 3 }}>ADVANCE</div>
                {[winner, ru].filter(Boolean).map(id => {
                  const seed = t.qualifiedTeams.find(s => s.teamId === id);
                  return (
                    <div key={id} style={{ fontSize: 10, display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}>
                      {seed && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: REGION_COLOR[seed.region] }}>{REGION_ABBR[seed.region]}</span>}
                      <span style={{ color: id === state.playerTeamId ? 'var(--teal)' : 'var(--text-primary)', fontWeight: id === state.playerTeamId ? 700 : 400 }}>
                        {state.teams.get(id!)?.name ?? id}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Double-Elim Bracket ─────────────────────────────────────────────────────

function DEBracketView({ bracket, t, state, ubR1, ubSf, ubF, lbR1, lbQf, lbSf, lbF, gf }: {
  bracket: PlayoffBracket; t: InternationalTournament; state: GameState;
  ubR1: string[]; ubSf: string[]; ubF: string;
  lbR1: string[]; lbQf: string[]; lbSf: string; lbF: string; gf: string;
}) {
  const cu = (id: string) => <MatchCard key={id} id={id} bracket={bracket} t={t} state={state} tier="upper" />;
  const cl = (id: string) => <MatchCard key={id} id={id} bracket={bracket} t={t} state={state} tier="lower" />;
  const champion = bracket.champion ? state.teams.get(bracket.champion) : null;
  const isPlayerChamp = bracket.champion === state.playerTeamId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Upper bracket + Grand Final inline */}
      <div style={{ flexShrink: 0 }}>
        <SectionTitle>Upper Bracket</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <FourCardCol a={cu(ubR1[0])} b={cu(ubR1[1])} c={cu(ubR1[2])} d={cu(ubR1[3])} />
          <QuadToPairConnector />
          <TwoCardCol top={cu(ubSf[0])} bottom={cu(ubSf[1])} />
          <YConnector />
          <OneCardCol>{cu(ubF)}</OneCardCol>
          <SingleConnector />
          <OneCardCol>
            <MatchCard id={gf} bracket={bracket} t={t} state={state} tier="gf" />
          </OneCardCol>
          {champion && (
            <div style={{
              marginLeft: 20, flexShrink: 0,
              padding: '14px 20px',
              border: '1px solid var(--amber)',
              background: 'rgba(255,184,0,0.06)',
              borderRadius: 3,
              minWidth: 140,
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--amber)', textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: 6 }}>
                Champion
              </div>
              <div className="font-head" style={{ fontSize: 18, color: isPlayerChamp ? 'var(--teal)' : 'var(--amber)' }}>
                {isPlayerChamp ? '★ ' : ''}{champion.name}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lower bracket */}
      <div style={{ flexShrink: 0 }}>
        <SectionTitle>Lower Bracket</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <TwoCardCol top={cl(lbR1[0])} bottom={cl(lbR1[1])} />
          <PairConnector />
          <TwoCardCol top={cl(lbQf[0])} bottom={cl(lbQf[1])} />
          <YConnector />
          <OneCardCol>{cl(lbSf)}</OneCardCol>
          <SingleConnector />
          <OneCardCol>{cl(lbF)}</OneCardCol>
        </div>
      </div>

    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function InternationalTournament({ state, tournament: tournamentProp }: Props) {
  // Build full tournament list: active first, then history newest→oldest
  const allTournaments = useMemo(() => {
    const list: InternationalTournament[] = [];
    if (state.activeInternationalTournament) list.push(state.activeInternationalTournament);
    [...state.tournamentHistory].reverse().forEach(t => list.push(t));
    return list;
  }, [state.activeInternationalTournament, state.tournamentHistory]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const t = tournamentProp ?? allTournaments[selectedIdx] ?? null;

  const [tab, setTab] = useState<'play_in' | 'main_event'>(() =>
    t && (t.phase === 'main_event' || (t.phase === 'complete' && t.mainBracket)) ? 'main_event' : 'play_in'
  );

  // Auto-switch to main_event tab when that phase begins
  useEffect(() => {
    if (t?.phase === 'main_event') setTab('main_event');
  }, [t?.phase, t?.id]);

  // Reset to first tournament when a new one becomes active
  useEffect(() => {
    setSelectedIdx(0);
  }, [allTournaments.length]);

  if (!t) {
    return (
      <div style={{ height: '100%', padding: 16 }}>
        <div className="text-dim text-sm">No international tournaments yet. Check back after regional playoffs.</div>
      </div>
    );
  }

  const isMasters   = t.name !== 'Champions';
  const champion    = t.champion ? state.teams.get(t.champion) : null;
  const isActive    = state.activeInternationalTournament?.id === t.id;
  const phaseLabel  = t.phase === 'play_in' ? (isMasters ? 'Play-in' : 'Group Stage')
                    : t.phase === 'main_event' ? 'Main Event' : 'Complete';

  return (
    <div style={{ height: '100%', padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Tournament selector — shown when there are multiple to view */}
      {!tournamentProp && allTournaments.length > 1 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingBottom: 10, borderBottom: '1px solid var(--border-dim)' }}>
          {allTournaments.map((tournament, idx) => {
            const isLive = state.activeInternationalTournament?.id === tournament.id;
            const isSel  = idx === selectedIdx;
            return (
              <button
                key={tournament.id}
                className={`btn ${isSel ? 'btn-red' : ''}`}
                style={{ fontSize: 10 }}
                onClick={() => {
                  setSelectedIdx(idx);
                  setTab(tournament.phase === 'main_event' || (tournament.phase === 'complete' && tournament.mainBracket) ? 'main_event' : 'play_in');
                }}
              >
                {tournament.name}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: isSel ? undefined : 'var(--text-dim)', marginLeft: 4 }}>
                  S{tournament.calendarSeason}
                </span>
                {isLive && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--teal)', marginLeft: 4, letterSpacing: '0.06em' }}>LIVE</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 className="font-head" style={{ fontSize: 20 }}>{t.name}</h2>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 8px', borderRadius: 3,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          background: t.phase === 'complete' ? 'var(--teal-dim)' : 'var(--bg-3)',
          color: t.phase === 'complete' ? 'var(--teal)' : t.phase === 'main_event' ? 'var(--amber)' : 'var(--text-secondary)',
        }}>
          {phaseLabel}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
          Season {t.calendarSeason}
          {isActive && <span style={{ color: 'var(--teal)', marginLeft: 6 }}>LIVE</span>}
        </span>
      </div>

      {/* Champion banner */}
      {champion && (
        <div style={{ padding: '9px 14px', background: 'var(--teal-dim)', border: '1px solid var(--teal)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-head)', fontSize: 9, color: 'var(--teal)', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>
            {t.name} Champion
          </span>
          <span style={{ fontFamily: 'var(--font-head)', fontSize: 16, color: t.champion === state.playerTeamId ? 'var(--teal)' : 'var(--text-primary)' }}>
            {champion.name}
          </span>
        </div>
      )}

      {/* Stage tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button className={`btn ${tab === 'play_in' ? 'btn-red' : ''}`} style={{ fontSize: 11 }} onClick={() => setTab('play_in')}>
          {isMasters ? 'Swiss Stage' : 'Group Stage'}
        </button>
        <button
          className={`btn ${tab === 'main_event' ? 'btn-red' : ''}`}
          style={{ fontSize: 11, opacity: t.mainBracket ? 1 : 0.4 }}
          onClick={() => { if (t.mainBracket) setTab('main_event'); }}
        >
          {isMasters ? 'Main Event' : 'Playoff Bracket'}
        </button>
      </div>

      {/* Content */}
      {tab === 'play_in'   &&  isMasters && <SwissView t={t} state={state} />}
      {tab === 'play_in'   && !isMasters && <ChampionsGroupsView t={t} state={state} />}

      {tab === 'main_event' && t.mainBracket && isMasters && (
        <DEBracketView bracket={t.mainBracket} t={t} state={state}
          ubR1={['MN_UBR1_A','MN_UBR1_B','MN_UBR1_C','MN_UBR1_D']}
          ubSf={['MN_UBSF1','MN_UBSF2']} ubF="MN_UBF"
          lbR1={['MN_LBR1_A','MN_LBR1_B']} lbQf={['MN_LBQF_A','MN_LBQF_B']}
          lbSf="MN_LBSF" lbF="MN_LBF" gf="MN_GF" />
      )}
      {tab === 'main_event' && t.mainBracket && !isMasters && (
        <DEBracketView bracket={t.mainBracket} t={t} state={state}
          ubR1={['CP_UBQF_A','CP_UBQF_B','CP_UBQF_C','CP_UBQF_D']}
          ubSf={['CP_UBSF1','CP_UBSF2']} ubF="CP_UBF"
          lbR1={['CP_LBR1_A','CP_LBR1_B']} lbQf={['CP_LBQF_A','CP_LBQF_B']}
          lbSf="CP_LBSF" lbF="CP_LBF" gf="CP_GF" />
      )}
      {tab === 'main_event' && !t.mainBracket && (
        <div className="text-dim text-sm">Main event not started yet.</div>
      )}

    </div>
  );
}
