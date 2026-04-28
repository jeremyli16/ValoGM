# Tactics Screen — Design Reference

Covers three interconnected systems: **map pool practice allocation**, **agent comp builder**, and **agent meta**. Intended as implementation spec for the Tactics screen.

---

## 1. Map Pool Practice Allocation

### Current State
`team.mapPool: Record<string, number>` (0–100 per map) already exists on every team and covers all 12 maps in the universe. Higher scores apply a small aim/game-sense multiplier in `simMap` and bias veto decisions toward maps the team knows well. Currently scores are set at game init and never change.

### Proposed Mechanic
Each week, the player allocates a **practice budget** (suggested: 5 points) across maps. Unallocated maps decay.

**Growth formula (per week):**
```
rawGain = allocatedPoints * 2
diminishingGain = rawGain * (1 - currentScore / 120)   // slower near 100
mapPool[map] = min(100, mapPool[map] + diminishingGain)
```

**Decay formula (per week, unallocated maps):**
```
mapPool[map] = max(0, mapPool[map] - 0.5)
```

### Strategic Depth
- Active pool is 7 of 12 maps → player must decide whether to train reserve maps speculatively before rotation
- If 2 maps rotate out unexpectedly (10% chance per split), teams who trained reserve maps are immediately stronger on the new maps
- Budget is tight enough that you can't max all 7 active maps simultaneously

### UI Layout
- Two sections: **Active Pool** (7 maps) and **Reserve** (5 maps)
- Slider or +/− buttons per map for weekly allocation
- Running budget counter ("3 / 5 points allocated")
- Current score bar per map (color-coded: red <40, amber 40–70, teal >70)
- Decay warning icon on active maps with zero allocation
- Reserve maps show their score so player can see if a rotating-in map is ready

---

## 2. Agent Comp Builder

### Data Model
New field on `Team`:
```typescript
mapComps: Record<string, string[]>   // mapName → [5 agent names]
```

Each entry is the intended 5-agent lineup for that map. Players are matched to agents by position (index 0–4 = roster order).

### Agent Pool Per Player
New field on `Player`:
```typescript
agentPool: string[]   // agents this player can play (beyond mainAgent)
```
Agents in `agentPool` incur a small penalty vs. `mainAgent` (e.g. ×0.95 role rating multiplier). Reflects that players have off-agents they can run but aren't as comfortable.

### In Match Sim
Currently `SIDE_MODS` is keyed by `PlayerRole` (duelist/initiator/controller/sentinel). Agent comps add a second layer:

```typescript
// Agent-level attack/defense delta, applied on top of role SIDE_MODS
const AGENT_SIDE_DELTA: Record<string, { attack: number; defense: number }> = {
  Jett:    { attack: +0.04, defense: -0.02 },  // aggressive entry
  Sage:    { attack: -0.02, defense: +0.05 },  // site anchor
  Viper:   { attack: -0.01, defense: +0.04 },  // post-plant / site control
  Breach:  { attack: +0.03, defense: -0.01 },  // initiator aggression
  // ... etc
};
```

**Comp synergy:** Extends existing 4-role +6% bonus. Additional checks:
- Double-initiator comp (e.g. Sova + Breach): +2% attack bonus
- Classic site-anchor sentinel (Killjoy/Cypher) + smoker: +3% defense bonus
- Fully role-diverse lineup (1 of each role): existing +6%

### UI Layout
- Tab row = each active pool map
- Each tab: 5 player slots (roster order), agent picker per slot
- Agent picker filters by player's `primaryRole` but allows off-role with warning
- Bottom row: role comp check (must have 1 of each role or show warning), synergy rating, predicted attack/defense balance bar
- "Copy comp" button to duplicate a comp to other maps as starting point

---

## 3. Agent Meta System

### Data Model
Two new state fields on `GameState`:

```typescript
agentMeta: Record<string, number>                    // global patch strength 0–100
agentMapMeta: Record<string, Record<string, number>> // per-map strength modifier delta
```

**Initial values:** Per-agent baselines reflecting design intent (see table below). Map-specific deltas start at 0 and drift from there.

### Agent Baselines (suggested starting values)
| Role | Agent | Baseline |
|------|-------|----------|
| Duelist | Jett | 70 |
| Duelist | Reyna | 60 |
| Duelist | Raze | 68 |
| Duelist | Neon | 55 |
| Duelist | Iso | 52 |
| Duelist | Yoru | 48 |
| Initiator | Sova | 72 |
| Initiator | Fade | 65 |
| Initiator | Breach | 62 |
| Initiator | KAY/O | 58 |
| Initiator | Gekko | 60 |
| Initiator | Skye | 63 |
| Controller | Omen | 68 |
| Controller | Astra | 66 |
| Controller | Viper | 70 |
| Controller | Brimstone | 58 |
| Controller | Clove | 62 |
| Controller | Harbor | 42 |
| Sentinel | Killjoy | 72 |
| Sentinel | Cypher | 68 |
| Sentinel | Sage | 60 |
| Sentinel | Chamber | 58 |
| Sentinel | Deadlock | 50 |
| Sentinel | Vyse | 48 |

---

### Meta Update — Combined B+C System

Runs **once per split** (at split boundary, same time as map pool rotation). Produces a single "patch release" notification summarizing all changes.

#### Step 1 — Track Pick Rate (Option C)
During each split, all AI-vs-AI matches track agent picks across all simulated games. At split end:
```
pickRate[agent] = timesAgentPicked / totalAgentSlotsFilled
```
Baseline pick rate in a balanced meta = 1/24 ≈ 4.2% (24 agents, 10 slots per match).

Pick rate thresholds that trigger correction:
- `pickRate > 0.12` (3× expected) → flagged as "dominant"
- `pickRate < 0.02` (below half expected) → flagged as "neglected"

#### Step 2 — Threshold Band Check (Option B)
Independent of pick rate, check absolute strength:
```
strength > 80  → flagged for nerf
strength < 20  → flagged for buff
```

#### Step 3 — Compute Delta
For each agent, combine both signals:

```typescript
function computeMetaDelta(agent: string, strength: number, pickRate: number, rng: SeededRng): number {
  let delta = randFloat(rng, -8, +8);  // baseline random drift

  // Pick-rate signal
  if (pickRate > 0.12) delta -= randFloat(rng, 8, 18);   // dominant → nerf
  if (pickRate < 0.02) delta += randFloat(rng, 8, 18);   // neglected → buff

  // Threshold signal (independent of pick rate)
  if (strength > 80) delta -= randFloat(rng, 5, 15);     // too strong → nerf
  if (strength < 20) delta += randFloat(rng, 5, 15);     // too weak → buff

  // Hard floor/ceiling — clamp before applying
  return clamp(strength + delta, 15, 90) - strength;
}
```

Signals stack — an agent that is both dominant AND above 80 strength gets hit with both corrections, modeling Riot's tendency to hammer meta-warping picks.

#### Step 4 — Map-Specific Meta Drift
Separate, slower drift per agent per active map:
```
agentMapMeta[agent][map] += randFloat(rng, -0.03, +0.03)
agentMapMeta[agent][map] = clamp(agentMapMeta[agent][map], -0.15, +0.15)
```
No pick-rate correction on map-specific values — those reflect map geometry, not balance intent.

#### Step 5 — Patch Release Notification
Single notification pushed at split start summarizing all changes above a threshold (±5 or more):

```
PATCH X.Y — AGENT UPDATES

NERFS
  Jett       −14  (72% pick rate last split)
  Killjoy    −8   (81 → 73)

BUFFS
  Harbor     +12  (2% pick rate last split)
  Yoru       +9   (19 → 28)

No changes: Sova, Omen, Viper, ... [remaining agents]
```

Only agents with `|delta| >= 5` are listed. The rest are silently updated. Notification type: `'development'` (reuse existing type, or add `'patch_notes'` type for distinct styling).

---

### In Match Sim — Applying Meta

In `playerCombatPower`, after existing role/equipment/morale modifiers:

```typescript
// Global agent meta (0.90–1.10 range)
const globalMeta = agentMeta[player.mainAgent] ?? 60;
const agentMetaMod = 0.90 + (globalMeta / 100) * 0.20;

// Map-specific delta (−0.15 to +0.15)
const mapDelta = agentMapMeta[player.mainAgent]?.[mapName] ?? 0;

return base * roleMultiplier * equipMod * sideMod * moraleMod * agentMetaMod + mapDelta;
```

`mainAgent` is used when no comp is assigned; `mapComps` agent is used when a comp is set for that map.

---

## 4. Tactics Screen — Full Layout

```
┌─────────────────────────────────────────────────────┐
│  TACTICS                                            │
├──────────────────┬──────────────────────────────────┤
│  MAP POOL        │  AGENT COMPS                     │
│                  │                                  │
│  Active Pool     │  [Ascent] [Bind] [Haven] ...     │
│  ─────────       │                                  │
│  Ascent   [███░] │  Player 1  [Jett    ▾]           │
│  Bind     [████] │  Player 2  [Sova    ▾]           │
│  Haven    [██░░] │  Player 3  [Omen    ▾]           │
│  ...             │  Player 4  [Cypher  ▾]           │
│                  │  Player 5  [Raze    ▾]           │
│  Reserve         │                                  │
│  ─────────       │  Roles: ✓ D I C S   Syn: +8%    │
│  Icebox   [█░░░] │  Attack ████░░  Defense ███░░   │
│  ...             │                                  │
│  Budget: 3/5 pts │                                  │
├──────────────────┴──────────────────────────────────┤
│  META THIS SPLIT                                    │
│                                                     │
│  S-TIER  Jett(70) Sova(72) Viper(70) Killjoy(72)   │
│  A-TIER  Fade(65) Omen(68) Raze(68) ...             │
│  B-TIER  KAY/O(58) Clove(62) ...                   │
│  C-TIER  Harbor(42) Yoru(48) ...                   │
│                                                     │
│  Last patch: Jett −14, Harbor +12                  │
└─────────────────────────────────────────────────────┘
```

---

## 5. Data Changes Required

| Field | Location | Type | Notes |
|---|---|---|---|
| `mapComps` | `Team` | `Record<string, string[]>` | 5 agents per map |
| `agentPool` | `Player` | `string[]` | Off-agents player can run |
| `agentMeta` | `GameState` | `Record<string, number>` | Global strength 0–100 |
| `agentMapMeta` | `GameState` | `Record<string, Record<string, number>>` | Per-map delta −0.15 to +0.15 |
| `agentPickCounts` | `GameState` (transient) | `Record<string, number>` | Reset each split, not persisted |

`agentMeta` and `agentMapMeta` need to be added to `SerializedGameState` and persisted. `agentPickCounts` is accumulated during `simWeekMatches` and `simPlayoffStage`, reset at split boundary after the patch is applied.

---

## 6. Implementation Order

1. **Agent meta init** — initialize `agentMeta` from baseline table in `leagueInit.ts`; initialize `agentMapMeta` to all zeros; add both to `GameState` and serialization
2. **Pick tracking** — increment `agentPickCounts` in `simWeekMatches` and `simPlayoffStage` for every agent played
3. **Patch function** — `applyAgentPatch(state)` runs at split boundary: computes deltas, updates `agentMeta` + `agentMapMeta`, pushes patch notification, resets pick counts
4. **Match sim integration** — apply `agentMetaMod` in `playerCombatPower`; requires `agentMeta` + `agentMapMeta` passed into `simMatch` (alongside `activeMapPool`)
5. **Map pool weekly tick** — `applyPracticeAllocation(state)` runs each week tick; reads `team.practiceAllocation` (new field) and updates `team.mapPool`
6. **Tactics screen UI** — new screen wired into nav; three panels as above

Steps 1–4 (agent meta) are independent of steps 5–6 (map pool UI and comp builder) and can ship separately.
