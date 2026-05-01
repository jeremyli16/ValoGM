# International Tournaments & Multi-Region — Implementation Plan

## Progress

| Step | Status |
|------|--------|
| 1 — Multi-region init | ✅ Done |
| 2 — Background league simulation | ✅ Done |
| 3 — New types + GameState fields | ⬜ Next |
| 4 — Qualification logic + tournament builder | ⬜ |
| 5 — Swiss stage sim (Masters play-in) | ⬜ |
| 6 — Champions group stage sim | ⬜ |
| 7 — Main bracket + S1 choice | ⬜ |
| 8 — `inter_tournament` phase machine | ⬜ |
| 9 — Free agency unlock + roster lock | ⬜ |
| 10 — Tournament display screen | ⬜ |
| 11 — History screen tournament entries | ⬜ |
| 12 — Stats screen region + tournament filter | ⬜ |
| 13 — Standings screen region tabs | ⬜ |

### Step 1 notes
- `initLeague` called for all 4 regions in `createNewGame` with distinct derived seeds (`seed + 0/111111/222222/333333`)
- All Maps (players, teams, orgs, leagues, coaches, contracts, matches, standings, roleRatings) merged into single GameState
- `otherLeagueIds: string[]` added to `GameState` and `SerializedGameState`

### Step 2 notes
- Regular-season simulation already covered all leagues automatically — `getAllMatchesForWeek` does not filter by leagueId
- `simOtherLeaguesPlayoffs` added: at `regular_season → playoffs` transition, eagerly builds + fully simulates all 3 other leagues' playoff brackets in one shot (no player interaction, no notifications)
- Brackets stored in `otherPlayoffBrackets: Map<string, PlayoffBracket>` (added to `GameState` and serialized); cleared on offseason → regular_season
- Season transition now regenerates schedules + standings for all 4 partnership leagues (not just player's)
- Match pruning already applies to all leagues (filters by `m.season`, not leagueId)

---

## Overview

Add background simulation of the 3 non-player regions, inter-split international tournaments
(Masters 1, Masters 2, Champions), free agency between splits, and display screens for
tournament brackets and cross-region stats.

---

## 1. Multi-Region Simulation

### Current state
`createNewGame` calls `initLeague` once (player's region only). Other regions' teams, players,
leagues, and matches do not exist in GameState.

### Changes

**`gameLoop.ts` — `createNewGame`**
- Call `initLeague` for all 4 regions at game start
- Merge all teams, players, orgs, coaches, contracts, roleRatings, matches, standings into the
  same Maps (they are already keyed by id/leagueId so no collision)
- Add `otherLeagueIds: string[]` to GameState listing the 3 non-player partnership league ids

**`gameLoop.ts` — `simWeekMatches`**
- After simulating the player's league week, also simulate the same week for each id in
  `otherLeagueIds`
- Other leagues' match results are stored in `state.matches` and stats in `playerMatchStats`
  exactly as the player's league — they just produce no notifications and require no input

**`gameLoop.ts` — season transition (offseason → regular_season)**
- When generating new schedules and standings, do it for all 4 leagues, not just `state.leagueId`

**`gameLoop.ts` — match pruning**
- Apply the same 3-calendar-season pruning rule to all leagues' matches

### Persistence cost
~3× more teams (36), players (180), matches (90/season). All handled by existing repos with no
schema changes needed.

---

## 2. New Types

Add to `types.ts`:

```typescript
export type GamePhase =
  | 'new_game' | 'preseason' | 'regular_season' | 'playoffs'
  | 'inter_tournament'   // NEW
  | 'offseason';

export interface TournamentSeed {
  teamId: string;
  region: RegionId;
  regionalSeed: number;   // 1–3 (Masters) or 1–4 (Champions)
  globalSeed: number;     // 1–12 (Masters) or 1–16 (Champions)
}

export interface InternationalTournament {
  id: string;
  name: 'Masters 1' | 'Masters 2' | 'Champions';
  calendarSeason: number;
  splitNum: 1 | 2 | 3;
  phase: 'play_in' | 'main_event' | 'complete';
  playInBracket: PlayoffBracket | null;   // reuse existing PlayoffBracket/PlayoffMatch types
  mainBracket: PlayoffBracket | null;
  qualifiedTeams: TournamentSeed[];
  seedOneChoice: string | null;           // teamId chosen as S1's first opponent
  champion: string | null;
  runnerUp: string | null;
  mvpPlayerId: string | null;
}
```

**`SplitRecord`** — add optional `tournamentId?: string`

**`GameState`** — add:
```typescript
otherLeagueIds: string[];
activeInternationalTournament: InternationalTournament | null;
tournamentHistory: InternationalTournament[];
```

**`SerializedGameState`** — mirror the same new fields for persistence.

---

## 3. Qualification Logic

### Masters (splits 1 & 2)

The 3 qualifiers from each region are the teams that reached the **Lower Bracket Final and
Grand Final** of that region's playoff:
- Regional seed 1: Grand Final winner (split champion)
- Regional seed 2: Grand Final loser (runner-up)
- Regional seed 3: Lower Bracket Final loser (3rd place / last eliminated before GF)

These teams are already identified in the existing `PlayoffBracket` structure — the GF
participants are `bracket.champion` and the GF loser, and the LB Final loser is the team
eliminated in the round whose `feedsWinnerTo` is the Grand Final slot.

**Global seeding formula (Masters):**
```
score = (4 - regionalSeed) * 3 + averageTeamOverallRating
```
Sort all 12 qualifiers descending → assign `globalSeed` 1–12. Average team overall rating
= mean of starters' `(aim + gameSense) / 2`, used only for tiebreaking.

---

### Champions (split 3 only)

#### Champions Points

Champions points accumulate across all 3 splits of the calendar season. Points are stored
on `Team` as `championsPoints: number` (reset to 0 at the start of each calendar season,
i.e., every 3rd split transition).

**Sources of Champions points:**

| Event | Points |
|---|---|
| Regular season win (any split) | 1 per win |
| Regional playoff — Split 1 or 2, 1st place | 5 |
| Regional playoff — Split 1 or 2, 2nd place | 3 |
| Regional playoff — Split 1 or 2, 3rd place | 2 |
| Regional playoff — Split 1 or 2, 4th place | 1 |
| Regional playoff — Split 3, 3rd place | 4 |
| Regional playoff — Split 3, 4th place | 3 |
| Masters 1 — 1st place | 6 |
| Masters 1 — 2nd place | 4 |
| Masters 1 — 3rd place | 3 |
| Masters 1 — 4th place | 2 |
| Masters 1 — 5th/6th place | 1 |
| Masters 2 — 1st place | 8 |
| Masters 2 — 2nd place | 6 |
| Masters 2 — 3rd place | 5 |
| Masters 2 — 4th place | 4 |
| Masters 2 — 5th/6th place | 3 |

**When points are awarded:**
- Regular season wins: at the end of each regular-season week tick, increment
  `team.championsPoints` for each match win (same tick that updates `team.wins`)
- Playoff placements: at the `playoffs → inter_tournament` transition when split record is
  built — read final bracket placement for each team and award points
- Split 3 playoff: top-2 teams are auto-qualified (no placement points for them); 3rd and
  4th still receive their points before qualification is resolved
- Tournament placements: at `inter_tournament → offseason` transition when tournament
  completes — read bracket finish positions and award points

**Placement mapping from bracket:**
- 1st = champion
- 2nd = Grand Final loser
- 3rd = LB Final loser (Masters) / group-stage playoff LB Final loser (Champions)
- 4th = UB Final loser
- 5th/6th = LB QF losers (2 teams share this placement)

#### Champions Qualification

At end of Split 3, for each region:
- **Seeds 1 & 2:** the two Grand Final participants (auto-qualify regardless of points)
- **Seeds 3 & 4:** the two non-GF teams within that region's league with the highest
  `championsPoints` total; ties broken by regular-season wins then mapDiff

**Global seeding formula (Champions):**
```
score = (5 - regionalSeed) * 4 + averageTeamOverallRating
```
Sort all 16 qualifiers descending → assign `globalSeed` 1–16.

---

### Champions Points Display

New section in the **Standings** screen: a "Champions Points" tab (alongside the existing
Group A / Group B standings tabs) that shows the current standings for the player's region.

**Table columns:** Rank · Team · Pts · W (reg season wins contributing) · Playoff Pts ·
Tournament Pts

The table is always visible (not just at Split 3) so the player can track the race throughout
the calendar season. Teams that have already auto-qualified via Grand Final appearance get a
"QUALIFIED" badge instead of a rank. Teams that are mathematically eliminated (cannot reach
4th place) get a dim style.

The same data is available for other regions via the region tabs described in section 7.

---

## 4. Tournament Formats

### Masters (12 teams total — 3 per region)

Regional seeds: each region contributes its split standings positions 1, 2, 3.
- **Regional seed 1s (4 teams):** advance directly to main event
- **Regional seeds 2 & 3 (8 teams):** enter the Swiss play-in

#### Play-in — Swiss stage (8 teams)

All matches bo3. A team is out at 2 losses; qualifies at 2 wins. 4 teams qualify.

**Round 1 constraint:** seed-2s play seed-3s only; no two teams from the same region
may face each other in round 1.

Pairing algorithm:
1. List the 4 regional seed-2s and 4 regional seed-3s
2. Shuffle seed-3s with a seeded RNG, then greedily assign each seed-2 to the first
   seed-3 from a different region — backtrack if no valid assignment found
3. Produces 4 cross-region, cross-seed round-1 matches

**Round 2:** pool all 1-0 teams together and all 0-1 teams together; pair within pool
by strength (strongest vs weakest), no same-region constraint enforced after round 1.

**Round 3:** pool all 1-1 teams (those not already at 2-0 or 0-2); pair by strength.

After round 3: exactly 4 teams are at 2-0 or 2-1 (Swiss qualifiers SQ1–SQ4, seeded
by record then by team rating). The 4 teams at 0-2 or 1-2 are eliminated.

#### Main event (8 teams: 4 regional seed-1s + SQ1–SQ4)
Double elimination, all matches bo3 except LB Final and Grand Final which are bo5.

**Seed 1 bracket choice (regional seed-1 with highest team rating = overall S1):**
- After play-in, S1 picks which Swiss qualifier they face in UB R1
- Player's team = S1 → UI modal listing SQ1–SQ4 with team name, region, rating
- AI S1 → picks the SQ with the lowest average team rating

After S1 picks, remaining S2–S4 are matched against remaining SQs by descending seed
(S2 vs best remaining SQ, S3 vs next, S4 vs last).

```
UB R1:  S1 vs [chosen SQ],  S2 vs SQ_best,  S3 vs SQ_next,  S4 vs SQ_last
UB SF:  UB R1 winners
UB F:   UB SF winners
LB R1:  UB R1 losers  (2 matches)
LB QF:  LB R1 winners vs UB SF losers  (2 matches)
LB SF:  LB QF winners
LB F:   LB SF winner vs UB F loser      ← bo5
GF:     UB F winner vs LB F winner      ← bo5
```

---

### Champions (16 teams total — 4 per region)

Regional seeds: each region contributes split standings positions 1, 2, 3, 4.

#### Group stage (4 groups × 4 teams, double elimination within each group)

**Group composition:** each group has exactly one team from each region and exactly one
team at each regional seed (1, 2, 3, 4). Groups are formed by random draw subject to
this constraint — shuffle regions, assign one seed from each region to each group.

**Within-group format (all matches bo3):**
```
UB R1:  S1 vs S4,  S2 vs S3
UB F:   UB R1 winners
LB R1:  UB R1 losers
LB F:   LB R1 winner vs UB F loser
Group F: UB F winner vs LB F winner
```
Top 2 from each group advance (Group Final participants). Bottom 2 eliminated.
Total advancing: 8 teams (2 per group × 4 groups).

#### Playoff bracket (8 teams, double elimination)

**Bracket draw:** random seeding of the 8 group advancers, subject to the constraint
that any two teams from the same group must be placed in opposite halves of the upper
bracket (they cannot meet until at earliest UB Final or LB).

Implementation: assign group-winners and runners-up to bracket slots 1–8; shuffle within
the constraint that each group's pair occupies one slot from {1,2,3,4} and one from
{5,6,7,8}.

All matches bo3 except LB Final and Grand Final which are bo5.

```
UB QF:  [1] vs [8],  [2] vs [7],  [3] vs [6],  [4] vs [5]
UB SF:  UB QF winners (same-half matchups)
UB F:   UB SF winners
LB R1:  UB QF losers  (4 matches, cross-half pairings)
LB QF:  LB R1 winners vs UB SF losers  (2 matches)
LB SF:  LB QF winners
LB F:   LB SF winner vs UB F loser      ← bo5
GF:     UB F winner vs LB F winner      ← bo5
```

---

## 5. Phase Machine Changes

### New phase: `inter_tournament`

Transition trigger: `playoffs → inter_tournament` fires when `playoffBracket.champion` is set
(same as current `playoffs → offseason` trigger). The split record is still built here.

**Masters week schedule:**
```
Week 1: Swiss round 1 + round 2
Week 2: Swiss round 3 (if needed) + S1 bracket choice + main event UB R1 + LB R1
Week 3: Main event UB SF through Grand Final
```

**Champions week schedule:**
```
Week 1: Group stage (all 4 groups run to completion — group double elim is short)
Week 2: Playoff bracket draw + UB QF + LB R1
Week 3: UB SF through Grand Final
```

### Player participation logic
Each `advanceWeek` in `inter_tournament`:
1. Determine if player's team is still alive in the tournament
2. If yes: simulate only matches that don't involve the player's team; player's team match
   waits for the advance click (same pattern as playoff simulation)
3. If no (eliminated or never qualified): auto-advance all remaining tournament weeks silently,
   then transition to offseason immediately

This means: if the player's team didn't qualify, clicking advance once skips the entire
tournament and drops into offseason.

### Updated phase flow
```
preseason (2w) → regular_season (5w) → playoffs (7w) → inter_tournament (1–3w) → offseason (4w) → regular_season …
```

---

## 6. Free Agency Between Splits

### Current state
Transfer market is active during regular season only. Offseason has contract expiry detection
but no player transfers.

### Changes

**`App.tsx` — nav guard**
- Allow `TransferMarket` screen during `offseason` phase (currently blocked)
- Allow `TransferMarket` during `inter_tournament` phase ONLY if player's team is eliminated
  or did not qualify

**`gameLoop.ts` — offseason tick**
- `processTransferOffers` is already called each week; ensure it runs during offseason weeks
- Add a "Transfer window open" notification at offseason week 1 with weeks remaining count

**Roster lock**
- During `inter_tournament`, prevent releasing or transferring players whose `teamId` belongs
  to a team still alive in `activeInternationalTournament`
- Show a lock indicator in the Transfer Market for locked players

---

## 7. Display

### New screen: `InternationalTournament`

Reuses the existing double-elimination bracket UI from `Playoffs.tsx` (same
`PlayoffBracket`/`PlayoffMatch` types).

Layout:
- Header: tournament name, status badge (Play-in / Main Event / Complete), champion display
- Masters tab: **Swiss Stage** | **Main Event bracket**
- Champions tab: **Group Stage** (4 group brackets) | **Playoff bracket**
- Player's team highlighted in teal (same as playoffs)
- Eliminated teams dimmed (same as playoffs)
- If S1 bracket choice is pending → modal overlay with team picker

Accessible from:
- Notification inbox (click "Tournament has begun" notification)
- Nav sidebar entry during `inter_tournament` phase
- History screen (view past tournaments)

### History screen additions
Each `SplitRow` already shows winner, runner-up, MVP. Add:
- Tournament name badge (e.g., "MASTERS 1")
- Champion team name
- "View Bracket" button that opens the archived `InternationalTournament` from
  `tournamentHistory`

### Stats screen additions
- Add **Region** filter dropdown (All / Americas / EMEA / Pacific / China)
- Tournament phase filter: add "International" option that shows only matches tagged
  `isTournament: true` on `PlayerMatchStat`

### Standings screen additions
- Add region tabs (Americas / EMEA / Pacific / China) instead of showing only the player's
  league
- Each tab shows the same Group A / Group B standings layout using that region's leagueId

---

## 8. Persistence Changes

**`SerializedGameState`** additions:
```typescript
otherLeagueIds: string[];
activeInternationalTournament: InternationalTournament | null;
tournamentHistory: InternationalTournament[];
```

No new IndexedDB stores needed — tournaments serialize into `gameState` (same as
`splitHistory`/`seasonHistory`). Tournament brackets use `PlayoffMatch` which is already
serializable.

**`PlayerMatchStat`** — add `isTournament?: boolean` field. Tournament matches get this flag
set to `true` so the Stats screen can filter them separately.

---

## 9. Implementation Order

| Step | Scope | Files touched | Status |
|------|-------|---------------|--------|
| 1 | Multi-region init | `leagueInit.ts`, `gameLoop.ts`, `types.ts` | ✅ |
| 2 | Background league simulation | `gameLoop.ts` (simWeekMatches, season transition), `types.ts`, `db/schema.ts`, `db/repos.ts` | ✅ |
| 3 | New types + GameState fields | `types.ts`, `db/schema.ts`, `db/repos.ts` | ⬜ |
| 4 | Qualification logic + tournament builder | `gameLoop.ts` (new functions) | ⬜ |
| 5 | Swiss stage sim (Masters play-in) | `gameLoop.ts` (new SwissStage simulator) | ⬜ |
| 6 | Champions group stage sim | `gameLoop.ts` (run 4× mini double-elim) | ⬜ |
| 7 | Main bracket + S1 choice | `gameLoop.ts`, `App.tsx` (new callback) | ⬜ |
| 8 | `inter_tournament` phase machine | `gameLoop.ts` (checkPhaseTransition) | ⬜ |
| 9 | Free agency unlock + roster lock | `App.tsx`, `gameLoop.ts` | ⬜ |
| 10 | Tournament display screen | `screens/InternationalTournament.tsx` | ⬜ |
| 11 | History screen tournament entries | `screens/LeagueHistory.tsx` | ⬜ |
| 12 | Stats screen region + tournament filter | `screens/Stats.tsx` | ⬜ |
| 13 | Standings screen region tabs | `screens/Standings.tsx` | ⬜ |

---

## Design Decisions (resolved)

1. **Champions qualification** — solved by the Champions points system in section 3.
   Cumulative points across all 3 splits naturally reward consistent performance.

2. **Tournament match development** — tournament matches tick morale and count toward the
   seasonal development pass (same as playoff matches). Additional effect: teams that reach
   the **LB Final or Grand Final** of an international tournament carry a **post-tournament
   fatigue penalty** into the next split's preseason week:
   - Morale decays an extra −5 for each player on the roster
   - Each player's `gameSense` receives a −2 temporary debuff for the first regular-season
     week (representing less map prep time and jet lag)
   - Implemented at the `inter_tournament → offseason` transition: tag qualifying teams with
     a `postTournamentFatigue: boolean` flag, applied during the first `weeklyPlayerTick` of
     the new regular season then cleared

3. **AI free agency** — AI teams participate in the transfer window during `inter_tournament`
   and `offseason` phases. Scope:
   - Re-sign expiring players at market rate (if budget allows) — prevents star players from
     walking to free agency unrealistically
   - Sign available free agents to fill any vacant starter slots, role-prioritized
   - Do NOT make buyout transfers (no AI poaching contracted players from other teams)
   - Runs as a batch at offseason week 1 tick, after the player's transfer window opens
