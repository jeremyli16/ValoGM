# Finances Screen & Contract Renewal Design

## Finances Screen

Single screen holding:
- Team budget + payroll summary
- Sponsor contracts (stub for later — ship contracts first)
- Player contracts with expiry info
- Coach contracts with expiry info
- Pending renewal decisions

**Ship order:** Contracts + renewals first. Sponsors are a separate feature — don't block on them.

---

## Contract Renewal Flow

Uses existing `Decision` system (`type: 'contract_renewal'`, `pendingDecisions` array).

### Re-sign Window

- **Length:** First 2 weeks of offseason (exclusive window)
- After window closes, unresolved players walk to free agency
- Remaining 1–2 offseason weeks: open free agency acquisition only

### Notifications

Two-stage, not one:

1. **Week 1 of offseason:** "Contract expired — negotiate or release to free agency."
   - One notification per expiring player
   - Pushes a `Decision` into `pendingDecisions`

2. **End of week 2 (last chance):** "Final week — X has not been offered a renewal. They will enter free agency next week."
   - Fires only if Decision is still unresolved

### Salary Dynamics

**Re-sign negotiations (own players):**
- Player receptive near asking salary during the 2-week window
- No desperation discount — loyalty/stability preference means they won't take a big discount to stay
- Miss the window → they leave; you cannot chase them at a discount once they hit FA
- Re-sign is a commit-or-lose decision, not a wait-for-cheaper game

**Free agents (open market):**
- Full desperation curve: salary floor drops as offseason progresses
- Week 3+ of offseason: willing to sign at ~0.75× asking salary
- Creates timing strategy — wait for cheaper market, but risk another team swoops them
- Discount only applies once player is in open market (own expirees don't get this treatment while in re-sign window)

### No Signing Period Split

Don't separate into distinct "exclusive period" and "open period" phases — inauthentic to Valorant esports, adds complexity for low payoff. The 2-week re-sign window + free agency opening naturally creates the same strategic pressure.

---

## Offseason Phase (Prerequisite)

Current state: game skips from playoffs directly to next season. Offseason must be a real phase.

**Length:** 3–4 weeks
**Week structure:**
- Weeks 1–2: Re-sign window (exclusive negotiation with own expiring players)
- Weeks 3–4: Open free agency (re-sign window closed, FA market available)

**Phase transition:** `playoffs → offseason → regular_season`
Offseason ends after N weeks, triggers new season setup (schedule generation, standings reset, etc.)

---

## Decision System Integration

`Decision` type already has `contract_renewal` variant. `pendingDecisions` exists in `GameState`.

Each expiring player → one `Decision`:
```
{
  type: 'contract_renewal',
  description: "Re-sign [alias]?",
  deadline: offseasonEndWeek,
  data: { playerId, currentSalary, askingSalary, weeksRemaining }
}
```

Finances screen renders `pendingDecisions` filtered to `contract_renewal`. Player sets salary + length, sends offer. Response arrives next week advance (mirrors transfer offer pattern).
