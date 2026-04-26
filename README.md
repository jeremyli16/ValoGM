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
- Budget and payroll summary
- Next scheduled match preview
- Active roster with morale indicators
- Notification inbox (match results, contract alerts)

**Roster**
- Tabbed view: Starters (5) vs. Substitutes
- Player detail panel: base stats (Aim, Game Sense, Clutch, Communication, Adaptability, Morale), role ratings with scout confidence, season averages (K/D/A, ADR, Rating), salary, main agent
- Move players between starting lineup and bench; auto-fill vacant starter slots from bench then free agents, role-prioritized then by skill
- Import rule enforcement: max 1 non-home-region player in starting lineup; popup warning blocks week advancement if violated

**Transfer Market**
- Browse free agents and contracted players, filterable by role and search
- Make offers with adjustable fee, salary, and contract length
- Visual acceptance likelihood indicator

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
- Team slots show seed, name, and series score; player team highlighted in red; eliminated teams dimmed

**Match Day**
- Match history list with W/L indicators
- Per-match detail: series score, win/loss banner with MVP, map scores, round timeline, full player stats split by team (your team first, sorted by rating)

---

### Simulation Engine

**Match Simulation**
- Per-round economy: win income, loss bonuses (streak-aware), kill/plant bonuses, credit cap
- Buy type decisions (full buy / half buy / force / eco / pistol) based on credits
- Player combat power: Aim (55%) + Game Sense (30%) + Clutch (15%), modified by role rating, equipment tier, side (attack/defense), and morale
- Role side modifiers: Duelists strong on attack, Sentinels on defense, Controllers on defense, Initiators balanced
- Team synergy bonus (+6%) when all 4 roles are present
- Overtime: sides switch at 12–12, alternate each round, win by 2

**Player Generation**
- Five archetypes: Prodigy, Star, Veteran, Journeyman, Specialist — each with distinct age ranges, stat ceilings, and salary brackets
- Hidden true ratings (trueAim, trueGameSense) separate from observable scouted values
- Role ratings per player (primary + secondaries) with scout confidence
- Region-biased nationality generation (85% home-region) to ensure rosters can be filled without violating import rules

**Player Development**
- Per-season aging: stats grow pre-peak, decay post-peak
- Weekly morale tick: win/loss deltas, decay toward baseline
- Season-end development pass applied during offseason transition

**League Initialization**
- 12 partnership teams + 8 challengers teams per region
- Prestige-ordered roster draft from a shared player pool
- Import rules enforced at draft (max 1 non-home-region starter per team)
- Round-robin schedule generation split into two groups (Group A / Group B)
- Snake-draft group seeding

**Game Phases**
- `new_game → preseason → regular_season → playoffs → offseason → regular_season → ...`
- Each week advance simulates that week's matches, updates standings, ticks morale, and checks for phase transitions

**Persistence**
- IndexedDB schema with repositories for players, teams, orgs, leagues, matches, contracts, standings, notifications, and role ratings
- Dirty-flag system: only modified players and matches are re-written each week
- Full save/load reconstructs all `Map<>` structures from stored arrays

---

## Not Yet Implemented

### Transfer System
The UI lets you compose offers (fee, salary, contract length) and calculates acceptance likelihood, but nothing is wired up on the backend. Offers are not persisted, no AI response (accept / reject / counter) is generated, and no decision notification is sent back to the player. The `pendingDecisions` list and `Decision` type exist in the data model but are never populated.

### Contract Renewals
Expiring contracts generate notifications, but there is no UI to negotiate renewals, reject them, or let a player walk to free agency at season end. The `Decision` flow intended for this has no renderer.

### Scouting
`PlayerRoleRatingRecord` stores a `scoutedRating` and `scoutConfidence` per role per player. Confidence is set at generation and never updated — there is no action the player can take to scout opponents or improve confidence on their own players. `Organization.scoutQuality` exists but is unused.

### Coaching
`Organization.coachIntelligence` is stored and displayed nowhere. Coaches are not represented as entities, have no effect on match simulation, and have no associated UI or decisions.

### Map Pool
Each team has a `mapPool: Record<string, number>` representing strength per map, and a global `MAP_POOL` constant defines the active map pool. Neither is read during match simulation — maps are selected but team map preferences have no effect on outcomes.

### Chemistry
`Team.chemistry` is tracked but never read. No mechanic increases or decreases it (e.g., playing together, transfers, losing streaks), and it has no influence on match simulation.

### Injuries
The `Player` type has no injury or availability field. All players are always available. No injury events are generated by the match simulation.

### Offseason
The `offseason` phase exists in `GamePhase` but the game never enters it cleanly — after playoffs the state machine resets directly into the next season. There is no offseason logic: no free agency period, no contract expirations being resolved, no salary cap enforcement, no draft, and no end-of-season player development pass.

### Multi-Season Persistence
The current save/load model works within a season. Historical match results and standings from prior seasons are not archived to IndexedDB, so there is no all-time stats view, no career records, and no reference to previous season performance in player development.

### Challengers League
Eight challengers teams are generated and assigned rosters at game start. They do not have a schedule, standings, or playoff bracket. There is no promotion/relegation mechanic between Challengers and Partnership tiers.

### Separate Stats Screen
Season stats are currently shown inline (per-match in the Schedule, season averages in the Roster detail panel). A dedicated stats leaderboard would require:
- A league-wide stat aggregation pass over `state.matches`
- Sortable leaderboard tables (by rating, ADR, K/D) across all teams
- Per-player match-by-match history view (match ID is already stored on each `PlayerMatchStat`)
- Historical data surviving season transitions (requires offseason archival first)
