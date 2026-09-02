# RING CHASERS - Product Requirements Document

An arcade NBA drafting game for a friend group. One theme deals, everyone
drafts real player-seasons from ALL of NBA history (1947-2026) by typing
names from memory, then a simulation engine plays out games, a season, and
the playoffs - scoring not just star power but how well a team actually
fits together.

Status: v4 shipped 2026-08-28. The pool now reaches back to 1947 (BAA
included) with 2K-style ratings and a pinned 99 club. 60+ themes across
seven kinds with a picker (RANDOM always an option; host picks in friends
setup). Strikes and the easy grid are DELETED: typing is the game,
unlimited guesses, every whiff lands in a public ledger. Position-locked
themes (7-FOOTERS, RIM PROTECTORS) play POSITIONLESS - anyone anywhere,
placed by skills. Friends rooms broadcast the on-the-clock drafter's live
keystrokes. The scout runs Sonnet at effort high with theme context,
scouts the chase's full 15-team slate, and can swing up to ~5 points a
game within its mean-centered caps.
Owner: Divyam. Repo: tuffcomp (game branded RING CHASERS).
Live: https://divyambanga.github.io/tuffcomp/
Last updated: 2026-08-28.

NOTE: Sections below describe earlier mechanics where they conflict with
the v4 status line above; the code and tests are the source of truth.

This replaces the earlier soccer drafting game that lived in this repo (fully recoverable in
git history before commit "Start from scratch").

---

## 1. Vision

Load in, spin, and a real player-season card drops - '96 Jordan, '16 Curry, '26 Wemby - with
the real headshot and real stats. Everyone drafts through the same fair ladder of spins, so
every team lands a superstar, solid starters, and a wildcard jackpot chance. Set your five
starters and bench, admire your team power breakdown, then sim: game by game with quarter
scores and box lines, a full season with standings, playoff series with win pips, confetti
and a gold ring for the champion. Fun first, fair always, real NBA history throughout.

Design references: the 82-0 web game (stats-driven outcomes, roster shape matters),
Roblox card drafters like Soccer Card Draft (rarity rolling, chemistry, juicy card
reveals), and for the v2 look, divyambanga.github.io (the drafting-sheet system:
hairline grid, system type, one accent).

---

## 2. Core decisions (user-confirmed)

- Player pool: ALL of NBA history, 1947-2026 (BAA included), cards are
  player-seasons, era-relative 2K-style ratings (user-confirmed 2026-08-28).
- Draft: Theme Draft only, typed picks only, unlimited guesses, no strikes,
  no easy board (user-confirmed 2026-08-28; strikes and grid deleted).
- Themes: chosen or random - solo picker screen, host picks for rooms;
  position-locked themes play positionless with skill-based placement
  (user-confirmed: "anyone plays anywhere... and should fit the category").
- Competition: BOTH formats - full Season + Playoffs, or Straight Playoffs (best-of-7s);
  solo is the 82-0 chase.
- Multiplayer: online rooms from day one (no accounts, no server - see section 8), plus
  CPU drafters, and CPU filler franchises pad any league. Live keystrokes of
  the drafter on the clock broadcast to the room.
- Teams: 5 starters (PG/SG/SF/PF/C) + 3 bench.
- Look (v2): monochrome drafting sheet matching divyambanga.github.io - warm
  near-black paper (#121211), off-white ink, hairline rules that draw in hot and
  cool, system type with mono annotations, player photos as the one full-color
  element, gold reserved for GOAT cards, clinched titles, and the ring.
- AI judge: Claude Sonnet scout (one call per season) behind a key-holding
  Cloudflare Worker so everyone gets it keyless; blended into the sim within
  hard caps. Personal-key fallback stays browser-local.
- Name: RING CHASERS (repo stays tuffcomp; branding only).

---

## 3. The card pool (real data)

14,352 real player-seasons across 2,558 players and 70 franchises, every NBA
and BAA season 1947-2026 (defunct MNL, PHW, SYR, ROC... included), generated
by `scripts/generate-players.mjs` from sources fetched by
`scripts/fetch-raw-data.mjs`:

- Basketball Reference-derived season stats:
  github.com/sumitrodatta/bball-reference-datasets (GitHub home of the Kaggle
  "NBA Stats 1947-present" dataset). Per-game + advanced stats through the
  2026 season, plus career info (height/weight/HOF), award votes, All-Star
  selections, and full draft pick history.
- NBA person ids for official headshots: the static player index in github.com/swar/nba_api.
  Cards link to cdn.nba.com headshot PNGs (96% matched; ambiguous duplicate names get an
  initials medallion instead of risking the wrong face).

Each card: id (bbref id + season), name, season, franchise memberships that year (traded
players resolved via the 2TM row convention), position + secondary position, age, per-game
stat line, usage rate, and six derived attributes - scoring, outside shooting, playmaking,
rebounding, defense, rim protection. A sidecar `themeData.json` carries
heights, weights, first seasons, award winners (MVP/DPOY/6MOY/ROY), All-Star
seasons, #1 overall picks, undrafted players, championship rings (hand-coded
champions table 1947-2026, through the '26 Knicks), one-team loyalists, and
journeymen for the theme registry.

Ratings methodology (fully deterministic, zero RNG, reruns byte-identical):
- Qualification: at least half the season's max games played and 16+ minutes
  per game (minutes weren't recorded before 1952; games carry those years).
- Era-honest fallbacks where stats didn't exist yet: pre-1974 defense from
  defensive win shares (PER is blind to Bill Russell), pre-1974 rim
  protection from height + boards, pre-1978 usage estimated from shot
  volume, pre-1980 shooting touch from FT% (capped below real snipers).
  Early G/F/C positions split era-relatively by assist/rebound percentiles.
- Overall, 2K-style: percentile of a BPM/PER/WS-48 composite within that
  season (percentiles are per-season, so eras compete fairly) through a
  curve landing fringe rotation at 68, the median near 75, ~5% of a season
  at 90+, the season's best at 95; bonuses MVP +2, MVP votes +1, All-Star
  +1 push MVP-caliber years to 96-98 (capped); a pinned ten-card 99 club
  holds the all-time peaks ('91/'96 MJ, '13 LeBron, '16 Curry, '62/'67
  Wilt, '00 Shaq, '86 Bird, '87 Magic, '72 Kareem).
- Attributes: within-season percentiles of the relevant stats (3-point accuracy only ranked
  among real shooters so a 2-for-10 season can't rate elite).
- Tiers on final overall: GOAT 96+, SUPERSTAR 91-95, ALLSTAR 85-90, STARTER 78-84,
  ROTATION below.

players.json (~4.6MB) ships as a lazily-imported chunk; raw CSVs stay out of git.

---

## 4. Drafting

8 snake rounds (1-2-3-3-2-1 order), one pick per round, one real person per
league (no '91 and '96 Jordan coexisting, no person on two teams).

Tiered Spins (classic): every player climbs the same ladder -
- R1: SUPERSTAR spin with a 25% GOAT jackpot
- R2: 30% SUPERSTAR / 70% ALLSTAR, R3: ALLSTAR, R4-R5: STARTER, R6-R7: ROTATION
- R8: WILDCARD - equal odds of ANY tier, GOAT included
Each spin deals 4 cards; take one or reroll (2 rerolls each). Offers bias toward your open
starter needs, and once your open starter slots equal your remaining picks, only
starter-fillers are offered - no team can finish unable to field five.

Theme Draft (the one mode): ONE theme deals at the start and carries the
ENTIRE draft - everyone drafts back and forth on the same question for all
8 rounds. 60+ themes in `src/game/themes.ts` across seven kinds:
- franchise ("LOS ANGELES LAKERS ONLY", 25 storied franchises, with
  lineages: Mikan's MNL counts as Lakers, Wilt's PHW as Warriors, Oscar's
  CIN as Kings; renamed SEA stays its own theme)
- era (pioneers '47-'59, the '60s, '70s, '80s, '90s, 2000s, 2010s, modern)
- stat archetypes (40% from deep, 25+ PPG, lockdown defenders, glass
  cleaners, floor generals, rim protectors, iron men) from real stat lines
- measurables from real height/weight/age (UNDER 25, OLD MAN GAME 35+,
  7-FOOTERS, 6'4" AND UNDER, HEAVYWEIGHTS 250+)
- career paths from real career data (ONE-TEAM LOYALS, JOURNEYMEN 6+,
  RINGLESS, CHAMPS, ROOKIE SEASONS)
- hardware from real award votes and draft history (MVP/DPOY/6MOY/ROY
  winners, ALL-STAR SEASONS, NEVER AN ALL-STAR, #1 PICKS, UNDRAFTED)
- curated lists validated by tests against the pool (HOF from data;
  INTERNATIONAL, WHITE GUYS, BALD SQUAD, LEFTIES, CANADIANS, NBA
  BLOODLINES hand-curated, 500+ names)

The theme is chosen or random: solo, CHASE opens a PICK YOUR POISON screen
(big RANDOM + every playable theme grouped by kind); friends hosts pick a
theme (or RANDOM) in room setup. A theme qualifies for a league when it has
distinct people for every pick plus slack (playerCount x 8 + 8) and 85+ OVR
stars for the league size; thin lists drop out automatically as the league
grows. A theme that can't cover every starter slot with legal positions
(7-FOOTERS has no guards) plays POSITIONLESS: anyone fills any slot,
auto-placement matches skills to roles (best passer runs point, rim gods
anchor the middle), moves are free, and fit scoring goes by role match -
every pick still fits the category and no board ever opens for positions.

Pick input is typing, always:
- Name your pick from memory. An autocomplete dropdown helps with spelling -
  it suggests from ALL players and is never filtered to the theme, so it
  aids typing "Antetokounmpo" without revealing who fits. Fuzzy matching
  forgives typos and shorthand ("steph curry", "jokic", bare "jordan"
  resolves to the famous one).
- Guesses are UNLIMITED. No strikes, no rescue, no easy mode. An off-theme,
  already-taken, or can't-fit call just gets called out and logged in the
  draft's public WHIFF LEDGER (capped at the last 24, survives picks).
- In friends rooms, everyone watches the on-the-clock drafter's live
  keystrokes as ghost text (host-validated, throttled, ephemeral).
A typed player lands as their best season passing the theme. If a positional
theme dries up for a drafter's forced starter needs, a board falls back open
past the theme so nobody softlocks (rare; positionless themes never need it).
CPUs call names like humans and never whiff.

Franchise Spins was removed in v2 (recoverable in git history).

PARTY MODES (v4.2, 2026-09-01, user-confirmed): two friends-room drafts in
`src/game/party.ts`, both 5-man squads under the room's theme (chosen or
random), no filler teams - every seat is a franchise:
- DOLLAR TABLE: the viral $15 challenge. Five seeded price shelves ($5
  elites by in-theme rank down to $1 glue guys, position-covered, sized to
  the room), snake draft, every pick checked for budget AND completability
  (backtracking solver); a stranded drafter gets a cheapest-fit bailout.
- AUCTION: $50 a team. Deterministic smart reveals (weighted toward the
  room's open positions, star power paced in bands), $1 opens, $1 minimum
  raises with jump bids, binding passes (all-passed = instant hammer), max
  bid always reserves $1 per open slot, host-clock GOING ONCE / GOING
  TWICE / SOLD ladder (12s/5s/4s/4s) that resets on every bid, unwanted
  lots walk, and an endgame safety net auto-fills any unfinished five from
  the theme pool so tip-off always happens.
- Bots play both modes (value-priced bidding, feasible best-talent picks).
  Positionless themes work in both. After the draft: the normal preview,
  scout, and season/playoff sim.
- MYSTERY AUCTION (v4.3, 2026-09-01, user-confirmed): the auction engine
  with clues instead of a face (`src/game/clues.ts`). The whole theme pool
  can hit the block as a weighted lottery (bands top 8% / 8-30% / 30-60% /
  ANYONE cycling per lot). A lot opens with 2 clues; every bid reveals one
  more, max 4. Clues are blurred real facts across five families - body &
  age (height band, weight class, age band, rookie year, guard/wing/big),
  colors & era (one jersey color per franchise, the decade), stats
  (PPG/RPG/APG bands, 3P% band incl. pre-line and zero-made, FG%, minutes),
  hardware & draft (MVP/DPOY/6MOY/ROY, All-Star that season / never / other
  years, ring or ringless, undrafted, draft slot band), traits & lists
  (sniper, rim protector, floor general, glass eater, lockdown, bucket
  getter, ball dominant, low usage, lefty, bald, international, Canadian,
  bloodline, one-franchise, journeyman). Names never appear. The
  anti-giveaway rule: every clue prefix ever shown must still fit >= 4
  undealt players spanning >= 15 OVR (checked against the theme pool minus
  dealt/rostered people); families are varied and the opening pair is
  judged together. Bidders can't see the position, so any open slot is
  fair game and a winner with no legal spot plays the best-fitting open
  role. Bots pay the crowd value (mean value of every player the visible
  clues could be). The host redacts guest snapshots (no card id, only the
  revealed clue texts) so nobody can peek; the hammer reveals the player
  on the winner's roster and in the result line - walks are revealed too.
  Mystery clock: 18s to open, then GOING ONCE 8s / GOING TWICE 7s / SOLD
  6s (normal auction 12/5/4/4).
- SKIPS (v4.3, user-confirmed, both auctions): a skip is declining (pass
  or clock) a lot you could have bought while NOBODY bid; losing a war or
  letting a friend buy never counts. Allowance = 2 + open slots, capped at
  5, reset whenever you buy. Out of skips, the next no-bid lot you are
  eligible for is forced onto you at $1 (multiple tapped-out teams: most
  open slots, then least money, then seat order). The safety net that
  fills unfinished teams now hands out a seeded RANDOM fitting player, not
  the best remaining, so stalling is never rewarded.

Placement: natural open starter slot first, else bench (or stretch when starters must fill).
Rearrange freely anytime pre-tipoff via tap-two-slots-to-swap. Position legality: natural at
your position(s), neighbor positions at a stretch discount, two apart illegal (no centers at
point guard).

CPU: live CPU drafters pick like humans (best card, prefers real needs, avoids ball-hog
stacks); CPU filler franchises (NEON SHARKS, VOID VIPERS...) draft from leftovers to pad the
league to 4/6/8.

---

## 5. The evaluation engine

Pure TS (`src/engine/`), zero UI imports, every score 0-100 with a plain-language summary.

- Quality: star-weighted overall talent (blendedTalent, OVR units), starters
  weighted over bench, superstar premium.
- Fit: slot legality/compatibility across the roster (role-match in
  positionless drafts).
- Chemistry: real-life teammates (same franchise within a 2-season window - '96 Jordan +
  '96 Pippen actually played together) plus era cohesion. No fabricated links.
- Balance: six needs (scoring punch, outside shooting, playmaking, rebounding, perimeter
  defense, rim protection), gap penalties, and a MILD "there's only one ball"
  usage-overload tax (threshold 120, capped - talent rules by design,
  user-confirmed 2026-08-29).
- Team power: 60% quality + 10% fit + 10% chemistry + 20% balance.

---

## 6. The simulation engine

Pure TS on a seeded PRNG - a seed fully determines every game, so results replay exactly.

- Team profiles: star-weighted roster TALENT (OVR) feeds both offense and
  defense - the best players genuinely decide games - shaped by attributes
  (scoring/shooting/playmaking vs defense/rim/rebounding) and mildly nudged
  by chemistry, balance, and capped usage overload, so a team that fits
  punches a little above its rating. When the AI judge ran, its capped
  adjustments (section 6b) shift these a few points.
- Games: quarter-by-quarter scores around a league baseline (~111) with home advantage and
  overtime, full box scores apportioned so lines sum exactly to team totals, star-of-game.
- Form nights (v2): elite scorers catch fire on ~7% of nights (role players ~2%) with a
  1.5-1.95x scoring-share multiplier - a superstar can realistically go for 45-55 - plus
  occasional cold nights. Boxes still sum exactly; a 400-game distribution test pins the
  tails (max >= 45, max <= 72, heaters rare, means stable).
- Series: best-of-7, 2-2-1-1-1 home court.
- Seasons: double round-robin, standings with streaks and point-diff tiebreaks, season MVP.
- Playoffs: bracket seeded by standings (season format) or team power (straight playoffs),
  8/4/2 bracket by league size, game-by-game stepping, Finals MVP, champion.
- Calibration (user-confirmed targets, pinned by calibration.test.ts): the
  all-time five beats a 90-average team ~92% of nights by double digits,
  rolls an average team ~98%, and sweeps best-of-7s; a GREAT chase draft
  (avg ~96) wins ~97.5% per game so 82-0 lands roughly 1 run in 10; the
  chase slate drafts to explicit 77-86 OVR targets.

---

## 6b. The AI judge (v4 scout)

Claude Sonnet scout (`src/llm/judge.ts` + `worker/judge-proxy.js`), two paths:

- Proxy (the normal setup): a one-file Cloudflare Worker holds the Anthropic key
  as a server-side secret; the site ships only the Worker's public URL
  (VITE_JUDGE_PROXY_URL repo variable). The Worker pins model, max_tokens,
  system prompt, and output schema, and rejects non-judge-shaped requests, so
  the endpoint is only usable as a basketball scout. Everyone gets the scout,
  nobody needs a key. Recommended: set a monthly spend limit in the Anthropic
  console since the endpoint is public.
- Personal key fallback: pasted into an in-app field, stored in that browser's
  localStorage only - never in git, the bundle, logs, or any peer message.
- One call per season at tip-off (host or solo only), `claude-sonnet-5`
  (effort HIGH, 8000 max tokens for adaptive thinking headroom) via the
  official SDK (lazy-imported, browser access header) or raw fetch in the
  Worker. Structured outputs with a strict JSON schema, so the response cannot
  be malformed. The chase is scouted too: all 15 teams in one call (the
  Worker accepts up to 16 teams / 26k chars; verified live end to end).
- The prompt sends every roster's compact stat lines plus a fit profile per
  team (five-man usage total, 70+ shooter count, real-life duos, era span),
  the league's theme and positionless flag, and era guidance for pre-1980
  cards. It asks for 0-100 scores relative to this league only - offense,
  defense, star power, cohesion - plus a one-line scouting blurb per team
  (shown on the preview screen).
- Blending is fair by construction: scores are centered on the league mean and hard
  capped (max ~9 points of sim offense/defense each way, ~5 points per game), so the
  deterministic engine still rules and a hallucination cannot wreck a season. Any
  failure (no key, bad response, network) silently falls back to the pure engine.
- Online: only the host judges; the finished judgment broadcasts in snapshots and
  guests see the same scouting report.

## 7. Match flow

One serializable reducer (`src/game/match.ts`): draft -> preview (rearrange lineups, see
power breakdowns and the scout's take) -> optional judge call -> season or straight
playoffs -> game-by-game sims (SIM NEXT, or auto-sim the rest with a ticker cadence) with
a tap-to-browse game ledger -> champion + gold-ring seal + pen-stroke confetti -> trophy
case (localStorage, tracks your rings).

---

## 8. Online rooms (no backend)

WebRTC peer-to-peer via PeerJS's free public broker - no accounts, no server, no cost, works
from GitHub Pages (HTTPS).

- Host creates a room -> 4-letter code (unambiguous alphabet). Friends join by code.
- Host is the single authority: every action (including the host's own) passes one
  validation gate - you can only draft on your turn as yourself; only the host begins
  phases and sims. Guests send intents, receive full snapshots (small, tens of KB).
- Seats survive disconnects: identity is a persistent local playerId, rejoining by code
  reclaims your seat mid-game. New joins after tip-off are rejected.
- If the host closes their tab the room ends (documented limitation; no host migration v1).
- PeerJS sits behind a one-function factory; the entire room logic is unit tested over an
  in-memory fake wire that JSON-round-trips every message.

Solo mode never touches networking.

---

## 9. Tech

- React 19 + Vite + TypeScript + Tailwind v4 (CSS-first theme), zustand, motion (installed
  for future flourishes; current animations are CSS keyframes), peerjs,
  @anthropic-ai/sdk (lazy-imported, judge only).
- Look: design tokens and hairline-grid system in `src/index.css`, lifted from
  divyambanga.github.io (draw-in rules, cooling lines, plate labels, ledgers,
  ring seal, pen-stroke confetti). No web fonts - system sans + ui-monospace.
- Testing: Vitest - 110 tests: data validation (2K-shape ratings, theme
  data, old-era legends), engine, sim (incl. heater distribution), season,
  draft (typed flow, unlimited whiffs + ledger, chosen themes, positionless
  placement, fuzzy matching, autocomplete, 500+ curated names vs the pool),
  match (incl. a full positionless chase), judge (prompt/parse/blend/caps,
  no network), netcode incl. live-typing relay over the fake wire, and a
  store-level smoke test that plays a full solo chase to the end.
- Deploy: GitHub Pages via Actions (npm ci, test, build on every push). All free.
- Structure:
  - scripts/ - data fetch + generate (dev-only, csv-parse)
  - worker/ - the judge proxy Worker (deployed separately via wrangler)
  - src/data/ - players.json + franchises.json (generated), loader, validation tests
  - src/engine/ - lineup, evaluate, prng, sim, season (+ tests)
  - src/game/ - draft, themes, match, store, trophies (+ tests)
  - src/llm/ - judge: key storage, prompt, parse, blend (+ tests)
  - src/net/ - protocol, room, identity (+ tests)
  - src/ui/ - components, menu/draft/preview/competition screens

---

## 10. Verification standard

Every layer is tested at the level below the UI, the store smoke test drives the real
user flow end to end, CI runs the suite on every push, and the built site is spot-checked
live after deploys. Browser click-through happens when the Chrome extension is available;
otherwise disclosed.

---

## 11. Known limitations and future ideas

- PeerJS public broker is best-effort; if it proves flaky for the friend group, swap the
  peer factory for a Supabase-backed transport without touching game logic.
- No host migration; host tab closing ends the room.
- Ratings favor tournament-that-season production; a legend's injury year rates low. Honest,
  not a bug.
- Rating/sim constants tuned by spot checks and statistical tests, not long playtesting.
- Future: bench rotations by minutes sliders, trade phase between season and playoffs,
  sound effects and buzzer audio, richer play-by-play lines, more award types, host
  migration, spectator seats.
