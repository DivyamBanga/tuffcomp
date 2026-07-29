# RING CHASERS

An arcade NBA drafting game for me and my friends. Spin for real player season cards from
1980 through 2026, think '96 Jordan or '16 Curry or '26 Wemby, draft an 8 man squad, set
your lineup, then the sim engine plays it all out: games, a season, playoffs, and a champion
with confetti and a gold ring.

Play it here: https://divyambanga.github.io/tuffcomp/

## How it plays

1. Everyone drafts through the same ladder of spins. Round 1 guarantees a superstar, the
   last round is a wildcard where anyone can drop. Or play Franchise mode and spin real
   eras like the 90s Bulls. 2 rerolls each, snake order, no duplicate players.
2. Set your five starters and bench. The engine rates your team on quality, fit, chemistry
   from real life teammates, and balance. Five ball hogs will not work.
3. Sim it. Quarter by quarter scores, box scores, standings, playoff series, Finals MVP.
   Best fitting teams genuinely win more, not just the biggest names.
4. Champion gets the ring. Your rings collect in the trophy case.

## Playing with friends

Create a room and share the 4 letter code. Friends join from their own devices, no
accounts, no server, it runs peer to peer. Or play solo against CPU drafters. CPU teams
fill out the league either way.

## The real data

11,408 real player seasons, 2,054 players, 40 franchises, all with real stats and real NBA
headshots. Ratings are computed from era relative numbers so a 1987 season competes fairly
with a 2026 one. Season stats come from
[sumitrodatta/bball-reference-datasets](https://github.com/sumitrodatta/bball-reference-datasets),
data derived from Basketball Reference. Headshot photo ids come from
[swar/nba_api](https://github.com/swar/nba_api). Photos are served from the NBA's public CDN.

To regenerate the card pool:

```
npm run data:fetch
npm run data:generate
```

## Tech

- React, TypeScript, Vite, Tailwind, zustand
- Pure TypeScript engines for evaluation and simulation, fully seeded and deterministic
- PeerJS WebRTC for online rooms, no backend anywhere
- 70 tests with Vitest, deployed free on GitHub Pages

## Status

v1 is live: solo and online, both draft modes, season plus playoffs or straight series,
trophy case. See PRD.md for the full design.
