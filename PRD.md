# tuffcomp - Product Requirements Document

A drafting game where you and your friends build sports teams from real players, then an
analysis engine rates every team on quality, positional fit, chemistry, and balance to
decide who built the best squad.

Status: planning complete, ready to build.
Owner: Divyam.
Last updated: 2026-07-22.

---

## 1. Vision

Load into a lobby, get a random real team and year (like France 2022), and build the best
possible starting lineup from that squad by placing real players onto positions they can
actually play. When everyone is done, a scoring engine analyzes each team on more than raw
talent. It looks at how well players fit their positions, how much chemistry the squad has,
and whether the team is balanced or is missing a key job. The best-built team wins, fairly
and transparently.

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
  team's real players. This is the pool you draft from.
- Player: a real athlete with an overall rating, a set of playable positions, a small set of
  attributes, and metadata (nation, club, league, year).
- Formation: the shape of the lineup and its position slots (4-3-3, 4-4-2 for soccer).
- Slot: a single position on the pitch that holds one player (for example the left back slot).
- Lineup / XI: the full set of filled slots that make up a built team.
- Rating: the engine's 0 to 100 score for a built team, with a visible breakdown.
- Position compatibility: how well a player can play a given slot, from natural to illegal.
- Chemistry: bonus from links between players (shared nation, league, club).
- Balance: how well the team covers every key job without gaps or redundancy.

---

## 4. Game modes

### 4.1 Soccer World Cup (MVP, build first)

Flow:
1. Spin. The game reveals a random Team-Year card (for example France 2022).
2. Build. You place that squad's real players into a formation. The UI only offers players
   who can legally play the selected slot, so you can never put an attacker in defense.
3. Rate. The engine scores your XI and shows the breakdown.

Two sub-modes for playing with friends:

- Same-pool (build first): everyone gets the same spun squad and independently builds their
  best XI from the same players. Because everyone has identical resources, the winner is
  purely whoever built the smartest lineup. This is the fairest and simplest to build, so it
  is the MVP.
- Snake draft (build second): players are exclusive. To make an XI-sized draft work, the game
  spins several Team-Year cards into one combined pool. Draft order snakes (1, 2, 3, then 3,
  2, 1). Mixing nations gives you better raw players but lowers chemistry, so there is a real
  strategic tradeoff. This is where chemistry becomes a core lever.

Single-player loop (before any friends are involved): spin, build your best XI, get a rating,
and try to beat your personal best. This is the 82-0 style chase-the-perfect-team loop and is
genuinely fun solo.

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
- the slot's position (for example LB)
- the player placed there (overall, attributes, playable positions, nation, club, league, year)
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
   matrix (section 5.3). Natural = 1.0, secondary = 0.75, stretch = 0.5, illegal = 0. Illegal
   placements are blocked in the UI, so in practice the floor is the stretch value.
2. Attribute alignment. Does the player's attribute profile suit the slot? Each slot has a
   small profile of which attributes matter (a full back wants pace and defending, a striker
   wants shooting and pace). A fast defender fits a full back slot better than a slow one.

```
slotFit = 0.6 * positionCompatibility + 0.4 * attributeAlignment
F = average(slotFit over all slots) * 100
```

F rewards putting players where they belong and punishes forcing players out of role.

#### Component C - Chemistry (links between players)

FIFA-style link chemistry, capped so it cannot dominate. Each player earns chemistry points
from squad-mates who share their nation, league, or club, plus a spine cohesion bonus when
adjacent players in the formation share links.

```
for each player: chemPoints = clamp( f(sameNation, sameLeague, sameClub) , 0, maxPerPlayer )
C = ( sum of chemPoints / (maxPerPlayer * 11) ) * 100
plus a small spine cohesion bonus for connected GK-CB-CM-ST links
```

In single-squad World Cup mode everyone is the same nationality, so chemistry is naturally
high and roughly equal, which keeps that mode fair. In snake draft and Clubs modes, chemistry
becomes the key tradeoff against raw quality.

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

Positions are grouped and given pairwise compatibility. This drives both the UI (illegal = the
player is not offered for that slot) and the Fit score. Values are natural 1.0, secondary 0.75,
stretch 0.5, illegal 0.

Groups: Goalkeeper (GK), Defenders (CB, LB, RB), Midfielders (CDM, CM, CAM, LM, RM),
Forwards (LW, RW, ST).

Rules of thumb encoded in the matrix:
- GK only plays GK.
- A CB can play FB as secondary and CDM as a stretch, but never a forward slot.
- A winger can play the opposite wing naturally, CAM as secondary, ST as a stretch, but never
  a defensive slot.
- A striker can play winger as secondary and CAM as a stretch, but never defense or GK.

The exact matrix lives in code as a single source of truth (`positions.ts`) and is unit tested.

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

### 7.1 Data comes from real, curated sources

You chose real data, curated to start. We hand-build a limited but iconic set of squads with
accurate players, positions, and ratings, then expand over time.

Note on ratings: official game overalls are proprietary. We store our own overall value per
player, informed by public knowledge and stats, so the dataset is ours and free to use. The
numbers are chosen to feel accurate without copying any single source.

### 7.2 TypeScript types (single source of truth)

```
type Position = 'GK'|'CB'|'LB'|'RB'|'CDM'|'CM'|'CAM'|'LM'|'RM'|'LW'|'RW'|'ST'

interface Player {
  id: string
  name: string
  nation: string
  club: string
  league: string
  year: number
  overall: number            // 0..99
  positions: Position[]       // first entry is primary
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
  id: string                  // 'france-2022'
  team: string                // 'France'
  year: number                // 2022
  kind: 'nation'|'club'
  players: Player[]           // ~18-26 players
}
```

### 7.3 MVP squad set (curated, roughly 8 to 12 to start)

Chosen for iconic value and positional depth so each can fill a full XI:
France 2022, Brazil 2002, Argentina 2022, Spain 2010, Brazil 1970, Germany 2014,
Italy 2006, Netherlands 2010, England 2018, Portugal 2016. Final list confirmed during Phase 1.

Each squad must contain enough players per position group to fill the supported formations.
A validation script checks this so no squad can produce an unfillable lineup.

---

## 8. Tech stack and architecture

All free, web-first, with a clean upgrade path to online multiplayer.

- Language: TypeScript
- Framework: React 18 with Vite
- Styling: Tailwind CSS, with a small set of custom components for the pitch and cards
- State: Zustand (lightweight, minimal boilerplate)
- Animation: Framer Motion for the spin reveal and transitions
- Rating engine: a standalone pure TypeScript module with no UI or framework dependencies, so
  it is fully unit testable and reusable across every mode
- Data: static JSON in the repo, validated against the TypeScript types
- Testing: Vitest for the engine and data validation
- Persistence (single player): localStorage for best scores and history
- Hosting: Vercel or GitHub Pages, both free for static Vite builds
- Online multiplayer (later): Supabase free tier for realtime rooms and light persistence

Suggested project structure:

```
src/
  engine/        rating, chemistry, balance, positions, simulation, tests
  data/          squads json, loaders, validation
  game/          game state (zustand), modes, draft logic
  ui/            screens and components (spin, pitch, player picker, results)
  types/         shared TypeScript types
```

The engine folder has zero imports from ui or game, keeping the algorithm isolated and testable.

---

## 9. UI and UX

Design principles: clean, uncluttered, fast, and mobile friendly since friends will play on
phones. It should read as a polished, finished game, not a prototype.

Key screens:
- Home: pick sport and mode, start solo or start a local (hotseat) game.
- Spin reveal: an animated reveal of the Team-Year card with crest, colors, and year.
- Build (the pitch): the formation drawn on a pitch, tappable slots, a bottom sheet player
  picker that only shows legally eligible players for the selected slot, each with overall,
  positions, and key attributes. A live provisional rating updates as you build.
- Results: final rating with the four-component breakdown, the generated summary, and, in
  multiplayer, a ranked leaderboard of all players' teams with a 1v1 head-to-head option.
- Best score / history (solo): your personal best and past attempts.

Interaction choice: tap-to-assign as the primary interaction because it works great on phones.
Drag-and-drop can be added later as a nice-to-have on desktop.

---

## 10. Multiplayer plan

Built in stages so the game is fully playable with friends well before online exists.

1. Solo (Phase 4): one player chasing a best rating.
2. Hotseat (Phase 5): 2 to 8 players on one device, same-pool or snake draft, results and
   rankings, optional 1v1 head-to-head sim. This already lets you and your friends play in
   person.
3. Online rooms (Phase 8): one player creates a room and gets a short code, friends join by
   code, draft state syncs in realtime, turn order is enforced. Built on Supabase free tier
   with anonymous or lightweight auth. This is where "add your friends somehow" is fully
   realized.

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

### Phase 0 - Foundation
- Scaffold Vite + React + TypeScript + Tailwind. Verify: dev server runs and shows a placeholder.
- Set up Zustand, Vitest, and the folder structure. Verify: a sample test passes.
- Deploy the empty skeleton to Vercel or Pages. Verify: a live public URL loads.

### Phase 1 - Data and positions
- Define the TypeScript types and the position compatibility matrix. Verify: matrix unit tests
  pass (GK only plays GK, striker cannot play CB, and so on).
- Curate the first 8 to 12 Team-Year squads as JSON. Verify: a validation script confirms every
  squad can fill every supported formation.

### Phase 2 - Build screen (single squad)
- Formation model and selector (start with 4-3-3 and 4-4-2). Verify: switching formations
  redraws slots correctly.
- Spin reveal screen. Verify: it picks a random squad and animates the reveal.
- Pitch and player picker. Verify: you can build a full legal XI, and illegal players are never
  offered for a slot.

### Phase 3 - Rating engine
- Implement Q, F, C, B and the final blended rating as a pure module. Verify: unit tests for
  each component pass on fixture teams.
- Implement the generated explanation. Verify: summaries name the real weakest area on fixtures.
- Wire the live provisional rating and the results breakdown into the UI. Verify: rating updates
  as you build and matches the engine output.
- Tune weights against curated squads. Verify: the asserted orderings in section 5.6 all hold.

### Phase 4 - Single-player loop
- Spin, build, rate, save best, show history, all persisted locally. Verify: play a full solo
  session and confirm the best score persists across reloads.

### Phase 5 - Hotseat multiplayer
- Local pass-and-play for 2 to 8 players, same-pool mode, with a ranked results screen. Verify:
  run a 3-player game end to end and confirm rankings are correct.
- Head-to-head simulation for 1v1. Verify: two teams produce a believable scoreline consistent
  with their ratings.

### Phase 6 - Snake draft mode
- Multi-squad combined pool, exclusive picks, snake order. Verify: order is 1-2-3-3-2-1, no
  player is picked twice, and mixing nations visibly lowers chemistry.

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

- Exact starting weights and the balance-need list will be tuned during Phase 3 playtesting.
- Whether snake draft should always mix multiple nations or sometimes draft within one squad
  (decided at Phase 6 based on how the MVP feels).
- Later additions once the core is fun: accounts and persistent stats, global leaderboards,
  more formations, more sports, cosmetic team themes.

---

## 15. Glossary

- OVR: a player's overall rating, 0 to 99.
- Team-Year card: a real team from a specific year, the pool you draft from.
- XI: a full built soccer lineup of eleven players.
- Same-pool: everyone builds from the identical spun squad.
- Snake draft: exclusive picks in a 1-2-3-3-2-1 order across a combined pool.
- Chemistry: bonus from shared nation, league, or club links.
- Balance: how well a team covers every key job without gaps or redundancy.
