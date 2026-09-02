# RING CHASERS

An NBA drafting game for me and my friends. One theme deals at the start,
think Lakers only, 7-footers only, ringless legends or the bald squad,
everyone drafts real player seasons on it by typing names from memory,
then the sim plays it out.

Play it here: https://divyambanga.github.io/tuffcomp/

## How it plays

Pick a theme or smash RANDOM. One theme carries all 8 rounds. Type your
picks from memory with unlimited guesses, no strikes, no easy board. Every
wrong call goes in the public whiff ledger forever. An autocomplete helps
spelling but never says who fits. Your pick lands as that player's best
season fitting the theme, and you choose which slot it fills. One real
person per league.

Themes that can't field a legal five, like 7-footers only, play
positionless: anyone can play anywhere and placement goes by skills, so
Jokic runs the point and Wemby guards the rim.

Solo is the chase: draft your 8, then survive 82 games against a stacked
field. The record is your score. 82-0 takes the ring.

With friends: host a room, share the 4 letter code, pick the theme in
setup, snake draft head to head while everyone watches the live keystrokes
of whoever is on the clock, then a season with playoffs or straight
best-of-7s. No accounts, no server, peer to peer.

## Party modes

Two more ways to draft with friends, both 5-man squads under the theme:

- Dollar table: the classic $15 challenge. Five price shelves, $5 legends
  down to $1 glue guys, snake draft, spend your $15 without stranding your
  team. The game checks every pick so nobody softlocks.
- Auction: $50 a team. Players hit the block one at a time, smartly picked
  around what the room still needs. $1 opens it, raises from anyone,
  passes are binding, and the host's clock calls going once, going twice,
  sold. Winner pays, player lands in the best spot.
- Mystery auction: the same block, but you never see the face. Two clues
  open the lot, every bid uncovers one more (four max), all from real data
  and blurred on purpose: height band, a jersey color, the decade, a stat
  band, hardware, a trait. Anyone in the theme can be under there, from a
  99 club legend to a benchwarmer, and the game checks that every clue set
  still fits at least four players spanning fifteen points of rating. The
  hammer reveals him, even when nobody bid.

The host picks the mode in room setup. Party leagues are just the room,
no filler teams, and the winner still gets the full season or playoff sim.

An AI scout (Claude, effort high) reads every roster, the theme, the real
duos and the usage load before tip-off, and nudges the sim within hard
caps so it can never break fairness. It scouts the chase too, all 15
teams in one look.

## The themes

60+ of them: 25 franchises with full lineage (Mikan's Minneapolis counts
as Lakers), every era back to 1947, stat lines like 25+ PPG and 40% from
deep, measurables like under 25, old man game, 7-footers, 6'4 and under
and heavyweights, career paths like one-team loyals, journeymen, ringless
and rookie seasons, hardware like MVP, DPOY, never an All-Star, number
one picks and undrafted, plus curated lists: international, white guys,
bald squad, lefties, Canadians and NBA bloodlines.

## The real data

14,352 real player seasons, 2,558 players, every NBA season from 1947 to
2026 with real stats and real headshots. Ratings are 2K style: era
relative percentiles so 1962 competes fairly with 2026, fringe guys at
68, the season's best around 95, MVP years 96 to 98, and a ten card 99
club for the all-time peaks. Season stats come from
[sumitrodatta/bball-reference-datasets](https://github.com/sumitrodatta/bball-reference-datasets),
data derived from Basketball Reference. Headshot photo ids come from
[swar/nba_api](https://github.com/swar/nba_api). Photos are served from
the NBA's public CDN.

To regenerate the card pool:

```
npm run data:fetch
npm run data:generate
```

## Tech

- React, TypeScript, Vite, Tailwind, zustand
- Pure TypeScript engines for evaluation and simulation, fully seeded and deterministic
- PeerJS WebRTC for online rooms, no backend anywhere
- Claude scout behind a one file Cloudflare Worker (worker/), key held as a
  Worker secret, never in the bundle
- 148 tests with Vitest, deployed free on GitHub Pages

## Status

v4 is live: all of NBA history, 2K style ratings, 60+ themes with a
picker, unlimited blind typing, positionless drafts, live keystrokes in
rooms, a talent-first sim where the best team actually wins, and party
modes (the $15 dollar table, the $50 auction, and the mystery auction).
See PRD.md for the full design.
