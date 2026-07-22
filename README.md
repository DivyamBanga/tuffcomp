# tuffcomp

A drafting game for me and my friends. You get a random real team and year, build the best
lineup you can from that squad, and a scoring engine rates everyone's team to decide who built
it best. Not just the biggest names, but the team that actually fits together.

## Sports and modes

- Soccer: World Cup and Clubs
- Basketball: All-Time and Current

We are building Soccer World Cup first, fully working, before adding the rest.

## How it plays

1. Spin and get a Team-Year card, like France 2022.
2. Place that squad's real players into a formation. You can only put players where they
   actually play, so no attackers in defense.
3. The engine rates your team on quality, fit, chemistry, and balance, then shows who won and
   why.

Play solo to chase your best score, play in person by passing the phone around, and later play
online with friends by joining a room code.

## The scoring engine

The whole point. It rates a team on four things:

- Quality: how good the players are
- Fit: are they in positions they can play
- Chemistry: shared nation, league, and club links
- Balance: does the team cover every job, or is it missing something

Full details and formulas are in PRD.md.

## Tech

- React, TypeScript, Vite, Tailwind
- The rating engine is a plain TypeScript module with its own tests
- Free to host on Vercel or GitHub Pages
- Online multiplayer later on Supabase free tier

## Status

Planning is done. See PRD.md for the full plan and the phase by phase build steps.
