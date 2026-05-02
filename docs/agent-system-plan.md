# Agent System Redesign Plan

## Overview

Five changes to the agent/tactics system. Implementation order: 1 → 4 → 2 → 5 → 3.

---

## 1. Role-Class Penalty → Main Agent Boost

**Current:** penalty triggers if `selectedAgent !== mainAgent`  
**New:** penalty only for agents outside player's primary role class; main agent gives a small boost

### Changes

- Add `assignedAgent: string` to `PlayerState` (currently has `mainAgent`)
- Pass map comp through `simMatch` → `simMap` → `buildPlayerState`
- Compute `agentFitMod` at state build time:

| Condition | Modifier |
|---|---|
| `selectedAgent === mainAgent` | ×1.03 (boost) |
| `AGENT_ROLE[selectedAgent] === player.primaryRole` | ×1.00 (no penalty) |
| off-role agent | ×0.95 (penalty) |

- Apply `agentFitMod` in `playerCombatPower` alongside existing mods
- `Team.mapComps` already stores per-map agent selections — just needs wiring into `simMap`

---

## 2. Secondary Role Unlocks via Role Ratings

`PlayerRoleRatingRecord.trueRating` exists per role. Use it to gate penalty-free off-role play.

### Thresholds

| `trueRating` | Effect |
|---|---|
| ≥ 70 | Full unlock — any agent in that role, no penalty |
| 50–69 | Partial unlock — top N agents in that role by current `agentMeta` strength, no penalty |
| < 50 | All agents in that role penalized |

### Changes

- `buildPlayerState` reads all 4 role ratings, computes:
  - `freeRoles: Set<PlayerRole>` — fully unlocked roles
  - `freeAgents: Set<string>` — partially unlocked agents (top by meta strength)
- `agentFitMod` checks these before applying the ×0.95 penalty
- No new data structures — role ratings already in `state.roleRatings` map

### Example

Duelist with controller `trueRating = 58` → Omen and Astra (top 2 by meta) free, Viper/Harbor/etc still penalized. Same player at `trueRating = 71` → all controllers free.

---

## 3. Role Rating Growth from Playing Agents

Existing `updateRoleRatings` already grows `trueRating` if `lastPlayedSeason === currentSeason`. Missing link: nothing sets `lastPlayedSeason` based on actual agent picks.

### Changes

- At split end (offseason transition), scan each player's `mapComps` across all active maps
- Collect which roles they were assigned via `AGENT_ROLE[assignedAgent]`
- Update `roleRating.lastPlayedSeason` for every role played at least once that split
- Existing growth formula handles the rest — `adaptability` governs speed

### Result

Playing Omen as a duelist → controller `lastPlayedSeason` updates → controller rating slowly grows → partial unlock → eventual full unlock. Naturally gated by `adaptability`. No schema changes needed.

---

## 4. UI Agent Selector Redesign

**Current:** 3 optgroups — Main / Agent Pool / Off-Role (warning)  
**New:** 3 optgroups reflecting actual penalty tiers, single warning per row

### Dropdown Groups

```
★ MAIN          →  mainAgent, shows (+3%) label
── NO PENALTY ──→  same primary role agents + unlocked secondary agents (from §2)
── PENALTY ─────→  everything else (no per-option ⚠ symbol)
```

### Row Indicator

- One amber `~` on the row if selected agent is in PENALTY group
- Remove per-option ⚠ from dropdown (was shown on every penalized option — noise)
- Optional: small role badge (4-letter, role-colored) next to each agent name for visual scanning

---

## 5. Agent-Map Affinity

`agentMapMeta: Record<string, Record<string, number>>` and `agentMapDelta` already exist in the sim and are applied in `simMap`. Gap is just population.

### Data

- Hardcode `AGENT_MAP_AFFINITY` base table in `types.ts`
- Deltas derived from VLR.gg pro playrate data (e.g. Viper +8 on Icebox, −4 on Ascent; Killjoy +6 on Bind, etc.)
- ~40 significant entries, rest default to 0

### Init & Drift

- At game init and each split rotation, seed `agentMapMeta` from base table + small RNG drift (±2 pts, seeded)
- Meta evolves slightly each split; integrates cleanly into existing `agentMapDelta` — no combat math changes

### UI in CompPanel

- When map tab is active, show small colored delta badge next to each agent in dropdown:
  - `+5` in teal, `−3` in red, blank if ≈ 0
- Legend or tooltip explaining the delta

---

## File Touches

| File | Change |
|---|---|
| `src/types.ts` | Add `AGENT_MAP_AFFINITY` constant; update `PlayerState` with `assignedAgent` |
| `src/engine/matchSim.ts` | Wire map comp → `buildPlayerState`; compute `agentFitMod`; populate `agentMapMeta` from affinity table |
| `src/engine/gameLoop.ts` | At split end, update `lastPlayedSeason` per role from map comps |
| `src/components/screens/Tactics.tsx` | Redesign agent dropdown groups; add map affinity badge; single penalty warning per row |
