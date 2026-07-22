# tuffcomp

A drafting game for me and my friends. Tap a slot on a 4-3-3, spin, and you get a real World
Cup team and year. Take one player from that squad for the slot, then spin again for the next
one. Once your lineup is full, a scoring engine rates it to decide who built it best. Not just
the biggest names, but the team that actually fits together.

Play it here: https://divyambanga.github.io/tuffcomp/

## Sports and modes

- Soccer: World Cup (building this first)
- Clubs mode and basketball come later

## How it plays

1. Tap an empty slot on the pitch.
2. Spin. You get a real team and year, like France 2022.
3. Pick one player from that squad who can actually play the slot you tapped. No putting a
   defender up front.
4. Spin again for the next slot. Repeat until all 11 are filled.
5. The engine rates your team on quality, fit, nation chemistry, and balance, then shows who
   won and why.

Play solo to chase your best score, play in person by passing the phone around, and later play
online with friends by joining a room code.

## The real data

Every squad is a real World Cup team from 1970 through 2026, about 400 squads and 9,500 real
players, pulled from two free public datasets and merged with a script. Nobody publishes free
skill ratings for that many players, so overalls are computed from real signal instead, things
like how many games a player actually played, goals scored, and awards won. See PRD.md section
7 for exactly how.

1970-2022 squad data is from the [Fjelstul World Cup Database](https://github.com/jfjelstul/worldcup)
by Joshua C. Fjelstul, Ph.D., used under CC-BY-SA 4.0. 2026 squad data is from
[mominullptr/FIFA-World-Cup-2026-Dataset](https://github.com/mominullptr/FIFA-World-Cup-2026-Dataset),
used under CC0.

## The scoring engine

The whole point. It rates a team on four things:

- Quality: how good the players are
- Fit: are they in positions they can play
- Chemistry: do they share a nation
- Balance: does the team cover every job, or is it missing something

Not built yet. Full details and formulas are in PRD.md.

## Tech

- React, TypeScript, Vite, Tailwind
- The rating engine will be a plain TypeScript module with its own tests
- Free to host on GitHub Pages
- Online multiplayer later on Supabase free tier

## Status

Foundation, real data, and the spin-and-build pitch screen are done. Rating engine is next.
See PRD.md for the full plan and the phase by phase build steps.
