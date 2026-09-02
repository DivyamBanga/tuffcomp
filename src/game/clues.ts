import type { Card } from '../types'
import themeDataJson from '../data/themeData.json'
import { hashSeed, mulberry32, shuffle } from '../engine/prng'
import { CURATED_LISTS, normalizeName } from './themes'

// ------------------------------------------------------------ mystery clues
//
// The MYSTERY AUCTION shows clues instead of a face. Every clue is a
// true, checkable fact from real data, blurred into a band so it is never
// a fingerprint on its own, and the anti-giveaway rule (user-confirmed
// 2026-09-01) guarantees that every clue set shown still fits at least
// MIN_FITS different players spanning MIN_SPREAD points of OVR - at any
// moment it could genuinely be a legend or a bum.

export type ClueFamily = 'body' | 'color' | 'stats' | 'hardware' | 'trait'

export interface Clue {
  id: string
  family: ClueFamily
  text: string
  test: (card: Card) => boolean
}

export const MIN_FITS = 4
export const MIN_SPREAD = 15
export const CLUES_TO_OPEN = 2
export const CLUES_MAX = 4

interface ThemeData {
  heights: Record<string, number>
  weights: Record<string, number>
  firstSeason: Record<string, number>
  mvp: string[]
  dpoy: string[]
  smoy: string[]
  roy: string[]
  allStarSeasons: string[]
  everAllStar: string[]
  firstOverall: string[]
  undrafted: string[]
  rings: string[]
  oneTeam: string[]
  journeymen: string[]
  draftPick: Record<string, number>
}
const DATA = themeDataJson as ThemeData
const SET = {
  mvp: new Set(DATA.mvp),
  dpoy: new Set(DATA.dpoy),
  smoy: new Set(DATA.smoy),
  roy: new Set(DATA.roy),
  everAllStar: new Set(DATA.everAllStar),
  allStarSeasons: new Set(DATA.allStarSeasons),
  undrafted: new Set(DATA.undrafted),
  rings: new Set(DATA.rings),
  oneTeam: new Set(DATA.oneTeam),
  journeymen: new Set(DATA.journeymen),
  lefty: new Set(CURATED_LISTS['list-lefty'].map(normalizeName)),
  bald: new Set(CURATED_LISTS['list-bald'].map(normalizeName)),
  intl: new Set(CURATED_LISTS['list-intl'].map(normalizeName)),
  canada: new Set(CURATED_LISTS['list-canada'].map(normalizeName)),
  blood: new Set(CURATED_LISTS['list-blood'].map(normalizeName)),
}

// The one jersey color everybody remembers per franchise - blurred on
// purpose (half the league has worn blue).
const COLORS: Record<string, string> = {
  AND: 'RED', ATL: 'RED', BAL: 'ORANGE', BLB: 'ORANGE', BOS: 'GREEN', BRK: 'BLACK', BUF: 'ORANGE',
  CAP: 'RED', CHA: 'ORANGE', CHH: 'TEAL', CHI: 'RED', CHO: 'TEAL', CHP: 'BLUE', CHS: 'RED', CHZ: 'BLUE',
  CIN: 'BLUE', CLE: 'WINE', DAL: 'BLUE', DEN: 'GOLD', DET: 'BLUE', DNN: 'GOLD', FTW: 'RED', GSW: 'GOLD',
  HOU: 'RED', IND: 'GOLD', INJ: 'BLUE', INO: 'BLUE', KCK: 'BLUE', KCO: 'BLUE', LAC: 'RED', LAL: 'PURPLE',
  MEM: 'BLUE', MIA: 'RED', MIL: 'GREEN', MIN: 'BLUE', MLH: 'RED', MNL: 'BLUE', NJN: 'BLUE', NOH: 'TEAL',
  NOJ: 'PURPLE', NOK: 'TEAL', NOP: 'GOLD', NYK: 'ORANGE', NYN: 'BLUE', OKC: 'BLUE', ORL: 'BLUE', PHI: 'RED',
  PHO: 'ORANGE', PHW: 'BLUE', POR: 'RED', PRO: 'BLUE', ROC: 'RED', SAC: 'PURPLE', SAS: 'BLACK', SDC: 'BLUE',
  SDR: 'GREEN', SEA: 'GREEN', SFW: 'GOLD', SHE: 'RED', STB: 'RED', STL: 'RED', SYR: 'RED', TOR: 'PURPLE',
  TRI: 'RED', UTA: 'PURPLE', VAN: 'TEAL', WAS: 'BLUE', WAT: 'RED', WSB: 'RED', WSC: 'BLUE',
}
export const colorOf = (card: Card): string => COLORS[card.teams[0]] ?? 'BLUE'

// --------------------------------------------------------------- banding

const heightBand = (h: number) => (h <= 72 ? 0 : h <= 75 ? 1 : h <= 78 ? 2 : h <= 81 ? 3 : h <= 84 ? 4 : 5)
const HEIGHT_TEXT = [
  `6'0" OR SHORTER`,
  `BETWEEN 6'1" AND 6'3"`,
  `BETWEEN 6'4" AND 6'6"`,
  `BETWEEN 6'7" AND 6'9"`,
  `BETWEEN 6'10" AND 7'0"`,
  'OVER SEVEN FEET TALL',
]
const ageBand = (a: number) => (a <= 22 ? 0 : a <= 26 ? 1 : a <= 31 ? 2 : a <= 34 ? 3 : 4)
const AGE_TEXT = [
  '22 OR YOUNGER THAT SEASON',
  'AGED 23 TO 26 THAT SEASON',
  'AGED 27 TO 31 THAT SEASON',
  'AGED 32 TO 34 THAT SEASON',
  '35 OR OLDER THAT SEASON',
]
const ptsBand = (p: number) => (p < 8 ? 0 : p < 15 ? 1 : p < 20 ? 2 : p < 25 ? 3 : p < 30 ? 4 : 5)
const PTS_TEXT = [
  'UNDER 8 POINTS A GAME',
  '8 TO 14 POINTS A GAME',
  '15 TO 19 POINTS A GAME',
  '20 TO 24 POINTS A GAME',
  '25 TO 29 POINTS A GAME',
  '30+ POINTS A GAME',
]
const rebBand = (r: number) => (r < 4 ? 0 : r < 8 ? 1 : r < 12 ? 2 : 3)
const REB_TEXT = ['UNDER 4 REBOUNDS A GAME', '4 TO 7 REBOUNDS A GAME', '8 TO 11 REBOUNDS A GAME', '12+ REBOUNDS A GAME']
const astBand = (a: number) => (a < 2 ? 0 : a < 5 ? 1 : a < 8 ? 2 : 3)
const AST_TEXT = ['UNDER 2 ASSISTS A GAME', '2 TO 4 ASSISTS A GAME', '5 TO 7 ASSISTS A GAME', '8+ ASSISTS A GAME']
const decadeOf = (season: number) => Math.floor(season / 10) * 10
const posGroup = (c: Card) => (c.pos === 'PG' || c.pos === 'SG' ? 'A GUARD' : c.pos === 'SF' ? 'A WING' : 'A BIG')
const weightClass = (w: number) => (w >= 250 ? 'heavy' : w > 0 && w <= 190 ? 'light' : null)
const threeBand = (c: Card) =>
  c.season < 1980
    ? 'pre'
    : c.stats.tp === 0
      ? 'none'
      : c.stats.tp >= 40
        ? 'elite'
        : c.stats.tp >= 35
          ? 'good'
          : c.stats.tp < 30
            ? 'bad'
            : null
const THREE_TEXT: Record<string, string> = {
  pre: 'PLAYED BEFORE THE THREE-POINT LINE',
  none: 'DID NOT MAKE A SINGLE THREE THAT SEASON',
  elite: 'SHOT 40%+ FROM THREE THAT SEASON',
  good: 'SHOT 35 TO 39% FROM THREE THAT SEASON',
  bad: 'SHOT UNDER 30% FROM THREE THAT SEASON',
}
const draftBand = (pid: string) => {
  const pick = DATA.draftPick[pid]
  if (!pick) return null
  return pick === 1 ? 'no1' : pick <= 5 ? 'top5' : pick <= 14 ? 'lottery' : pick <= 30 ? 'first' : 'second'
}
const DRAFT_TEXT: Record<string, string> = {
  no1: 'WENT NUMBER ONE OVERALL',
  top5: 'A TOP-FIVE PICK',
  lottery: 'A LOTTERY PICK (6 TO 14)',
  first: 'PICKED 15TH TO 30TH',
  second: 'A SECOND-ROUND PICK',
}

// ------------------------------------------------------ every true clue

export function candidateClues(card: Card): Clue[] {
  const clues: Clue[] = []
  const add = (id: string, family: ClueFamily, text: string, test: (c: Card) => boolean) =>
    clues.push({ id, family, text, test })
  const age = card.age

  // Body & age
  const h = DATA.heights[card.pid] ?? 0
  if (h > 0) add('height', 'body', HEIGHT_TEXT[heightBand(h)], (c) => heightBand(DATA.heights[c.pid] ?? 0) === heightBand(h))
  const wc = weightClass(DATA.weights[card.pid] ?? 0)
  if (wc === 'heavy') add('heavy', 'body', 'WEIGHED 250 POUNDS OR MORE', (c) => weightClass(DATA.weights[c.pid] ?? 0) === 'heavy')
  if (wc === 'light') add('light', 'body', 'WEIGHED UNDER 190 POUNDS', (c) => weightClass(DATA.weights[c.pid] ?? 0) === 'light')
  if (age !== null) add('age', 'body', AGE_TEXT[ageBand(age)], (c) => c.age !== null && ageBand(c.age) === ageBand(age))
  if (DATA.firstSeason[card.pid] === card.season) {
    add('rookie', 'body', 'THIS WAS HIS ROOKIE SEASON', (c) => DATA.firstSeason[c.pid] === c.season)
  }
  add('pos', 'body', `PLAYED AS ${posGroup(card)}`, (c) => posGroup(c) === posGroup(card))

  // Colors & era
  add('color', 'color', `WORE ${colorOf(card)} THAT SEASON`, (c) => colorOf(c) === colorOf(card))
  add('decade', 'color', `THIS SEASON WAS IN THE ${decadeOf(card.season)}s`, (c) => decadeOf(c.season) === decadeOf(card.season))

  // Stats that season
  add('pts', 'stats', PTS_TEXT[ptsBand(card.stats.pts)], (c) => ptsBand(c.stats.pts) === ptsBand(card.stats.pts))
  add('reb', 'stats', REB_TEXT[rebBand(card.stats.reb)], (c) => rebBand(c.stats.reb) === rebBand(card.stats.reb))
  add('ast', 'stats', AST_TEXT[astBand(card.stats.ast)], (c) => astBand(c.stats.ast) === astBand(card.stats.ast))
  const tb = threeBand(card)
  if (tb) add('three', 'stats', THREE_TEXT[tb], (c) => threeBand(c) === tb)
  if (card.stats.fg >= 55) add('fgHigh', 'stats', 'SHOT 55%+ FROM THE FIELD', (c) => c.stats.fg >= 55)
  if (card.stats.fg > 0 && card.stats.fg < 42) {
    add('fgLow', 'stats', 'SHOT UNDER 42% FROM THE FIELD', (c) => c.stats.fg > 0 && c.stats.fg < 42)
  }
  if (card.mpg >= 38) add('ironman', 'stats', 'PLAYED 38+ MINUTES A NIGHT', (c) => c.mpg >= 38)
  if (card.mpg > 0 && card.mpg < 24) add('bench', 'stats', 'UNDER 24 MINUTES A NIGHT', (c) => c.mpg > 0 && c.mpg < 24)

  // Hardware & draft
  if (SET.mvp.has(card.pid)) add('mvp', 'hardware', 'HAS WON AN MVP', (c) => SET.mvp.has(c.pid))
  if (SET.dpoy.has(card.pid)) add('dpoy', 'hardware', 'HAS WON DEFENSIVE PLAYER OF THE YEAR', (c) => SET.dpoy.has(c.pid))
  if (SET.smoy.has(card.pid)) add('smoy', 'hardware', 'HAS WON SIXTH MAN OF THE YEAR', (c) => SET.smoy.has(c.pid))
  if (SET.roy.has(card.pid)) add('roy', 'hardware', 'WAS ROOKIE OF THE YEAR', (c) => SET.roy.has(c.pid))
  if (SET.allStarSeasons.has(`${card.pid}|${card.season}`)) {
    add('asSeason', 'hardware', 'AN ALL-STAR THAT SEASON', (c) => SET.allStarSeasons.has(`${c.pid}|${c.season}`))
  } else if (!SET.everAllStar.has(card.pid)) {
    add('neverAs', 'hardware', 'NEVER MADE AN ALL-STAR TEAM', (c) => !SET.everAllStar.has(c.pid))
  } else {
    add(
      'asOther',
      'hardware',
      'AN ALL-STAR, BUT NOT THAT SEASON',
      (c) => SET.everAllStar.has(c.pid) && !SET.allStarSeasons.has(`${c.pid}|${c.season}`),
    )
  }
  if (SET.rings.has(card.pid)) add('ring', 'hardware', 'HAS A CHAMPIONSHIP RING', (c) => SET.rings.has(c.pid))
  else add('ringless', 'hardware', 'NEVER WON A RING', (c) => !SET.rings.has(c.pid))
  if (SET.undrafted.has(card.pid)) add('undrafted', 'hardware', 'WENT UNDRAFTED', (c) => SET.undrafted.has(c.pid))
  const db = draftBand(card.pid)
  if (db) add('draft', 'hardware', DRAFT_TEXT[db], (c) => draftBand(c.pid) === db)

  // Traits & lists
  const a = card.attrs
  if (a.sh >= 85) add('sniper', 'trait', 'A SNIPER FROM DEEP', (c) => c.attrs.sh >= 85)
  if (a.rm >= 85) add('rim', 'trait', 'A RIM PROTECTOR', (c) => c.attrs.rm >= 85)
  if (a.pm >= 85) add('general', 'trait', 'A FLOOR GENERAL', (c) => c.attrs.pm >= 85)
  if (a.rb >= 85) add('glass', 'trait', 'A GLASS EATER', (c) => c.attrs.rb >= 85)
  if (a.df >= 85) add('lockdown', 'trait', 'A LOCKDOWN DEFENDER', (c) => c.attrs.df >= 85)
  if (a.sc >= 90) add('buckets', 'trait', 'A CERTIFIED BUCKET GETTER', (c) => c.attrs.sc >= 90)
  if (card.usg >= 30) add('ballDom', 'trait', 'BALL DOMINANT (30%+ USAGE)', (c) => c.usg >= 30)
  if (card.usg > 0 && card.usg <= 16) add('lowUsg', 'trait', 'A LOW-USAGE ROLE PLAYER', (c) => c.usg > 0 && c.usg <= 16)
  const norm = normalizeName(card.name)
  if (SET.lefty.has(norm)) add('lefty', 'trait', 'A LEFTY', (c) => SET.lefty.has(normalizeName(c.name)))
  if (SET.bald.has(norm)) add('bald', 'trait', 'FAMOUSLY BALD', (c) => SET.bald.has(normalizeName(c.name)))
  if (SET.intl.has(norm)) add('intl', 'trait', 'AN INTERNATIONAL PLAYER', (c) => SET.intl.has(normalizeName(c.name)))
  if (SET.canada.has(norm)) add('canada', 'trait', 'CANADIAN', (c) => SET.canada.has(normalizeName(c.name)))
  if (SET.blood.has(norm)) {
    add('blood', 'trait', 'HAS FAMILY WHO PLAYED IN THE LEAGUE', (c) => SET.blood.has(normalizeName(c.name)))
  }
  if (SET.oneTeam.has(card.pid)) add('oneTeam', 'trait', 'A ONE-FRANCHISE MAN', (c) => SET.oneTeam.has(c.pid))
  if (SET.journeymen.has(card.pid)) add('journey', 'trait', 'A JOURNEYMAN (6+ TEAMS)', (c) => SET.journeymen.has(c.pid))

  return clues
}

// --------------------------------------------------------- the picker

// Who in the pool still fits every visible clue.
export function fits(people: Card[], clues: Clue[]): Card[] {
  return people.filter((c) => clues.every((clue) => clue.test(c)))
}

function ambiguous(people: Card[], clues: Clue[]): boolean {
  const matching = fits(people, clues)
  if (matching.length < MIN_FITS) return false
  let lo = Number.POSITIVE_INFINITY
  let hi = Number.NEGATIVE_INFINITY
  for (const c of matching) {
    if (c.ovr < lo) lo = c.ovr
    if (c.ovr > hi) hi = c.ovr
  }
  return hi - lo >= MIN_SPREAD
}

// Deterministic clue order for a lot: seeded shuffle, families varied,
// and every prefix that is ever shown (the opening pair, then each added
// clue) passes the anti-giveaway rule.
export function pickClues(card: Card, people: Card[], seed: number, count = CLUES_MAX): Clue[] {
  const rng = mulberry32(hashSeed(`${seed}:clues:${card.id}`))
  const remaining = shuffle(rng, candidateClues(card))
  const chosen: Clue[] = []
  const used = new Set<ClueFamily>()

  const passes = (trial: Clue[]) => (trial.length < CLUES_TO_OPEN ? true : ambiguous(people, trial))

  const tryTake = (requireNewFamily: boolean) => {
    for (const clue of [...remaining]) {
      if (chosen.length >= count) return
      if (requireNewFamily && used.has(clue.family)) continue
      const trial = [...chosen, clue]
      if (!passes(trial)) continue
      // The first clue is only accepted if SOME second clue can join it.
      if (trial.length === 1 && !remaining.some((other) => other !== clue && ambiguous(people, [clue, other]))) continue
      chosen.push(clue)
      used.add(clue.family)
      remaining.splice(remaining.indexOf(clue), 1)
    }
  }
  tryTake(true)
  tryTake(false)

  // Thin pools: fall back to the vaguest facts so a lot always opens with two.
  if (chosen.length < CLUES_TO_OPEN) {
    for (const clue of remaining) {
      if (chosen.length >= CLUES_TO_OPEN) break
      if (['pos', 'decade', 'color'].includes(clue.id) && !chosen.includes(clue)) chosen.push(clue)
    }
  }
  return chosen
}

// What a reasonable guesser would pay: the average dollar value of every
// player the visible clues could be. Bots bid this (user-confirmed).
export function crowdValue(people: Card[], visible: Clue[], valueOf: (card: Card) => number): number {
  const matching = fits(people, visible)
  if (matching.length === 0) return 1
  return Math.max(1, Math.round(matching.reduce((sum, c) => sum + valueOf(c), 0) / matching.length))
}
