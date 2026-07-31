import type { Card } from '../types'
import franchisesJson from '../data/franchises.json'
import { mulberry32, shuffle } from '../engine/prng'

const FRANCHISE_NAMES = franchisesJson as Record<string, string>

// ---------------------------------------------------------------- themes
//
// A theme is one round's constraint in Theme Draft: every drafter in that
// round picks under the same rule, so rounds stay fair. Themes are code
// (test functions), so only theme IDS are ever serialized or sent over
// the wire; both ends resolve them through this registry.

export type ThemeKind = 'franchise' | 'era' | 'stat' | 'list'

export interface Theme {
  id: string
  kind: ThemeKind
  label: string
  detail: string
  test: (card: Card) => boolean
}

// -------------------------------------------------------------- matching

// Shared name normalization: case, diacritics, punctuation.
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------- curated lists
//
// Race and birthplace aren't in the stats dataset, so these two are hand
// curated from public record (notable players only). MVP winners are the
// award list 1980-2025. Matching is by normalized full name.

const MVP_WINNERS = [
  'Kareem Abdul-Jabbar',
  'Julius Erving',
  'Moses Malone',
  'Larry Bird',
  'Magic Johnson',
  'Michael Jordan',
  'Charles Barkley',
  'Hakeem Olajuwon',
  'David Robinson',
  'Karl Malone',
  "Shaquille O'Neal",
  'Allen Iverson',
  'Tim Duncan',
  'Kevin Garnett',
  'Steve Nash',
  'Dirk Nowitzki',
  'Kobe Bryant',
  'LeBron James',
  'Derrick Rose',
  'Kevin Durant',
  'Stephen Curry',
  'Russell Westbrook',
  'James Harden',
  'Giannis Antetokounmpo',
  'Nikola Jokic',
  'Joel Embiid',
  'Shai Gilgeous-Alexander',
]

const INTERNATIONAL = [
  'Hakeem Olajuwon',
  'Patrick Ewing',
  'Dikembe Mutombo',
  'Manute Bol',
  'Detlef Schrempf',
  'Rik Smits',
  'Vlade Divac',
  'Drazen Petrovic',
  'Toni Kukoc',
  'Sarunas Marciulionis',
  'Arvydas Sabonis',
  'Rolando Blackman',
  'Kiki Vandeweghe',
  'Luc Longley',
  'Steve Nash',
  'Dirk Nowitzki',
  'Peja Stojakovic',
  'Pau Gasol',
  'Marc Gasol',
  'Tony Parker',
  'Manu Ginobili',
  'Yao Ming',
  'Andrei Kirilenko',
  'Zydrunas Ilgauskas',
  'Hedo Turkoglu',
  'Andrea Bargnani',
  'Luol Deng',
  'Serge Ibaka',
  'Al Horford',
  'Ricky Rubio',
  'Goran Dragic',
  'Nicolas Batum',
  'Marcin Gortat',
  'Jonas Valanciunas',
  'Nikola Vucevic',
  'Rudy Gobert',
  'Giannis Antetokounmpo',
  'Kristaps Porzingis',
  'Nikola Jokic',
  'Ben Simmons',
  'Joel Embiid',
  'Domantas Sabonis',
  'Lauri Markkanen',
  'Luka Doncic',
  'Shai Gilgeous-Alexander',
  'Jamal Murray',
  'Andrew Wiggins',
  'Pascal Siakam',
  'OG Anunoby',
  'Alperen Sengun',
  'Franz Wagner',
  'Josh Giddey',
  'Victor Wembanyama',
  'Clint Capela',
  'Bogdan Bogdanovic',
  'Bojan Bogdanovic',
  'Evan Fournier',
  'Dennis Schroder',
  'Kyrie Irving',
  'Andrew Bogut',
  'Dario Saric',
  'Jusuf Nurkic',
  'Ivica Zubac',
]

const WHITE_GUYS = [
  'Larry Bird',
  'Kevin McHale',
  'Bill Walton',
  'Jack Sikma',
  'Bill Laimbeer',
  'Alvan Adams',
  'Paul Westphal',
  'Dave Cowens',
  'Kurt Rambis',
  'Danny Ainge',
  'John Paxson',
  'Steve Kerr',
  'Mark Eaton',
  'Chris Mullin',
  'John Stockton',
  'Jeff Hornacek',
  'Mark Price',
  'Brad Daugherty',
  'Tom Chambers',
  'Dan Majerle',
  'Detlef Schrempf',
  'Rex Chapman',
  'Christian Laettner',
  'Rik Smits',
  'Arvydas Sabonis',
  'Toni Kukoc',
  'Vlade Divac',
  'Drazen Petrovic',
  'Keith Van Horn',
  'Tom Gugliotta',
  'Troy Murphy',
  'Steve Nash',
  'Dirk Nowitzki',
  'Peja Stojakovic',
  'Brad Miller',
  'Wally Szczerbiak',
  'Mike Miller',
  'Mike Dunleavy',
  'Chris Kaman',
  'Spencer Hawes',
  'Doug McDermott',
  'Kyle Korver',
  'JJ Redick',
  'Kirk Hinrich',
  'David Lee',
  'Kevin Love',
  'Gordon Hayward',
  'Chandler Parsons',
  'Ryan Anderson',
  'Kelly Olynyk',
  'Zydrunas Ilgauskas',
  'Andrew Bogut',
  'Joe Ingles',
  'Matthew Dellavedova',
  'Goran Dragic',
  'Ricky Rubio',
  'Jose Calderon',
  'Luka Doncic',
  'Nikola Jokic',
  'Nikola Vucevic',
  'Jusuf Nurkic',
  'Bojan Bogdanovic',
  'Bogdan Bogdanovic',
  'Kristaps Porzingis',
  'Lauri Markkanen',
  'Domantas Sabonis',
  'Jonas Valanciunas',
  'Rudy Gobert',
  'Ivica Zubac',
  'Isaiah Hartenstein',
  'Franz Wagner',
  'Moritz Wagner',
  'Tyler Herro',
  'Duncan Robinson',
  'Luke Kennard',
  'Grayson Allen',
  'Donte DiVincenzo',
  'Sam Hauser',
  'Payton Pritchard',
  'Georges Niang',
  'TJ McConnell',
  'Cody Zeller',
  'Mason Plumlee',
  'Kevin Huerter',
  'Austin Reaves',
  'Danilo Gallinari',
  'Davis Bertans',
  'Nemanja Bjelica',
  'Dario Saric',
]

function nameSet(names: string[]): Set<string> {
  return new Set(names.map(normalizeName))
}

const MVP_SET = nameSet(MVP_WINNERS)
const INTL_SET = nameSet(INTERNATIONAL)
const WHITE_SET = nameSet(WHITE_GUYS)

export const CURATED_LISTS: Record<string, string[]> = {
  'list-mvp': MVP_WINNERS,
  'list-intl': INTERNATIONAL,
  'list-white': WHITE_GUYS,
}

// ---------------------------------------------------------- the registry

// Storied franchises with deep all-time pools.
const THEME_FRANCHISES = [
  'LAL', 'BOS', 'CHI', 'GSW', 'MIA', 'SAS', 'DET', 'NYK', 'PHI', 'PHO',
  'DAL', 'HOU', 'MIL', 'CLE', 'DEN', 'UTA', 'POR', 'SEA', 'TOR', 'ATL',
  'ORL', 'IND', 'OKC', 'MEM', 'SAC',
]

function franchiseThemes(): Theme[] {
  return THEME_FRANCHISES.map((abbrev) => ({
    id: `fran-${abbrev}`,
    kind: 'franchise' as const,
    label: `${(FRANCHISE_NAMES[abbrev] ?? abbrev).toUpperCase()} ONLY`,
    detail: `Any season in a ${FRANCHISE_NAMES[abbrev] ?? abbrev} uniform, 1980-2026.`,
    test: (c: Card) => c.teams.includes(abbrev),
  }))
}

function eraThemes(): Theme[] {
  const eras: [string, string, number, number, string][] = [
    ['era-80s', "THE '80s ONLY", 1980, 1989, 'Short shorts, hand checks. Seasons 1980-1989.'],
    ['era-90s', "THE '90s ONLY", 1990, 1999, 'The golden grind. Seasons 1990-1999.'],
    ['era-00s', 'THE 2000s ONLY', 2000, 2009, 'Iso ball and baggy fits. Seasons 2000-2009.'],
    ['era-10s', 'THE 2010s ONLY', 2010, 2019, 'Pace, space, threes. Seasons 2010-2019.'],
    ['era-20s', 'MODERN ERA ONLY', 2020, 2026, 'The unicorn years. Seasons 2020-2026.'],
  ]
  return eras.map(([id, label, from, to, detail]) => ({
    id,
    kind: 'era' as const,
    label,
    detail,
    test: (c: Card) => c.season >= from && c.season <= to,
  }))
}

function statThemes(): Theme[] {
  return [
    {
      id: 'stat-snipers',
      kind: 'stat',
      label: '40% FROM DEEP',
      detail: 'Real snipers only: shot 40%+ from three that season.',
      test: (c) => c.stats.tp >= 40 && c.attrs.sh >= 60,
    },
    {
      id: 'stat-buckets',
      kind: 'stat',
      label: '25+ PPG SCORERS',
      detail: 'Certified bucket getters: 25 or more a night.',
      test: (c) => c.stats.pts >= 25,
    },
    {
      id: 'stat-lockdown',
      kind: 'stat',
      label: 'LOCKDOWN DEFENDERS',
      detail: 'Elite defensive seasons only. Buckets not included.',
      test: (c) => c.attrs.df >= 85,
    },
    {
      id: 'stat-glass',
      kind: 'stat',
      label: 'GLASS CLEANERS',
      detail: '11+ rebounds a game. Board man gets paid.',
      test: (c) => c.stats.reb >= 11,
    },
    {
      id: 'stat-generals',
      kind: 'stat',
      label: 'FLOOR GENERALS',
      detail: '8+ assists a game. The offense runs through them.',
      test: (c) => c.stats.ast >= 8,
    },
    {
      id: 'stat-swats',
      kind: 'stat',
      label: 'RIM PROTECTORS',
      detail: '2+ blocks a game. Nothing easy at the rim.',
      test: (c) => c.stats.blk >= 2,
    },
    {
      id: 'stat-ironmen',
      kind: 'stat',
      label: 'IRON MEN',
      detail: '38+ minutes a night. Load management not invented yet.',
      test: (c) => c.mpg >= 38,
    },
  ]
}

function listThemes(): Theme[] {
  return [
    {
      id: 'list-mvp',
      kind: 'list',
      label: 'MVP WINNERS ONLY',
      detail: 'Any season by a player who has won the MVP award.',
      test: (c) => MVP_SET.has(normalizeName(c.name)),
    },
    {
      id: 'list-hof',
      kind: 'list',
      label: 'HALL OF FAMERS ONLY',
      detail: 'Enshrined in Springfield or bust.',
      test: (c) => c.hof,
    },
    {
      id: 'list-intl',
      kind: 'list',
      label: 'INTERNATIONAL ONLY',
      detail: 'Born outside the USA. The world took over.',
      test: (c) => INTL_SET.has(normalizeName(c.name)),
    },
    {
      id: 'list-white',
      kind: 'list',
      label: 'WHITE GUYS ONLY',
      detail: 'The all-time great white squad. You know the legends.',
      test: (c) => WHITE_SET.has(normalizeName(c.name)),
    },
  ]
}

export const THEMES: Theme[] = [...franchiseThemes(), ...eraThemes(), ...statThemes(), ...listThemes()]

const THEMES_BY_ID = new Map(THEMES.map((t) => [t.id, t]))

export function themeById(id: string): Theme {
  const theme = THEMES_BY_ID.get(id)
  if (!theme) throw new Error(`unknown theme: ${id}`)
  return theme
}

// ------------------------------------------------------- round selection

// A theme qualifies for a draft when it has real depth: enough distinct
// people and star power worth fighting over. (A theme that can't cover a
// position is fine - it constrains one pick, not the team, and a forced
// starter fill falls back to an open board.)
export function themeHasDepth(theme: Theme, pool: Card[], playerCount: number): boolean {
  const eligible = pool.filter(theme.test)
  const pids = new Set(eligible.map((c) => c.pid))
  if (pids.size < Math.max(16, playerCount * 3)) return false

  const starPids = new Set(eligible.filter((c) => c.ovr >= 85).map((c) => c.pid))
  return starPids.size >= playerCount
}

// The 8 themes for a draft: seeded shuffle, no repeats, first valid wins.
export function pickThemeRounds(pool: Card[], playerCount: number, seed: number, rounds: number): string[] {
  const shuffled = shuffle(mulberry32(seed), THEMES)
  const chosen: string[] = []
  for (const theme of shuffled) {
    if (chosen.length >= rounds) break
    if (themeHasDepth(theme, pool, playerCount)) chosen.push(theme.id)
  }
  // The registry is far larger than a draft, so this cannot realistically
  // run short - but never return a broken ladder.
  if (chosen.length < rounds) {
    for (const theme of shuffled) {
      if (chosen.length >= rounds) break
      if (!chosen.includes(theme.id)) chosen.push(theme.id)
    }
  }
  return chosen
}

// ----------------------------------------------------------- typed picks

interface NameEntry {
  pid: string
  name: string
  norm: string
  tokens: string[]
  peak: number
}

const indexCache = new WeakMap<Card[], NameEntry[]>()

function nameIndex(pool: Card[]): NameEntry[] {
  const cached = indexCache.get(pool)
  if (cached) return cached
  const byPid = new Map<string, NameEntry>()
  for (const card of pool) {
    const existing = byPid.get(card.pid)
    if (existing) {
      existing.peak = Math.max(existing.peak, card.ovr)
    } else {
      const norm = normalizeName(card.name)
      byPid.set(card.pid, { pid: card.pid, name: card.name, norm, tokens: norm.split(' '), peak: card.ovr })
    }
  }
  const entries = [...byPid.values()]
  indexCache.set(pool, entries)
  return entries
}

function editDistanceAtMost2(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 2) return false
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i)
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0]
    dp[0] = j
    let rowMin = dp[0]
    for (let i = 1; i <= a.length; i++) {
      const cur = dp[i]
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = cur
      rowMin = Math.min(rowMin, dp[i])
    }
    if (rowMin > 2) return false
  }
  return dp[a.length] <= 2
}

// Query tokens must prefix-match the name's tokens in order, so
// "steph curry" hits "stephen curry" and "j kidd" hits "jason kidd".
function tokensPrefixMatch(query: string[], name: string[]): boolean {
  let ni = 0
  for (const q of query) {
    while (ni < name.length && !name[ni].startsWith(q)) ni++
    if (ni >= name.length) return false
    ni++
  }
  return true
}

// Resolve what the drafter meant. Ties go to the biggest name (highest
// peak overall) - typing "jordan" means Michael, not DeAndre.
export function resolveTypedPick(pool: Card[], query: string): { pid: string; name: string } | null {
  const q = normalizeName(query)
  if (q.length < 2) return null
  const entries = nameIndex(pool)
  const qTokens = q.split(' ')

  const best = (candidates: NameEntry[]) =>
    candidates.length === 0 ? null : candidates.reduce((a, b) => (b.peak > a.peak ? b : a))

  const exact = best(entries.filter((e) => e.norm === q))
  if (exact) return { pid: exact.pid, name: exact.name }

  const prefix = best(entries.filter((e) => tokensPrefixMatch(qTokens, e.tokens)))
  if (prefix) return { pid: prefix.pid, name: prefix.name }

  if (qTokens.length === 1) {
    const single = best(entries.filter((e) => e.tokens.includes(q)))
    if (single) return { pid: single.pid, name: single.name }
  }

  const fuzzy = best(entries.filter((e) => editDistanceAtMost2(e.norm, q)))
  if (fuzzy) return { pid: fuzzy.pid, name: fuzzy.name }

  return null
}
