# RING CHASERS

An NBA drafting game for me and my friends. One theme deals at the start,
think Lakers only or 40% from deep or the '90s only, everyone drafts real
player seasons on it, then the sim plays it out.

Play it here: https://divyambanga.github.io/tuffcomp/

## How it plays

Every draft gets one theme that carries all 8 rounds. Type your picks from
memory, with an autocomplete that helps spelling but never says who fits.
Wrong calls burn strikes. Your pick lands as that player's best season
fitting the theme, and you choose which slot it fills. One real person per
league.

Solo is the chase: draft your 8, then survive 82 games against a stacked
field. The record is your score. 82-0 takes the ring.

With friends: host a room, share the 4 letter code, snake draft head to
head, then a season with playoffs or straight best-of-7s. No accounts, no
server, peer to peer.

An AI scout (Claude) judges every roster for star power, fit, shooting and
defense before tip-off, and nudges the sim within hard caps so it can never
break fairness. Games have real form nights, a star can go for 50, and the
game log keeps every box score one tap away.

## The look

Monochrome drafting sheet, big photos, big numbers, almost no words. Gold
shows up only for perfection.

## The real data

11,408 real player seasons, 2,054 players, real stats and real NBA
headshots, era relative ratings so 1987 competes fairly with 2026. Season
stats come from
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
- Claude judge behind a one file Cloudflare Worker (worker/), key held as a
  Worker secret, never in the bundle
- 93 tests with Vitest, deployed free on GitHub Pages

## Status

v3 is live: theme drafts, the 82-0 chase, friends rooms, AI scout, the
drafting sheet look. See PRD.md for the full design.
