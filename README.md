# RING CHASERS

An NBA drafting game for me and my friends. Draft real player seasons from
1980 through 2026, think '96 Jordan or '16 Curry or '26 Wemby, build an 8 man
squad, then the sim engine plays it all out: games, a season, playoffs, and a
champion with a gold ring.

Play it here: https://divyambanga.github.io/tuffcomp/

## Two ways to draft

1. Tiered Spins, the classic. Everyone climbs the same rarity ladder of card
   spins. Round 1 guarantees a star, the last round is a jackpot wildcard.
   2 rerolls each.
2. Theme Draft, the fair fight. One theme deals at the start and carries the
   whole draft: Lakers only, 40% from deep, the '90s only, white guys only.
   Everyone drafts back and forth on that same theme, snake order, one real
   person per league. In hard mode you type your pick from memory with an
   autocomplete dropdown that helps spelling but never says who fits, typo
   forgiveness, and 3 strikes before the board bails you out. Easy mode shows
   a grid. Your pick lands as that player's best season fitting the theme.

## Then the season

Set your five starters and bench. The engine rates quality, fit, chemistry
from real life teammates, and balance. An AI scout (Claude Sonnet, one call
per season) judges every roster for star power, fit, shooting and defense,
writes a scouting blurb, and nudges the sim within hard caps so it can never
break fairness. The scout runs through a tiny Cloudflare Worker that keeps
the API key server side, so nobody playing ever needs a key and the key
never ships with the site. No Worker set up? You can still paste a personal
key that stays in your own browser.

Sim game by game or all at once. A game log keeps every box score one tap
away, and stars have real form nights: an elite scorer can catch fire and go
for 50, rarely, like real life.

## Playing with friends

Create a room and share the 4 letter code. Friends join from their own
devices, no accounts, no server, it runs peer to peer. Or play solo against
CPU drafters who call names like you do.

## The look

Monochrome drafting sheet: hairline rules that draw themselves in, system
type, mono ledgers. The player photos are the color. Gold shows up only for
GOAT cards, clinched titles, and the ring.

## The real data

11,408 real player seasons, 2,054 players, 40 franchises, real stats and
real NBA headshots, era relative ratings so 1987 competes fairly with 2026.
Season stats come from
[sumitrodatta/bball-reference-datasets](https://github.com/sumitrodatta/bball-reference-datasets),
data derived from Basketball Reference. Headshot photo ids come from
[swar/nba_api](https://github.com/swar/nba_api). Photos are served from the
NBA's public CDN.

To regenerate the card pool:

```
npm run data:fetch
npm run data:generate
```

## Tech

- React, TypeScript, Vite, Tailwind, zustand
- Pure TypeScript engines for evaluation and simulation, fully seeded and deterministic
- PeerJS WebRTC for online rooms, no backend anywhere
- Claude Sonnet judge behind a one file Cloudflare Worker (worker/), key held
  as a Worker secret, never in the bundle
- 95 tests with Vitest, deployed free on GitHub Pages

## Status

v2 is live: both draft modes, solo and online, AI scout, game ledger, the
drafting sheet look. See PRD.md for the full design.
