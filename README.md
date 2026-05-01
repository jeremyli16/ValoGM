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
- Active roster sorted by role (Duelist → Initiator → Controller → Sentinel) with morale indicators
- Notification inbox (match results, contract alerts, transfer responses)

**Roster**
- Tabbed view: Starters (5) vs. Substitutes (0 or more — teams are not required to carry bench players)
- Players sorted by role within each tab
- Player detail panel: base stats (Aim, Game Sense, Clutch, Communication, Adaptability, Morale), role ratings with scout confidence, season averages (K/D/A, ADR, ACS, Rating) fetched live from IndexedDB, salary, main agent
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
- Match history grouped by split (Season N · Split N headers), collapsible; most recent split open by default
- Score display always shows player's wins first (e.g. W 2–1, never L 0–2 for a win)
- Per-match detail: series score, win/loss banner with MVP, map scores
- **Round timeline:** two-row colored layout — player team row (teal = round win, dim = loss) and opponent row (red = round win, dim = loss); regulation split into first half (rounds 1–12) and second half (13–24); overtime rounds (25+) displayed in a separate group separated by an amber divider with correct per-round attack-side tracking
- Full player stats split by team (your team first, sorted by rating): K, D, A, K/D, ACS, ADR, Rating

**Stats**
- League-wide player stat leaderboard aggregated from IndexedDB
- **Filter system:** season (calendar year), split (1/2/3/All), phase (All / Regular Season / Playoffs), role, team
- **Columns:** Player, Team, Maps, Rounds, K, D, A, K/D, ACS, ADR, Rating — all sortable
- Stats aggregated correctly: totals summed across maps, per-map averages (ACS/ADR/Rating) weighted by maps played
- Defaults to current calendar season, all splits, all phases

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
- **Overtime (MR2 per set):** proper double-round sets matching real Valorant OT; each set is two rounds with an intra-set side swap; a team wins the map only by winning both rounds in a set (leading by 2 overall); if 1–1 in a set, another set starts with the same attack side; OT rounds are numbered 25+ and tracked individually for the round timeline
- **Death-coupled kill assignment:** each player death generates exactly one kill credited to a skill+role-weighted opponent; survivors selected by the same weighted probability — guarantees total kills = total deaths per round, matching real Valorant
- **Damage separation:** kill damage and chip damage tracked separately; ACS accumulates chip damage + kill points only (matching the real ACS formula); ADR uses total damage including kills — allows independent calibration of ACS and ADR
- **Realistic stat targets:** K/D ratios in the 0.7–2.0 range (average ≈ 1.0); ACS average ≈ 200–210 with top fraggers reaching 240–250; ADR average ≈ 130; all calibrated against VLR.gg pro-play data
- **VLR Rating 2.0 (ML-derived):** rating formula uses feature importances from a machine-learning model fit against real VLR.gg rating data — `KPR×0.6332 + DPR×0.2179 + KAST×0.0862 + FDPR×0.0281 + APR×0.0182 + ADRa×0.0136 + FKPR×0.0027`, clamped to [0, 3]; KAST/FDPR/FKPR approximated from available stats with matched baselines so their contribution is proportional to deviation from the pro average
- **Real map veto:** bo1 = alternating bans until 1 map remains; bo3 = A ban → B ban → A pick → B pick → A ban → B ban → decider; bo5 = 2 bans then alternating picks + decider; teams ban the opponent's strongest map and pick their own strongest map
- **12-map universe with 7-map active rotation:** full pool is Ascent, Bind, Haven, Split, Fracture, Pearl, Lotus, Sunset, Abyss, Icebox, Breeze, Corrode; only 7 are active at any time (`GameState.activeMapPool`); veto and match simulation use the active pool only
- **Per-split map rotation:** at each new split, the pool may rotate — 60% chance no change, 30% chance 1 map swaps out, 10% chance 2 maps swap out; incoming maps are drawn from the reserve; a "Map Pool Update" notification names what was added and removed; seeded per-game so rotation history is deterministic and reproducible
- Per-match stats (K/D/A, ACS, ADR, Rating, maps played, isPlayoff) written to IndexedDB after each simulated match — both regular season and playoff matches
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
- All 4 regions (Americas, EMEA, Pacific, China) fully initialized at game start — 12 partnership teams + 8 challengers teams per region (48 partnership + 32 challengers teams total)
- Each region uses a distinct derived seed so results are deterministic but independent across regions
- Prestige-ordered roster draft from a shared player pool per region; bench roster is optional (teams may start with zero substitutes)
- Import rules enforced at draft (max 1 non-home-region starter per team)
- **Round-robin schedule:** polygon-rotation algorithm guarantees every team plays exactly once per week across 5 regular-season weeks (3 matches per group per week, 6 total); no team sits out any week; generated for all 4 regions each split
- Snake-draft group seeding

**Game Phases**
- `new_game → preseason → regular_season → playoffs → offseason → regular_season → ...`
- Each week advance simulates that week's matches, updates standings, ticks morale, and checks for phase transitions
- **Background region simulation:** all 3 non-player regions run their regular-season matches each week alongside the player's league; when the player's league enters playoffs, the other 3 regions' full playoff brackets are auto-simulated in one shot (results stored in `otherPlayoffBrackets`); new schedules are generated for all 4 regions each offseason transition

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
- IndexedDB schema with repositories for players, teams, orgs, leagues, matches, contracts, standings, notifications, role ratings, coaches, transfer offers, and player match stats
- `playerMatchStats` records keyed `{matchId}_{playerId}` store per-player K/D/A, ACS, ADR, and rating with `season`, `maps`, and `isPlayoff` fields
- Playoff match stats persist correctly — playoff matches live in `state.playoffBracket.matches` (separate from `state.matches`); the dirty-match flush checks both structures
- Teams written on every persist cycle (ensures roster/morale/record changes survive a reload)
- Dirty-flag system for players, matches, and coaches; transfer offers are fully upserted each cycle
- Full save/load reconstructs all `Map<>` structures from stored arrays
- **All-seasons standings loaded at startup:** `loadGameState()` calls `standingsRepo.getAll()` — standings from every prior split are available in `state.standings` immediately on load
- **Career stats in player detail:** Roster panel fetches all-time stats via `getByPlayer()` when a player is selected; career avg (K/D, ACS, ADR, Rating across all splits) shown below current-split avg when the player has history beyond the current split
- **Per-split standings archive in History screen:** each split row in League History has a "Standings" toggle that expands a final-standings table (seed, team, W/L/Pts/map diff) pulled from the archived standings for that split's game-season

---

## Not Yet Implemented

### International Tournaments (in progress)
International Masters and Champions tournaments connecting all 4 regions are planned but not yet implemented. See `INTERNATIONAL_PLAN.md` for the full spec and progress. Steps 1–2 (multi-region initialization and background simulation) are complete. Remaining: qualification logic, Swiss/group-stage formats, `inter_tournament` game phase, tournament bracket screen, and cross-region standings/stats views.

### Scouting
`PlayerRoleRatingRecord` stores a `scoutedRating` and `scoutConfidence` per role per player. Confidence passively improves each week via the coach's Scouting rating, but there is no active player-initiated scouting action — you cannot target a specific opponent player for scouting, and `Organization.scoutQuality` is stored but unused. Initial `scoutedRating` values are set at generation and never refined to reflect player development.

### Map Pool Editing
~~Implemented.~~ Player team uses explicit per-map practice allocation (UI sliders, `PRACTICE_BUDGET = 5` pts/week); active maps with pts > 0 gain score via diminishing returns, unallocated active maps decay 0.5/week. AI teams receive seeded random drift each regular-season week — active maps trend toward 60 with noise, reserve maps decay 0.3/week. Scores feed into match simulation aim/game-sense multiplier and ban/pick decisions.

### Chemistry
`Team.chemistry` is tracked but never read. No mechanic increases or decreases it (e.g., playing together, transfers, losing streaks), and it has no influence on match simulation.

### Injuries
The `Player` type has no injury or availability field. All players are always available. No injury events are generated by the match simulation.

### Offseason
The `offseason` phase exists in `GamePhase` but the game never enters it cleanly — after playoffs the state machine resets directly into the next season. There is no offseason logic: no free agency period, no contract expirations being resolved, no salary cap enforcement, no draft, and no end-of-season player development pass.

### Challengers League
Eight challengers teams are generated and assigned rosters at game start. They do not have a schedule, standings, or playoff bracket. There is no promotion/relegation mechanic between Challengers and Partnership tiers.
