import type { Card, CardAttrs, Pos, Tier } from '../types'
import { STARTER_SLOTS, emptyRoster, type Roster } from './lineup'

const DEFAULT_ATTRS: CardAttrs = { sc: 60, sh: 60, pm: 60, rb: 60, df: 60, rm: 60 }

let counter = 0

export function makeCard(
  overrides: Partial<Omit<Card, 'attrs' | 'stats'>> & { attrs?: Partial<CardAttrs> } = {},
): Card {
  counter += 1
  const ovr = overrides.ovr ?? 80
  return {
    id: overrides.id ?? `fix-${counter}`,
    pid: overrides.pid ?? `fixpid-${counter}`,
    name: overrides.name ?? `Fixture Player ${counter}`,
    // Defaults deliberately never correlate: each generated card gets its own
    // fake franchise and a season far from its siblings, so no two defaults
    // accidentally count as real-life teammates or share an era.
    season: overrides.season ?? 1980 + ((counter * 7) % 47),
    teams: overrides.teams ?? [`T${counter}`],
    pos: overrides.pos ?? 'SF',
    pos2: overrides.pos2 ?? null,
    age: 27,
    ovr,
    usg: overrides.usg ?? 20,
    mpg: overrides.mpg ?? 30,
    photo: null,
    hof: overrides.hof ?? false,
    stats: { pts: 15, reb: 5, ast: 3, stl: 1, blk: 0.5, fg: 47, tp: 35 },
    attrs: { ...DEFAULT_ATTRS, ...overrides.attrs },
    tier: overrides.tier ?? ('STARTER' as Tier),
  }
}

// A full legal roster: natural starter at each position + three bench cards.
// Per-slot overrides merge onto the defaults.
export function makeRoster(overrides: Partial<Record<keyof Roster, Card>> = {}): Roster {
  const roster = emptyRoster()
  for (const slot of STARTER_SLOTS) {
    roster[slot] = overrides[slot] ?? makeCard({ pos: slot as Pos })
  }
  roster.B1 = overrides.B1 ?? makeCard({ pos: 'SG', ovr: 72 })
  roster.B2 = overrides.B2 ?? makeCard({ pos: 'PF', ovr: 72 })
  roster.B3 = overrides.B3 ?? makeCard({ pos: 'PG', ovr: 72 })
  return roster
}
