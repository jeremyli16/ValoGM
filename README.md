# ValoGM

A Valorant team management simulator. Build a franchise in one of four regional leagues, recruit players, manage your roster, and compete through a double-elimination playoff bracket.

---

## Tech Stack

- **Frontend:** React + TypeScript (Vite)
- **Styling:** Global CSS with custom design tokens (no component library)
- **Persistence:** IndexedDB (offline, browser-local saves)
- **Simulation:** Seeded RNG — deterministic, reproducible games from a seed

---

## Implemented

### Screens

**New Game**
- Region selection (Americas, EMEA, Pacific, China)
- Team selection from 12 franchise organizations per region
- Seed input with randomize button

**Dashboard**
- Win/loss record, standings position, points
- Budget and payroll summary (starters at full salary, bench players at 50%)
- Next scheduled match preview
- Active roster with morale indicators
- Notification inbox (match results, contract alerts, transfer responses)

**Roster**
- Tabbed view: Starters (5) vs. Substitutes (0 or more — teams are not required to carry bench players)
- Player detail panel: base stats (Aim, Game Sense, Clutch, Communication, Adaptability, Morale), role ratings with scout confidence, season averages (K/D/A, ADR, Rating) fetched live from IndexedDB, salary, main agent
- Move players between starting lineup and bench; auto-fill vacant starter slots from bench then free agents, role-prioritized then by skill
- Import rule enforcement: max 1 non-home-region player in starting lineup; popup warning blocks week advancement if violated
- Release player: two-step confirm in the detail panel; released players have their contract terminated, become free agents, and require no buyout fee when signing with a new team

**Transfer Market**
- **Players tab:** Browse free agents and contracted players, filterable by role and search; offer modal shows the required (non-negotiable) transfer fee computed from salary, years remaining, skill, and bench status; estimated acceptance likelihood indicator; live offers panel tracks all sent offers with their status (pending / accepted / rejected / counter)
- **Coaches tab:** View your current head and assistant coaching staff with stat bars; browse and search free agent coaches sorted by overall rating; hire via a modal with head/assistant role selection (displacing the current occupant back to free agency); release coaches back to free agency

**Schedule**
- Full season match list with W/L record summary
- Expandable match rows show per-player stats (K/D/A, ADR, Rating) for your team
- "This week" badge on the upcoming match

**Standings**
- Group A and Group B shown side by side
- Columns: seed, team, W, L, Pts, Map Diff, Round Diff
- Player's team highlighted

**Playoffs**
- Projects bracket from current standings during regular season (amber badge)
- Live bracket once playoffs begin (teal badge)
- Full double-elimination layout: Upper R1 → Upper SF → Upper Final; Lower R1 → Lower R2 → Lower SF → Lower Final → Grand Final
- 8 teams qualify (top 4 per group); seeds 1 & 2 receive byes into Upper SF
- **Structured weekly schedule:** Week 1 = 2× Upper R1; Week 2 = 2× Lower R1; Week 3 = 2× Upper SF; Week 4 = 2× Lower R2; Week 5 = Upper Final + Lower R3; Week 6 = Lower Final; Week 7 = Grand Final — multiple matches simulated per week advance
- Team slots show seed, name, and series score; player team highlighted in red; eliminated teams dimmed

**Match Day**
- Match history list with W/L indicators
- Per-match detail: series score, win/loss banner with MVP, map scores, round timeline, full player stats split by team (your team first, sorted by rating)

**Finances**
- Contract list for all rostered players: salary, calendar years remaining, expiry status (active / expiring / expired)
- **Contract renewal:** submit a new salary + length offer for any player; offer resolved on the next week advance; accepted offers extend the player's contract using calendar-year alignment
- Head and assistant coach contract display with role, salary, and years remaining
- Budget summary: total payroll vs. available budget

**History**
- One split = one complete game-season (regular season + playoffs); three splits form one calendar season
- Per-split results: split winner, runner-up (Grand Final loser), and split MVP (highest average rating across regular season and playoff matches)
- Per-season awards (shown at end of every 3rd split): Season MVP, Best Duelist, Best Initiator, Best Controller, Best Sentinel
- Seasons listed newest-first; splits within each season listed newest-first
- Player's team champion banner highlighted in amber; season champion badge on each season block
- Top bar and sidebar display calendar season and split number (e.g. "Season 1 — Split 2 — Week 4") rather than raw internal game-season counters

---

### Simulation Engine

**Match Simulation**
- Per-round economy: win income, loss bonuses (streak-aware), kill/plant bonuses, credit cap
- Buy type decisions (full buy / half buy / force / eco / pistol) based on credits and round number
- **Pistol bonus-round economy:** team that loses the pistol round (rounds 1 / 13) is forced to eco on round 2 / 14, saving full budget for a guaranteed full buy on round 3 / 15 — matches the real Valorant pistol → eco → bonus-round cadence
- Player combat power: Aim (55%) + Game Sense (30%) + Clutch (15%), modified by role rating, equipment tier, side (attack/defense), and morale
- Role side modifiers: Duelists strong on attack, Sentinels on defense, Controllers on defense, Initiators balanced
- **Role-differentiated kill and death rates:** Duelists entry-frag (kill weight ×1.30, survival weight ×0.80); Sentinels hold safe angles (survival ×1.25); Initiators and Controllers support (survival ×1.10 / ×1.00, kill weight ×0.90 / ×0.80) — produces realistic per-role stat profiles
- Team synergy bonus (+6%) when all 4 roles are present
- **Map-specific attack/defense bias** sourced from VLR.gg pro-play data: Split −0.03, Pearl −0.02, Bind +0.01, Haven +0.02, Fracture +0.02, Abyss +0.02, Ascent +0.03; bias shifts the per-round win probability of each round played on that map
- **Clutch mechanic:** when one player faces two or more opponents mid-round, a separate clutch check fires — 1v2 ≈ 28%, 1v3 ≈ 12%, 1v4 ≈ 5%, 1v5 ≈ 2% base rate (sourced from VLR.gg), scaled by the clutch player's Clutch stat (×0.7–1.3); success credits the clutch player with all remaining kills; failure on a non-match-point round results in a weapon save (player escapes)
- **Weapon saves:** losing-side survivor who fails a clutch check saves their rifle for the next round (does not die, no kill credited), unless it is match point — on match point all players fight to the death
- **Overtime (MR2 per set):** proper double-round sets matching real Valorant OT; each set is two rounds with an intra-set side swap; a team wins the map only by winning both rounds in a set (leading by 2 overall); if 1–1 in a set, another set starts with the same attack side
- **Realistic stat generation:** each round death produces exactly one kill credited to a role+skill-weighted opponent; survivors selected by role+skill probability; damage includes chip damage ensuring all players accumulate ADR even without kills — K/D ratios match pro play (0.7–2.0 range)
- **ACS-based rating:** per-round Average Combat Score uses the real Valorant formula — raw damage dealt, plus kill points by enemies-alive tier (150/130/110/90/70), plus multi-kill bonuses (+50 per extra kill, +200 ace), plus non-damaging assists ×25; normalised to ~1.0 for an average player
- **Real map veto:** bo1 = alternating bans until 1 map remains; bo3 = A ban → B ban → A pick → B pick → A ban → B ban → decider; bo5 = 2 bans then alternating picks + decider; teams ban the opponent's strongest map and pick their own strongest map
- **12-map universe with 7-map active rotation:** full pool is Ascent, Bind, Haven, Split, Fracture, Pearl, Lotus, Sunset, Abyss, Icebox, Breeze, Corrode; only 7 are active at any time (`GameState.activeMapPool`); veto and match simulation use the active pool only
- **Per-split map rotation:** at each new split, the pool may rotate — 60% chance no change, 30% chance 1 map swaps out, 10% chance 2 maps swap out; incoming maps are drawn from the reserve; a "Map Pool Update" notification names what was added and removed; seeded per-game so rotation history is deterministic and reproducible
- Per-match stats (K/D/A, ADR, Rating) written to IndexedDB after each simulated match and fetched per season for display
- **Coach tactics bonus:** head coach's Tactics rating boosts each player's effective Game Sense (×1+t/500) and Clutch (×1+t/750); assistant contributes at 50% weight

**Player Generation**
- Five archetypes: Prodigy, Star, Veteran, Journeyman, Specialist — each with distinct age ranges, stat ceilings, and salary brackets
- Hidden true ratings (trueAim, trueGameSense) separate from observable scouted values
- Role ratings per player (primary + secondaries) with scout confidence
- Region-biased nationality generation (85% home-region) to ensure rosters can be filled without violating import rules

**Player Development**
- Per-season aging: stats grow pre-peak, decay post-peak
- Weekly morale tick: win/loss deltas scaled by coach's Morale Boost rating (higher boost amplifies wins, cushions losses), decay toward baseline
- Season-end development pass applied during offseason transition
- **Passive scouting tick:** each week, the coach's effective Scouting rating raises role-rating confidence for all players on the squad (up to ~1.5 pts/week at max combined rating)

**League Initialization**
- 12 partnership teams + 8 challengers teams per region
- Prestige-ordered roster draft from a shared player pool; bench roster is optional (teams may start with zero substitutes)
- Import rules enforced at draft (max 1 non-home-region starter per team)
- **Round-robin schedule:** polygon-rotation algorithm guarantees every team plays exactly once per week across 5 regular-season weeks (3 matches per group per week, 6 total); no team sits out any week
- Snake-draft group seeding

**Game Phases**
- `new_game → preseason → regular_season → playoffs → offseason → regular_season → ...`
- Each week advance simulates that week's matches, updates standings, ticks morale, and checks for phase transitions

**Coaching Staff**
- Each team may have one head coach and one optional assistant coach
- Three ratings per coach: Tactics (match performance), Scouting (role-rating confidence), Morale Boost (win/loss morale deltas)
- Head coach contributes at full value; assistant at 50% — effective value is their combined weighted sum
- 42 coaches generated at game start (region-biased nationality); all teams assigned a head coach, top 8 partnership teams also receive an assistant; remainder enter the free agent pool
- Coach salaries scale with average rating; coaches are persisted to IndexedDB and tracked via dirty flag

**Transfer System**
- **Calendar-year contracts:** contract length is measured in calendar years (groups of 3 splits); `endSeason` is always divisible by 3; a contract signed mid-split counts the current calendar year as year 1; contracts only decrement at the end of each calendar year (after every 3rd split), not per-split
- **Free agents** sign directly — no fee required; acceptance weighted heavily toward any reasonable salary offer
- **Contracted players** require a non-negotiable buyout: `salary × yearsRemaining × skillMultiplier (0.75–1.5)`; bench players receive a 40% discount on their buyout (teams holding players on the bench are easier to buy out)
- **Bench salary rule:** players in the substitute slot cost 50% of their contract salary in payroll; starters cost full salary — discourages hoarding
- **AI acceptance model** (0–95% probability per advance): salary ratio vs. asking salary (0–70 pts); team win-rate delta between buying and current team (−10 to +20 pts); morale (unhappy players easier to poach, −15 to +15 pts); free agent bonus (+35); bench bonus (+10)
- **Counter-offers:** when the salary is in the 0.8–1.3× band the AI has a 35% chance to counter with the exact salary that would flip them to accept
- All offers are persisted immediately; responses arrive on the next week advance

**Persistence**
- IndexedDB schema (v2) with repositories for players, teams, orgs, leagues, matches, contracts, standings, notifications, role ratings, coaches, transfer offers, and player match stats
- `playerMatchStats` records keyed `{matchId}_{playerId}` store per-player K/D/A, ADR, and rating with a `season` field; written alongside match results in the dirty-match flush
- Teams written on every persist cycle (ensures roster/morale/record changes survive a reload)
- Dirty-flag system for players, matches, and coaches; transfer offers are fully upserted each cycle
- Full save/load reconstructs all `Map<>` structures from stored arrays

---

## Not Yet Implemented

### Scouting
`PlayerRoleRatingRecord` stores a `scoutedRating` and `scoutConfidence` per role per player. Confidence passively improves each week via the coach's Scouting rating, but there is no active player-initiated scouting action — you cannot target a specific opponent player for scouting, and `Organization.scoutQuality` is stored but unused. Initial `scoutedRating` values are set at generation and never refined to reflect player development.

### Map Pool Editing
Each team has a `mapPool: Record<string, number>` (0–100 practice score per map) covering all 12 maps in the universe. Practice scores already affect match simulation — higher scores give a small aim/game-sense multiplier on that map and influence ban/pick decisions. However, there is no UI for the player to view or adjust their team's map pool scores; teams cannot actively train on maps coming into the rotation.

### Chemistry
`Team.chemistry` is tracked but never read. No mechanic increases or decreases it (e.g., playing together, transfers, losing streaks), and it has no influence on match simulation.

### Injuries
The `Player` type has no injury or availability field. All players are always available. No injury events are generated by the match simulation.

### Offseason
The `offseason` phase exists in `GamePhase` but the game never enters it cleanly — after playoffs the state machine resets directly into the next season. There is no offseason logic: no free agency period, no contract expirations being resolved, no salary cap enforcement, no draft, and no end-of-season player development pass.

### Multi-Season Persistence
Per-season player stats are written to IndexedDB and survive reloads within the current season. Historical match results and standings from prior seasons are not yet archived — at season transition, old stats remain in the store but there is no UI to view career records, cross-season leaderboards, or prior-season standings.

### Challengers League
Eight challengers teams are generated and assigned rosters at game start. They do not have a schedule, standings, or playoff bracket. There is no promotion/relegation mechanic between Challengers and Partnership tiers.

### Separate Stats Screen
Season stats are currently shown inline (per-match in the Schedule, season averages in the Roster detail panel). A dedicated stats leaderboard would require:
- A league-wide stat aggregation pass over `state.matches`
- Sortable leaderboard tables (by rating, ADR, K/D) across all teams
- Per-player match-by-match history view (match ID is already stored on each `PlayerMatchStat`)
- Historical data surviving season transitions (requires offseason archival first)
