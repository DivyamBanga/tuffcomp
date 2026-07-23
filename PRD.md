# tuffcomp - Product Requirements Document

A drafting game where you and your friends build sports teams from real players, then an
analysis engine rates every team on quality, positional fit, chemistry, and balance to
decide who built the best squad.

Status: Phase 0-4 built. Single-player is feature-complete: spin, build, get rated, best score
and history persist locally across reloads. Multiplayer (Phase 5+) is next.
Owner: Divyam.
Last updated: 2026-07-23.

---

## 1. Vision

Spin and you get one real World Cup team and year (like France 2022). Take one player from that
squad's real roster, then place them wherever you want on your 4-3-3 - any open slot they can
legally play. Spin again for the next pick. Repeat until your XI is full. Every spin is a fresh
random Team-Year, so your finished lineup is a mix of players pulled from different real squads
across World Cup history. Once everyone is done, a scoring engine analyzes each team on more
than raw talent. It looks at how well players fit their positions, how much nation chemistry the
squad has, and whether the team is balanced or is missing a key job. The best-built team wins,
fairly and transparently.

Two sports, four modes total. We ship one fully working mode first, then reuse the same
engine and screens for the rest.

- Soccer
  - World Cup mode (build first)
  - Clubs mode
- Basketball
  - All-Time draft
  - Current draft

The single most important part of this product is the rating algorithm. It has to feel
realistic, fair, and explainable. Section 5 specs it in depth.

---

## 2. What we learned from the reference games

We researched the games this is inspired by so the design is grounded, not guessed.

### Soccer Card Draft (Roblox) - the soccer model
- You roll a Team-Year card, which is a national squad from a World Cup era (France 2022).
- You build a lineup from that squad's real players.
- Chemistry is nation based. Same-country links raise your overall.
- Team OVR is essentially a weighted average of your rated players.
- Competition happens through cups, brackets, and leaderboards ranked by peak Team OVR.

### 82-0 (web) - the basketball model
- A randomizer picks a decade and a franchise. You draft a player from that team in that era.
- You fill a five-slot lineup (PG, SG, SF, PF, C), one player per decade (era diversity rule).
- The engine ignores hype and uses real per-game stats (PTS, REB, AST, STL, BLK), normalized
  across eras so a 1980s player can be compared fairly to a 2020s player.
- Those stats feed a win curve that projects a season record between winless and a perfect 82-0.
- Key insight for us: a stacked roster still fails if it leaves a major job uncovered. Team
  shape and role coverage matter as much as star power.

### FIFA Ultimate Team chemistry - the chemistry model
- Chemistry is capped and link based. Players earn it from shared nationality, league, and club.
- A player only earns chemistry when played in a position they can actually play. Out of
  position means zero chemistry.
- This is exactly the "you cannot put attackers in defense" rule the game needs.

### NBA lineup analytics - the balance model
- Good lineups combine playmaking, shooting, self-creation, size, rebounding, and rim protection.
- Redundant lineups (five of the same archetype) underperform. Complementary lineups overperform.
- This is the research basis for our Balance score, which rewards covering every key job and
  penalizes redundancy and gaps.

Our engine fuses all four ideas: player quality, positional fit, chemistry links, and role
balance.

---

## 3. Core concepts and terminology

- Squad / Team-Year card: a real team from a specific year (France 2022), containing that
  team's real players. Each spin reveals one of these; you take exactly one player from it.
- Player: a real athlete with an overall rating, a broad position (GK, DEF, MID, or FWD), and a
  small set of attributes. See section 7 for why positions are broad rather than granular.
- Formation: the shape of the lineup and its slots. Only 4-3-3 is supported - see section 4.1.
- Slot: a single position on the pitch that holds one player (for example the left back slot).
  Each slot has a cosmetic label (LB, CB, CDM, ST, ...) for how it's drawn on the pitch, but its
  eligibility is decided by its broad position (DEF, MID, ...).
- Spin: reveals a random Team-Year and its roster. You pick any one player from it whose
  position still has an open slot somewhere on your pitch, then place them by tapping that slot.
- Lineup / XI: the full set of filled slots that make up a built team.
- Rating: the engine's 0 to 100 score for a built team, with a visible breakdown. Not yet built
  (Phase 3).
- Position compatibility: how well a player can play a given slot: natural, stretch, or illegal.
- Chemistry: bonus from players sharing a nation. See section 5.2 for why it's nation-only.
- Balance: how well the team covers every key job without gaps or redundancy.

---

## 4. Game modes

### 4.1 Soccer World Cup (MVP, build first)

The lineup is always a 4-3-3: GK, LB, CB, CB, RB, CDM, CM, CM, LW, ST, RW - 11 slots. This is
the only formation the game supports (see the "one formation" decision in section 7.1 - it's a
direct consequence of how the real position data is shaped, and it also just keeps the game
easier to pick up).

Flow, repeated once per pick:
1. Spin. The game reveals a random Team-Year card (for example France 2022) from the full pool
   of real World Cup squads (see section 7).
2. Pick. You see that squad's real roster, filtered to players who still have at least one open
   slot on your pitch they're eligible for (illegal positions are never offered, so you can never
   put a defender at forward). Take any one player, or spin again if you don't like this squad.
3. Place. Your pitch highlights every open slot that player can legally fill - tap one to place
   them there. If more than one slot fits (say both CB slots are open), you choose which.
4. Repeat for the next pick. Every spin is independent and fully random, so your XI ends up
   built from players pulled out of many different real squads and years.
5. Rate. Once all 11 slots are filled, the engine scores your XI and shows the breakdown. Not
   yet built - this is Phase 3.

This single mechanic is the whole game for now - solo, chasing your best rating. It replaces an
earlier plan that had you build freely from one whole spun squad, with a separate "snake draft"
mode for mixing squads. Real player-position data at the scale we draw from can't support that
distinction cleanly (see section 7), and pulling one player per spin turned out to be a cleaner,
more game-like loop anyway - it's genuinely closer to how the Roblox reference game works (you
roll cards repeatedly, not once).

Multiplayer (later, section 10) reuses this exact mechanic: players take turns being the one who
taps a slot and spins, in a natural snake order. No separate multiplayer-only mode is needed.

### 4.2 Soccer Clubs (later)

Same as World Cup but the cards are club Team-Years (Barcelona 2011, Real Madrid 2017). Because
club squads mix nationalities, league and club chemistry become more important than nation
chemistry. Reuses the entire soccer engine and UI.

### 4.3 Basketball All-Time (later)

The 82-0 model. Spin a decade and franchise, draft into PG, SG, SF, PF, C with an era-diversity
rule. Uses a basketball variant of the rating engine driven by era-normalized real stats. Output
includes a projected season record in addition to a 0 to 100 rating.

### 4.4 Basketball Current (later)

Same as All-Time but restricted to current rosters and current-season stats. No era
normalization needed. Simplest basketball variant.

---

## 5. The rating algorithm (the core deliverable)

This is the heart of the product. The design goals are: realistic, fair, deterministic, and
explainable. Every score comes with a plain-language reason so players trust it.

The engine is a pure function. Given a built team it returns a rating object. No randomness in
the core rating (randomness only appears in the optional head-to-head simulation in section 6).

### 5.1 Inputs

A built team is a list of filled slots. Each filled slot has:
- the slot's cosmetic label and its broad position (for example LB, position DEF)
- the player placed there (overall, attributes, position, nation, year)
- the formation context (which slots are adjacent, used for spine cohesion)

### 5.2 The four components

The final rating is a weighted blend of four component scores, each on a 0 to 100 scale.

#### Component Q - Quality (raw talent, position weighted)

Not every position matters equally. A world-class striker or goalkeeper moves the needle more
than a slightly better full back. Each slot has a weight that reflects its impact. Weights sum
to 1 across the XI.

```
Q = sum over slots of ( player.overall * slotWeight ) , scaled to 0..100
```

Example slot weights for 4-3-3 (tunable, must sum to 1):
GK 0.09, CB 0.08 each, FB 0.06 each, CDM 0.10, CM 0.09 each, W 0.10 each, ST 0.15.

Q rewards using the best players and spending your best talent on the most important slots.

#### Component F - Fit (right player, right position)

Two parts, averaged per slot then averaged across the XI.

1. Position compatibility. How naturally the player plays this slot, from a compatibility
   matrix (section 5.3). Natural = 1.0, stretch = 0.5, illegal = 0. Illegal placements are
   blocked in the UI, so in practice the floor is the stretch value.
2. Attribute alignment. Does the player's attribute profile suit the slot's cosmetic role? Even
   though eligibility only checks the broad position, the slot's label still carries a profile
   of which attributes matter (an LB slot wants pace and defending, an ST slot wants shooting
   and pace) so a fast defender still fits a full back slot better than a slow one, even though
   both are just "DEF" for eligibility purposes.

```
slotFit = 0.6 * positionCompatibility + 0.4 * attributeAlignment
F = average(slotFit over all slots) * 100
```

F rewards putting players where they belong and punishes forcing players out of role.

#### Component C - Chemistry (links between players)

Nation-only, unlike the original plan's nation/league/club blend. The real data we draw from
(section 7) doesn't include club career history at the scale we need, so nation is the only
link we can honestly compute. This isn't a downgrade in practice: because every slot is filled
by an independent spin across the entire pool, nation chemistry is the central strategic
tension of the whole game. Every spin gives you a different random nation, so you're constantly
choosing between the best available player and building toward a chemistry bonus with players
you've already placed.

```
for each player: chemPoints = clamp( f(count of other players sharing their nation) , 0, maxPerPlayer )
C = ( sum of chemPoints / (maxPerPlayer * 11) ) * 100
plus a small spine cohesion bonus when adjacent slots (GK-CB-CM-ST) share a nation
```

FIFA Ultimate Team's chemistry model was multi-link (nation, league, club); ours is intentionally
simpler because it's what the real data actually supports without fabricating career histories
we don't have. If a future data source gives us real club history, club chemistry can be added
without changing this formula's shape.

#### Component B - Balance (role coverage, anti-redundancy)

This is the 82-0 insight and the part most games miss. A team is scored on whether it covers
every key job, not just whether it has stars. We define a set of team needs and measure how
well the XI covers each from player attributes and roles.

Soccer team needs (example set, tunable):
- goalkeeping
- defensive solidity / ball winning
- creativity / playmaking
- width / wing threat
- finishing
- pace in behind
- aerial and physical presence

For each need, compute a coverage score from the players best suited to it. Penalize any need
that is left thin or empty. Penalize redundancy (for example three pure target-man strikers and
no creator). Reward complementary profiles.

```
for each need: coverage = strengthOfBestCoveringPlayers(need)
B = weightedAverage(coverage over all needs) * 100
apply a gap penalty if any critical need falls below a threshold
```

B is what stops a team of eleven expensive but redundant players from beating a smart,
balanced team. It directly delivers "the best teams that fit best together overall."

### 5.3 Position compatibility matrix

Four broad positions, not the twelve granular ones (CB/LB/RB/CDM/CM/CAM/LM/RM/LW/RW/ST) originally
planned - see section 7.1 for why. Values are natural 1.0, stretch 0.5, illegal 0.

Positions: Goalkeeper (GK), Defender (DEF), Midfielder (MID), Forward (FWD).

Rules encoded in the matrix (`engine/positions.ts`, unit tested):
- GK only plays GK.
- DEF and MID can stretch into each other.
- MID and FWD can stretch into each other.
- DEF and FWD never connect directly - a player has to be genuinely midfield-capable to bridge
  defense and attack.

This is coarser than the original CB/LB/RB-level design, but it's what real, freely-available
position data actually distinguishes at the scale of ~9,500 players across 400+ squads (section
7). The pitch still draws a full 4-3-3 shape with real role labels (LB, CB, CDM, LW, ST, RW) -
only the underlying eligibility check is broad.

### 5.4 Final rating

```
rating = wQ*Q + wF*F + wC*C + wB*B
```

Starting weights (tunable through playtesting): wQ 0.40, wF 0.20, wC 0.15, wB 0.25.

Rationale: quality matters most, but fit, chemistry, and balance together outweigh it, so a
smart build beats a naive all-stars build. This is what makes the game about team building
rather than just picking the highest overalls.

### 5.5 Explainability

Every rating returns the four component scores plus a short generated summary, for example:
"Elite attack and great chemistry, but thin at holding midfield with no natural ball winner,
and two players are slightly out of position." This is generated from the component internals
(which need scored lowest, which slots had the worst fit) using simple templates. Trust in the
engine depends on this.

### 5.6 Tuning and validation

The engine ships with a suite of fixture teams and asserted orderings, for example:
- a balanced XI must outscore a lopsided all-attackers XI
- placing a striker at center back must lower the rating versus a natural center back
- an all-one-nation squad must have higher chemistry than a scattered one
- removing the only playmaker must trigger the creativity gap penalty

Weights and matrices are constants in one config module so they can be tuned quickly. We
playtest with real curated squads and adjust until the rankings feel right.

---

## 6. Head-to-head simulation (secondary output)

You asked for a team rating and ranking primarily, with a head-to-head element too. The rating
engine is the foundation; the simulation is a thin layer on top that reuses its outputs, so the
two never disagree.

Given two built teams, derive an attack strength (quality of forwards and creators plus
finishing plus chemistry) and a defense strength (quality of defenders and keeper plus
solidity). Expected goals for each side come from a simple model comparing one team's attack to
the other's defense. A small, seeded random variance adds drama, then we produce a scoreline.

This gives a fun 1v1 result for two friends while staying consistent with the ratings. It is
optional and can be turned off to fall back to pure rating comparison. Built in Phase 5.

---

## 7. Data model and data plan

Phase 1 originally hand-curated 10 iconic squads (~180 players) by hand. That doesn't scale to
"many teams, many years" - hand-authoring accurate rosters is slow and caps out around a few
dozen squads before it becomes the bottleneck on everything else. Phase "3-redesign" replaced it
with a real, automated data pipeline. This section describes what shipped.

### 7.1 Real sources, not hand-curated

Two free, legally reusable datasets, merged by `scripts/generate-squads.mjs`:

- **1970-2022 (14 men's World Cups):** the
  [Fjelstul World Cup Database](https://github.com/jfjelstul/worldcup) (CC-BY-SA 4.0, Joshua C.
  Fjelstul, Ph.D.). Real squads, real player names, and a broad position per player (goalkeeper /
  defender / midfielder / forward), plus per-tournament appearances, goals, and awards we use as
  rating signal (see 7.3).
- **2026:** [mominullptr/FIFA-World-Cup-2026-Dataset](https://github.com/mominullptr/FIFA-World-Cup-2026-Dataset)
  (CC0). Real squads for all 48 teams, with caps, career goals, and market value as rating
  signal.

The decision to go with these sources over continued hand-curation directly shaped two other
design choices:

- **Positions are broad (GK/DEF/MID/FWD), not granular (CB/LB/RB/...).** Neither source
  distinguishes further than that. We chose broad positions over hand-patching thousands of
  players' exact sides and roles ourselves, which would have reintroduced the scaling problem
  we were trying to solve. See section 5.3.
- **No club or league field on Player.** Neither source tracks club career at this scale. We
  chose to drop the fields rather than fabricate plausible-looking but fake club history. This
  is why Component C (Chemistry, section 5.2) is nation-only for now.

Neither source has skill ratings - nobody's is free to redistribute at this scale, and section
7.3 was already true before this redesign: our overalls are our own values, not copied from any
official source. What changed is that they're now generated algorithmically from real signal
(goals, appearances, awards, caps, market value) rather than hand-tuned per player, because
hand-tuning ~9,500 players isn't possible.

### 7.2 TypeScript types (single source of truth)

```
type Position = 'GK'|'DEF'|'MID'|'FWD'

interface Player {
  id: string
  name: string
  nation: string
  year: number
  overall: number            // 0..99, algorithmically derived, see 7.3
  positions: Position[]       // currently always one entry - the source data is single-position
  attributes: {               // 0..99 each
    pace: number
    shooting: number
    passing: number
    dribbling: number
    defending: number
    physical: number
  }
}

interface Squad {
  id: string                  // 'fra-2022'
  team: string                // 'France'
  year: number                // 2022
  kind: 'nation'|'club'       // always 'nation' until Clubs mode (section 4.2) exists
  players: Player[]
}
```

### 7.3 How ratings are derived

No hand-tuning at this scale - every overall and attribute set is computed from real signal.

For 1970-2022, per player per tournament:
```
overall = clamp(round(
  60
  + min(appearances, 7) * 2       // up to +14 for playing every match
  + min(starts, 7) * 1.5          // up to +10.5 for being a starter
  + min(goals, 8) * 2.5           // up to +20 for a huge scoring tournament
  + (wonMajorAward ? 10 : wonAnyAward ? 5 : 0)
  + deterministicJitter(-3..3)
), 50, 99)
```

For 2026, per player (career-wide caps/goals plus current market value as a quality proxy):
```
overall = clamp(round(
  58 + marketValueComponent(0..26) + min(caps, 100) * 0.09 + min(goals, 60) * 0.12 + deterministicJitter(-3..3)
), 50, 99)
```

The jitter is a hash of the player's id, not `Math.random()` - reruns of the generation script
always produce identical output, so the dataset is reproducible.

Attributes (pace, shooting, passing, dribbling, defending, physical) come from a per-position
archetype offset from `overall` (a forward skews toward shooting and pace, a defender toward
defending and physical), plus a small deterministic per-attribute jitter so players aren't
carbon copies of their position's template.

Known, accepted limitation: a rating reflects how much a player actually did **at that specific
tournament** (or, for 2026, their current profile), not lifetime reputation. A legend who got
injured before playing a match - Karim Benzema at the 2022 World Cup, for example - rates low on
that specific card. This is honest given what the data can tell us, not a bug.

### 7.4 Scale and regenerating the data

413 squads, ~9,500 players, spanning 1970-2026. `src/data/squads.json` (~2MB, lazy-loaded via
dynamic import so it doesn't bloat the app's main bundle) is the committed, derived artifact.
The raw source CSVs are not committed (`scripts/raw-data/`, gitignored - large and regenerable).

To regenerate from scratch:
```
npm run data:fetch      # downloads the raw CSVs from both sources
npm run data:generate   # transforms them into src/data/squads.json
```

Every generated squad is checked against the 4-3-3's position requirements (canFillFormation,
section 5.3) before being included; a squad that can't field a full legal XI is dropped rather
than shipped broken. 3 squads were dropped out of 416 candidates in the current dataset.

---

## 8. Tech stack and architecture

All free, web-first, with a clean upgrade path to online multiplayer.

- Language: TypeScript
- Framework: React 19 with Vite
- Styling: Tailwind CSS v4 (CSS-first `@theme` config, no tailwind.config.js)
- State: Zustand (lightweight, minimal boilerplate)
- Animation: Motion (the current name for what was Framer Motion) for the spin flicker and reveal
- Rating engine: a standalone pure TypeScript module with no UI or framework dependencies, so
  it is fully unit testable and reusable across every mode
- Data: a static, generated JSON file (`src/data/squads.json`, ~2MB), lazy-loaded via dynamic
  import so it's a separate bundle chunk from app code. See section 7.4 for the generation
  pipeline (`scripts/generate-squads.mjs`, `scripts/fetch-raw-data.mjs`, `csv-parse` as a
  dev-only dependency - none of this ships to the client).
- Testing: Vitest for the engine and data validation
- Persistence (single player): localStorage for best score and history, capped at 50 entries,
  read/write wrapped so a full quota or private-browsing block never crashes gameplay
- Hosting: GitHub Pages via GitHub Actions (builds, tests, and deploys on every push to main)
- Online multiplayer (later): Supabase free tier for realtime rooms and light persistence

Project structure:

```
src/
  engine/        rating, quality, fit, chemistry, balance, explain, positions,
                  formations, team, math, tests
  data/          squads.json (generated), loader, validation
  game/          game state (zustand), localStorage persistence
  ui/            screens and components (pitch, spin/pick sheet, results, history)
  types/         shared TypeScript types
scripts/
  fetch-raw-data.mjs     downloads the raw CSVs (gitignored output)
  generate-squads.mjs    transforms them into src/data/squads.json
```

The engine folder has zero imports from ui or game, keeping the algorithm isolated and testable.

---

## 9. UI and UX

Design principles: clean, uncluttered, fast, and mobile friendly since friends will play on
phones. It should read as a polished, finished game, not a prototype.

Key screens (current, as built):
- Build (the pitch): a single always-visible 4-3-3 pitch with 11 tappable slots, a fill counter,
  a BEST badge (once you have history), a live provisional rating that updates after every pick,
  and a SPIN button. There's no separate home/mode-picker screen yet - World Cup mode with a
  single formation is the entire game so far.
- Spin and pick sheet: opened by the SPIN button, not tied to any particular slot. Plays a brief
  slot-machine flicker through squad names, lands on one real Team-Year, and shows that squad's
  roster filtered to players who have at least one open slot somewhere in the lineup. Pick one,
  or spin again for a different squad.
- Placement mode: after picking a player, the sheet closes and the pitch itself becomes the
  picker - every open slot that player is eligible for lights up, everything else dims and goes
  inert, and tapping a lit slot places them there. A banner above the pitch names who you're
  placing and offers a cancel. Tapping an already-filled slot (outside placement mode) clears it
  directly - no confirmation, since refilling is one tap away.
- Results: opens automatically the moment the 11th slot is filled. Shows the overall rating, a
  NEW BEST badge when it beats your prior best, the four-component breakdown (Quality, Fit,
  Chemistry, Balance), and the generated summary. "Play Again" resets the pitch; "History" jumps
  straight to the history panel. Once the XI is complete, a "View Results" button on the build
  screen reopens it on demand.
- History: every completed XI, most recent first, with its date, rating, a BEST tag on whichever
  one was the best at the time, and a one-line summary. Persisted in localStorage, so it survives
  reloads. Opened from the header at any time, or from the Results panel.

Planned, not yet built:
- A ranked leaderboard and 1v1 head-to-head option for multiplayer (Phase 5+).

Interaction choice: tap-to-assign as the primary interaction because it works great on phones.
Drag-and-drop can be added later as a nice-to-have on desktop.

---

## 10. Multiplayer plan

Built in stages so the game is fully playable with friends well before online exists. Because
the core loop is already "tap a slot, spin, pick" per player turn, multiplayer doesn't need a
separate mode - it's the same mechanic with players taking turns.

1. Solo (Phase 4): one player chasing a best rating.
2. Hotseat (Phase 5): 2 to 8 players on one device, taking turns spinning and picking in a
   snake order (1, 2, 3, then 3, 2, 1) until everyone's XI is full, then ranked results.
   Optional 1v1 head-to-head sim. This already lets you and your friends play in person.
3. Online rooms (Phase 8): one player creates a room and gets a short code, friends join by
   code, turn order and spins sync in realtime. Built on Supabase free tier with anonymous or
   lightweight auth. This is where "add your friends somehow" is fully realized.

---

## 11. Deployment (free)

- Static build from Vite deployed to Vercel or GitHub Pages, free.
- Works on any phone or desktop browser, nothing to install.
- Online phase adds a Supabase project on its free tier (Postgres, realtime, auth) with no cost
  at the scale of a friend group.
- No paid services anywhere in the plan.

---

## 12. Phased roadmap

Each task states how to verify it is done. We commit after each meaningful task or at least at
the end of each phase, per your request for commits throughout development.

### Phase 0 - Foundation (done)
- Scaffold Vite + React + TypeScript + Tailwind. Verify: dev server runs and shows a placeholder.
- Set up Zustand, Vitest, and the folder structure. Verify: a sample test passes.
- Deploy the empty skeleton to GitHub Pages via GitHub Actions. Verify: a live public URL loads.

### Phase 1 - Data and positions (done, later superseded by the redesign below)
- Defined the TypeScript types and a 12-position compatibility matrix (CB/LB/RB/CDM/CM/CAM/LM/
  RM/LW/RW/ST). Hand-curated 10 Team-Year squads as JSON (~180 players).
- This did not scale to "many teams, many years" - see the redesign directly below, which
  replaced both the position system and the squad data with an automated pipeline.

### Phase 2 - Build screen (done, redesigned twice mid-phase)
- First build: one whole spun squad, freely build an XI from it, formation selector (4-3-3 and
  4-4-2). This matched the original PRD but not what actually felt good to build with.
- First redesign: tap an empty slot, spin a random real Team-Year, pick one eligible player from
  its roster for that slot, repeat. Formation reduced to 4-3-3 only. Position system simplified
  to GK/DEF/MID/FWD (section 5.3), which is what unlocked replacing the 10 hand-curated squads
  with a real, automatically generated dataset of 413 squads / ~9,500 players spanning 1970-2026
  (section 7).
- Second redesign, same phase: spin is untargeted, not tied to any slot. Spin, pick any eligible
  player off the full revealed roster, then place them by tapping a highlighted open slot on the
  pitch - this is the mechanic that actually shipped (section 4.1, section 9). Verify: you can
  fill all 11 slots through repeated spin-pick-place, illegal players are never offered, only
  eligible open slots are tappable during placement, and the full dataset passes
  `canFillFormation` for every squad (Vitest, currently 15 passing tests).

### Phase 3 - Rating engine (done)
- Implemented Q, F, C, B and the final blended rating as a pure module (`engine/quality.ts`,
  `fit.ts`, `chemistry.ts`, `balance.ts`, `rating.ts`), each independently unit tested plus
  full-pipeline integration tests in `rating.test.ts`. Verify: all four PRD 5.6 assertions hold
  (balanced beats lopsided, misplaced striker beats natural CB, single-nation beats scattered,
  stripping playmakers trips the creativity gap) - 30 tests, 45 total passing at phase end.
- Implemented the generated explanation (`engine/explain.ts`). Verify: summaries name the real
  weakest area on fixtures (confirmed via `explain.test.ts` and manual spot checks against real
  squad data - see the commit for a France 2022 vs. Honduras 1982 vs. a random scattered-nation
  pull comparison).
- Wired a live provisional rating (updates after every pick, works on partial teams down to 1
  filled slot) and a Results panel with the full breakdown into the UI. Verify: rating shown in
  the UI matches `rateTeam()` output directly, since the UI calls the same function with no
  duplicated logic.
- Weights (Q 0.40, F 0.20, C 0.15, B 0.25) validated by spot-checking real data rather than a
  full tuning pass - see section 14 for the open item to revisit this with more playtesting.

### Phase 4 - Single-player loop (done)
- Spin, build, rate, save best, show history, all persisted locally
  (`game/persistence.ts`, localStorage, capped at 50 entries). A completed XI is scored and
  recorded automatically the moment the 11th slot is filled - no separate "save" step. Verify:
  play a full solo session, confirm the Results panel appears automatically on completion, reload
  the page, and confirm the BEST badge and History panel still show the prior attempt.

### Phase 5 - Hotseat multiplayer
- Local pass-and-play for 2 to 8 players: players take turns spinning and picking in snake order
  (1, 2, 3, then 3, 2, 1) until everyone's XI is full, then a ranked results screen. This folds in
  what was originally planned as a separate Phase 6 "snake draft mode" - the single-player
  mechanic already is a draft, so multiplayer is just turn-taking on top of it, not a new mode.
  Verify: run a 3-player game end to end, confirm turn order is correct, no player can be picked
  by two people, and rankings are correct.
- Head-to-head simulation for 1v1. Verify: two teams produce a believable scoreline consistent
  with their ratings.

### Phase 6 - (merged into Phase 5, see above)

### Phase 7 - Polish and expand
- More formations, more squads, spin and reveal animation polish, sound, mobile pass-and-play
  refinement. Verify: the game looks and feels polished on both phone and desktop.

### Phase 8 - Online multiplayer
- Supabase project, create and join rooms by code, realtime draft sync, enforced turn order.
  Verify: two separate browsers join the same room by code and complete a draft together in
  realtime.

### Phase 9 - Remaining modes
- Soccer Clubs: club Team-Year cards and league/club chemistry weighting. Verify: a full Clubs
  game plays and chemistry reflects club and league links.
- Basketball All-Time: PG-SG-SF-PF-C positions, decade and franchise spin, era-normalized
  stats, projected record, basketball rating variant. Verify: a full All-Time game plays and
  the projected record responds sensibly to roster shape.
- Basketball Current: current rosters and stats, no era normalization. Verify: a full Current
  game plays.

---

## 13. Testing strategy

- The rating engine is covered by Vitest fixtures with asserted orderings, so behavior cannot
  silently regress. This is the most important test surface.
- Data validation runs as a test so a malformed or unfillable squad fails the build.
- Position compatibility is unit tested as the single source of truth for both UI and scoring.
- Manual playtesting after each phase to confirm the game feels right, since fun is not fully
  captured by unit tests.

---

## 14. Open questions and future ideas

- Rating weights (Q/F/C/B) and the balance-need weights shipped at their PRD starting values,
  validated only by unit test assertions and a handful of manual spot checks (section 12, Phase
  3) - not a real playtesting pass. Worth revisiting once more games get played.
- The rating formula constants in section 7.3 (appearance/goal/award/market-value weights) were
  picked from spot-checking a handful of known players, not a full audit - may need retuning
  once more of the dataset gets played with.
- Whether to add a second formation back once the core loop is proven fun (would need either
  richer position data or a way to fake sub-positions within DEF/MID/FWD without misrepresenting
  players).
- Whether club chemistry ever comes back - would need a real club-history data source, since we
  chose not to fabricate one (section 7.1).
- Later additions once the core is fun: accounts and persistent stats, global leaderboards,
  more sports, cosmetic team themes.

---

## 15. Glossary

- OVR: a player's overall rating, 0 to 99, algorithmically derived (section 7.3).
- Team-Year card: a real team from a specific year, revealed by a spin.
- Spin: reveals a random Team-Year, pick an eligible player from it, then place them on the pitch.
- XI: a full built soccer lineup of eleven players.
- Snake order: turn order in multiplayer, 1-2-3-3-2-1, so no one always picks last.
- Chemistry: bonus from players sharing a nation (section 5.2).
- Balance: how well a team covers every key job without gaps or redundancy.
- Live rating: the provisional 0-100 rating shown while building, before the XI is complete.
- Results: the panel shown once the XI is complete - final rating, breakdown, and summary.
- History: every completed XI, persisted locally, most recent first (section 12, Phase 4).
