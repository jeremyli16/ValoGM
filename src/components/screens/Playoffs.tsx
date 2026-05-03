import type { ReactNode } from 'react';
import type { GameState, PlayoffBracket, PlayoffMatch, StandingsRow } from '../../types';
import { sortStandings, buildPlayoffBracket } from '../../engine/leagueInit';

interface Props { state: GameState; }

// ─── Seed Derivation ──────────────────────────────────────────────────────────

function getOriginalSeeds(bracket: PlayoffBracket): string[] {
  const find = (round: string) => bracket.matches.find(m => m.round === round);
  const ur1a = find('UR1A');
  const ur1b = find('UR1B');
  const usf1 = find('USF1');
  const usf2 = find('USF2');
  const lr1a = find('LR1A');
  const lr1b = find('LR1B');
  return [
    usf1?.teamAId,
    usf2?.teamAId,
    ur1b?.teamAId,
    ur1a?.teamAId,
    ur1a?.teamBId,
    ur1b?.teamBId,
    lr1b?.teamBId,
    lr1a?.teamBId,
  ].filter((id): id is string => !!id);
}

function getProjectedSeeds(state: GameState): string[] {
  const league = state.leagues.get(state.leagueId);
  const groupAIds = league?.groups?.groupA ?? [];
  const groupBIds = league?.groups?.groupB ?? [];

  const rows: StandingsRow[] = [];
  state.standings.forEach(r => {
    if (r.leagueId === state.leagueId && r.season === state.season) rows.push(r);
  });

  const sorted = sortStandings(rows);
  const groupA = sortStandings(sorted.filter(r => groupAIds.includes(r.teamId)));
  const groupB = sortStandings(sorted.filter(r => groupBIds.includes(r.teamId)));

  return [
    groupA[0]?.teamId, groupB[0]?.teamId,
    groupA[1]?.teamId, groupB[1]?.teamId,
    groupA[2]?.teamId, groupB[2]?.teamId,
    groupA[3]?.teamId, groupB[3]?.teamId,
  ].filter((id): id is string => !!id);
}

function getDisplayBracket(state: GameState): {
  bracket: PlayoffBracket; isProjected: boolean; seeds: string[];
} {
  if (state.playoffBracket) {
    return {
      bracket: state.playoffBracket,
      isProjected: false,
      seeds: getOriginalSeeds(state.playoffBracket),
    };
  }
  const seeds = getProjectedSeeds(state);
  if (seeds.length < 8) {
    return { bracket: { matches: [], champion: null }, isProjected: true, seeds };
  }
  const bracket = buildPlayoffBracket(state.leagueId, state.season, seeds);
  return { bracket, isProjected: true, seeds };
}

// ─── Layout Constants ─────────────────────────────────────────────────────────

const CARD_W      = 188;
const CARD_H      = 74;
const GAP         = 8;
const CONN_W      = 22;
const PAIR_H      = 2 * CARD_H + GAP;
const SECTION_GAP = 20;

// ─── Tier Styling (A) ─────────────────────────────────────────────────────────

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

// ─── Routing Labels (E) ───────────────────────────────────────────────────────

const ROUTING: Record<string, { win: string; lose?: string }> = {
  UR1A: { win: 'Upper SF',    lose: 'Lower R1'    },
  UR1B: { win: 'Upper SF',    lose: 'Lower R1'    },
  USF1: { win: 'Upper Final', lose: 'Lower R2'    },
  USF2: { win: 'Upper Final', lose: 'Lower R2'    },
  UF:   { win: 'Grand Final', lose: 'Lower Final' },
  LR1A: { win: 'Lower R2'   },
  LR1B: { win: 'Lower R2'   },
  LR2A: { win: 'Lower SF'   },
  LR2B: { win: 'Lower SF'   },
  LR3:  { win: 'Lower Final' },
  LF:   { win: 'Grand Final' },
  GF:   { win: 'Champion'    },
};

// ─── Connector SVGs (F) ───────────────────────────────────────────────────────

// Two cards at same heights → two straight horizontal lines (col1→col2 in upper/lower)
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

// Two cards → one card centered in PAIR_H (Y-merge: USF→UF, LR2→LR3)
function YConnector() {
  const y1   = CARD_H / 2;
  const y2   = CARD_H + GAP + CARD_H / 2;
  const yMid = PAIR_H / 2;
  const xMid = CONN_W / 2;
  return (
    <svg width={CONN_W} height={PAIR_H} style={{ flexShrink: 0, display: 'block' }}>
      <line x1={0}    y1={y1}   x2={xMid}  y2={y1}   stroke="var(--border)" strokeWidth={1} />
      <line x1={0}    y1={y2}   x2={xMid}  y2={y2}   stroke="var(--border)" strokeWidth={1} />
      <line x1={xMid} y1={y1}   x2={xMid}  y2={y2}   stroke="var(--border)" strokeWidth={1} />
      <line x1={xMid} y1={yMid} x2={CONN_W} y2={yMid} stroke="var(--border)" strokeWidth={1} />
    </svg>
  );
}

// One card centered in PAIR_H → one card centered in PAIR_H (LR3→LF, UF→GF)
function SingleConnector() {
  const y = PAIR_H / 2;
  return (
    <svg width={CONN_W} height={PAIR_H} style={{ flexShrink: 0, display: 'block' }}>
      <line x1={0} y1={y} x2={CONN_W} y2={y} stroke="var(--border)" strokeWidth={1} />
    </svg>
  );
}

// Vertical dashed bridge connecting GF (above) and LF (below) in the same column
function VerticalBridge() {
  const x = CONN_W + CARD_W / 2;
  return (
    <svg width={CONN_W + CARD_W} height={SECTION_GAP} style={{ display: 'block', flexShrink: 0 }}>
      <line x1={x} y1={0} x2={x} y2={SECTION_GAP}
        stroke="var(--border)" strokeWidth={1} strokeDasharray="3,3" />
    </svg>
  );
}

// ─── Column Wrappers (D) ──────────────────────────────────────────────────────

function TwoCardCol({ top, bottom }: { top: ReactNode; bottom: ReactNode }) {
  return (
    <div style={{ width: CARD_W, display: 'flex', flexDirection: 'column', gap: GAP, flexShrink: 0 }}>
      {top}
      {bottom}
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function TeamSlot({ name, seed, isPlayer, won, score, tbd }: {
  name: string;
  seed: number | null;
  isPlayer: boolean;
  won: boolean | null;
  score: number | null;
  tbd: boolean;
}) {
  const textColor = tbd
    ? 'var(--text-secondary)'
    : isPlayer
      ? 'var(--red)'
      : won === true
        ? 'var(--teal)'
        : 'var(--text-primary)';

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '4px 0',
      opacity: won === false ? 0.38 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1 }}>
        {seed !== null && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--text-dim)', minWidth: 20, flexShrink: 0,
          }}>
            S{seed}
          </span>
        )}
        <span style={{
          fontSize: 12, fontWeight: (isPlayer || won === true) ? 700 : 400,
          color: textColor,
          fontStyle: tbd ? 'italic' : 'normal',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
        </span>
      </div>
      {score !== null && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 13,
          fontWeight: won === true ? 700 : 400,
          color: won === true ? 'var(--teal)' : 'var(--text-secondary)',
          marginLeft: 8, flexShrink: 0,
        }}>
          {score}
        </span>
      )}
    </div>
  );
}

// B: no internal round label; A: tier border/bg; E: routing footer
function MatchCard({ match, state, seeds, playerTeamId, tier }: {
  match: PlayoffMatch;
  state: GameState;
  seeds: string[];
  playerTeamId: string;
  tier: 'upper' | 'lower' | 'gf';
}) {
  const teamA = match.teamAId ? state.teams.get(match.teamAId) : null;
  const teamB = match.teamBId ? state.teams.get(match.teamBId) : null;
  const res   = match.result;
  const seedA = match.teamAId ? seeds.indexOf(match.teamAId) : -1;
  const seedB = match.teamBId ? seeds.indexOf(match.teamBId) : -1;
  const hasPlayer = match.teamAId === playerTeamId || match.teamBId === playerTeamId;
  const routing = ROUTING[match.round];

  return (
    <div style={{
      padding: '8px 10px',
      border: `1px solid ${hasPlayer ? 'var(--red)' : TIER_BORDER[tier]}`,
      background: TIER_BG[tier],
      borderRadius: 3,
      width: '100%',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>
          {match.format.toUpperCase()}
        </span>
      </div>
      <TeamSlot
        name={teamA?.name ?? 'TBD'}
        seed={seedA >= 0 ? seedA + 1 : null}
        isPlayer={match.teamAId === playerTeamId}
        won={res ? res.winner === 'A' : null}
        score={res ? res.winsA : null}
        tbd={!teamA}
      />
      <div style={{ borderTop: '1px solid var(--border-dim)', margin: '2px 0' }} />
      <TeamSlot
        name={teamB?.name ?? 'TBD'}
        seed={seedB >= 0 ? seedB + 1 : null}
        isPlayer={match.teamBId === playerTeamId}
        won={res ? res.winner === 'B' : null}
        score={res ? res.winsB : null}
        tbd={!teamB}
      />
      {!res && routing && (
        <div style={{
          display: 'flex', gap: 8, marginTop: 5,
          paddingTop: 4, borderTop: '1px solid var(--border-dim)',
          fontFamily: 'var(--font-mono)', fontSize: 9,
        }}>
          <span style={{ color: 'var(--teal)' }}>W→ {routing.win}</span>
          {routing.lose && <span style={{ color: 'var(--amber)' }}>L→ {routing.lose}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Section Label ────────────────────────────────────────────────────────────

function SectionLabel({ label, color }: { label: string; color?: string }) {
  return (
    <div style={{
      fontFamily: 'var(--font-head)', fontSize: 10,
      textTransform: 'uppercase', letterSpacing: '0.1em',
      color: color ?? 'var(--text-secondary)',
      marginBottom: 10,
      borderBottom: '1px solid var(--border-dim)', paddingBottom: 5,
    }}>
      {label}
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function Playoffs({ state }: Props) {
  if (state.phase === 'preseason') {
    return (
      <div style={{ height: '100%', padding: 16 }}>
        <div className="text-dim text-sm">Playoffs have not started. Check back during or after the regular season.</div>
      </div>
    );
  }

  const { bracket, isProjected, seeds } = getDisplayBracket(state);

  if (bracket.matches.length === 0) {
    return (
      <div style={{ height: '100%', padding: 16 }}>
        <div className="text-dim text-sm">Not enough standings data to project a bracket yet.</div>
      </div>
    );
  }

  const card = (round: string, tier: 'upper' | 'lower' | 'gf') => {
    const m = bracket.matches.find(x => x.round === round);
    if (!m) return <div style={{ height: CARD_H, width: CARD_W }} />;
    return <MatchCard match={m} state={state} seeds={seeds} playerTeamId={state.playerTeamId} tier={tier} />;
  };

  const champion = bracket.champion ? state.teams.get(bracket.champion) : null;
  const playerIsChamp = bracket.champion === state.playerTeamId;

  return (
    <div style={{ height: '100%', padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <h2 className="font-head" style={{ fontSize: 18 }}>
          Playoffs — Season {state.season}
        </h2>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          background: isProjected ? 'var(--amber-dim)' : 'var(--teal-dim)',
          color: isProjected ? 'var(--amber)' : 'var(--teal)',
          padding: '2px 8px', borderRadius: 3,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {isProjected ? 'Projected' : 'Live'}
        </span>
      </div>

      {isProjected && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: -16, flexShrink: 0 }}>
          Seedings based on current standings. Top 4 from each group qualify.
        </p>
      )}

      {/* Upper Bracket + Grand Final inline */}
      <div style={{ flexShrink: 0 }}>
        <SectionLabel label="Upper Bracket" color="rgba(74,158,255,0.7)" />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <TwoCardCol top={card('UR1A', 'upper')} bottom={card('UR1B', 'upper')} />
          <PairConnector />
          <TwoCardCol top={card('USF1', 'upper')} bottom={card('USF2', 'upper')} />
          <YConnector />
          <OneCardCol>{card('UF', 'upper')}</OneCardCol>
          <SingleConnector />
          <OneCardCol>{card('GF', 'gf')}</OneCardCol>
          {champion && (
            <div style={{
              marginLeft: 20, flexShrink: 0,
              padding: '14px 20px',
              border: '1px solid var(--amber)',
              background: 'rgba(255,184,0,0.06)',
              borderRadius: 3,
              minWidth: 140,
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--amber)', textTransform: 'uppercase',
                letterSpacing: '0.1em', marginBottom: 6,
              }}>
                Champion
              </div>
              <div className="font-head" style={{
                fontSize: 18,
                color: playerIsChamp ? 'var(--teal)' : 'var(--amber)',
              }}>
                {playerIsChamp ? '★ ' : ''}{champion.name}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lower Bracket */}
      <div style={{ flexShrink: 0 }}>
        <SectionLabel label="Lower Bracket" color="rgba(245,166,35,0.7)" />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <TwoCardCol top={card('LR1A', 'lower')} bottom={card('LR1B', 'lower')} />
          <PairConnector />
          <TwoCardCol top={card('LR2A', 'lower')} bottom={card('LR2B', 'lower')} />
          <YConnector />
          <OneCardCol>{card('LR3', 'lower')}</OneCardCol>
          <SingleConnector />
          <OneCardCol>{card('LF', 'lower')}</OneCardCol>
        </div>
      </div>

    </div>
  );
}
