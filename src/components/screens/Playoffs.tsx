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
    usf1?.teamAId,   // s1 = A1 (bye)
    usf2?.teamAId,   // s2 = B1 (bye)
    ur1b?.teamAId,   // s3 = A2
    ur1a?.teamAId,   // s4 = B2
    ur1a?.teamBId,   // s5 = A3
    ur1b?.teamBId,   // s6 = B3
    lr1b?.teamBId,   // s7 = A4
    lr1a?.teamBId,   // s8 = B4
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

// ─── Sub-components ───────────────────────────────────────────────────────────

const ROUND_LABEL: Record<string, string> = {
  UR1A: 'Upper R1', UR1B: 'Upper R1',
  USF1: 'Upper SF', USF2: 'Upper SF',
  UF:   'Upper Final',
  LR1A: 'Lower R1', LR1B: 'Lower R1',
  LR2A: 'Lower R2', LR2B: 'Lower R2',
  LR3:  'Lower SF',
  LF:   'Lower Final',
  GF:   'Grand Final',
};

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

function MatchCard({ match, state, seeds, playerTeamId }: {
  match: PlayoffMatch;
  state: GameState;
  seeds: string[];
  playerTeamId: string;
}) {
  const teamA = match.teamAId ? state.teams.get(match.teamAId) : null;
  const teamB = match.teamBId ? state.teams.get(match.teamBId) : null;
  const res = match.result;

  const seedA = match.teamAId ? seeds.indexOf(match.teamAId) : -1;
  const seedB = match.teamBId ? seeds.indexOf(match.teamBId) : -1;

  const hasPlayer = match.teamAId === playerTeamId || match.teamBId === playerTeamId;

  return (
    <div className="card" style={{
      padding: '9px 11px', width: '100%',
      borderColor: hasPlayer ? 'var(--red-dim)' : undefined,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 6,
      }}>
        <span style={{
          fontFamily: 'var(--font-head)', fontSize: 9,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          color: 'var(--text-secondary)',
        }}>
          {ROUND_LABEL[match.round] ?? match.round}
        </span>
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
    </div>
  );
}

function BracketColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        fontFamily: 'var(--font-head)', fontSize: 9,
        textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'var(--text-dim)', marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

function CenteredMatch({ children, minHeight }: { children: React.ReactNode; minHeight?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minHeight }}>
      <div style={{ width: '100%' }}>{children}</div>
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

  const card = (round: string) => {
    const m = bracket.matches.find(x => x.round === round);
    if (!m) return null;
    return <MatchCard match={m} state={state} seeds={seeds} playerTeamId={state.playerTeamId} />;
  };

  const champion = bracket.champion ? state.teams.get(bracket.champion) : null;
  const CARD_H = 84;

  return (
    <div style={{ height: '100%', padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: -12 }}>
          Seedings based on current standings. Top 4 from each group qualify.
        </p>
      )}

      {/* Upper Bracket */}
      <div>
        <div style={{
          fontFamily: 'var(--font-head)', fontSize: 11,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          color: 'var(--text-secondary)', marginBottom: 12,
          borderBottom: '1px solid var(--border-dim)', paddingBottom: 6,
        }}>
          Upper Bracket
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <BracketColumn label="Round 1">
            {card('UR1A')}
            {card('UR1B')}
          </BracketColumn>
          <BracketColumn label="Semifinals">
            <CenteredMatch minHeight={CARD_H}>{card('USF1')}</CenteredMatch>
            <CenteredMatch minHeight={CARD_H}>{card('USF2')}</CenteredMatch>
          </BracketColumn>
          <BracketColumn label="Final">
            <CenteredMatch minHeight={CARD_H * 2 + 8}>{card('UF')}</CenteredMatch>
          </BracketColumn>
        </div>
      </div>

      {/* Lower Bracket */}
      <div>
        <div style={{
          fontFamily: 'var(--font-head)', fontSize: 11,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          color: 'var(--text-secondary)', marginBottom: 12,
          borderBottom: '1px solid var(--border-dim)', paddingBottom: 6,
        }}>
          Lower Bracket
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          <BracketColumn label="Round 1">
            {card('LR1A')}
            {card('LR1B')}
          </BracketColumn>
          <BracketColumn label="Round 2">
            <CenteredMatch minHeight={CARD_H}>{card('LR2A')}</CenteredMatch>
            <CenteredMatch minHeight={CARD_H}>{card('LR2B')}</CenteredMatch>
          </BracketColumn>
          <BracketColumn label="Semifinal">
            <CenteredMatch minHeight={CARD_H * 2 + 8}>{card('LR3')}</CenteredMatch>
          </BracketColumn>
          <BracketColumn label="Final">
            <CenteredMatch minHeight={CARD_H * 2 + 8}>{card('LF')}</CenteredMatch>
          </BracketColumn>
        </div>
      </div>

      {/* Grand Final */}
      <div>
        <div style={{
          fontFamily: 'var(--font-head)', fontSize: 11,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          color: 'var(--amber)', marginBottom: 12,
          borderBottom: '1px solid var(--border-dim)', paddingBottom: 6,
        }}>
          Grand Final
        </div>
        <div style={{ maxWidth: 260 }}>
          {card('GF')}
        </div>
        {champion && (
          <div className="card" style={{
            maxWidth: 260, marginTop: 10,
            padding: '12px 16px',
            background: 'var(--teal-dim)',
            borderColor: 'var(--teal)',
            textAlign: 'center',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--teal)', textTransform: 'uppercase',
              letterSpacing: '0.1em', marginBottom: 6,
            }}>
              Champion
            </div>
            <div className="font-head text-teal bold" style={{ fontSize: 20 }}>
              {champion.name}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
