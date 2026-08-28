// Transforms the raw CSVs in scripts/raw-data/ into src/data/players.json
// (the card pool), src/data/franchises.json (abbrev -> display name), and
// src/data/themeData.json (award winners, draft history, rings, career
// paths, heights/weights - everything the theme registry needs).
//
// Every card is a real player-season (1947-2026, BAA included - the NBA
// counts it): real per-game stats, a 2K-style overall and six attributes
// derived from era-relative percentiles (all percentiles are computed
// within their own season, so a 1962 card and a 2026 card compete fairly),
// plus the NBA person id for the official headshot photo. Fully
// deterministic - no RNG anywhere, reruns produce identical output.
//
// Era coverage is honest: stats that didn't exist yet fall back to the
// best real signal of the day (defense from defensive win shares before
// dbpm existed in 1974, usage estimated from shot volume before 1978,
// shooting touch from FT% before the 3-point line in 1980).
//
// Run with: npm run data:generate  (after npm run data:fetch)

import { parse } from 'csv-parse/sync'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW = join(__dirname, 'raw-data')
const OUT_PLAYERS = join(__dirname, '..', 'src', 'data', 'players.json')
const OUT_FRANCHISES = join(__dirname, '..', 'src', 'data', 'franchises.json')
const OUT_THEME_DATA = join(__dirname, '..', 'src', 'data', 'themeData.json')

const FIRST_SEASON = 1947
const LAST_SEASON = 2026
const LEAGUES = new Set(['NBA', 'BAA'])

function readCsv(name) {
  return parse(readFileSync(join(RAW, name), 'utf-8'), { columns: true, skip_empty_lines: true })
}

const num = (v) => {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : 0
}
const has = (v) => v !== undefined && v !== '' && v !== 'NA'

// ---------------------------------------------------------------- raw inputs

const inRange = (r) => LEAGUES.has(r.lg) && +r.season >= FIRST_SEASON && +r.season <= LAST_SEASON
const perGameRows = readCsv('player-per-game.csv').filter(inRange)
const advancedRows = readCsv('advanced.csv').filter(inRange)
const careerRows = readCsv('player-career-info.csv')
const awardRows = readCsv('player-award-shares.csv')
const allStarRows = readCsv('all-star-selections.csv').filter((r) => LEAGUES.has(r.lg))
const teamRows = readCsv('team-abbrev.csv').filter((r) => LEAGUES.has(r.lg))
const draftRows = readCsv('draft-pick-history.csv').filter((r) => LEAGUES.has(r.lg))

// ------------------------------------------------------------- lookup tables

const careerById = new Map(careerRows.map((r) => [r.player_id, r]))

const AWARD_KEYS = { mvp: 'nba mvp', dpoy: 'nba dpoy', smoy: 'nba smoy', roy: 'nba roy' }
const mvpByKey = new Map() // `${player_id}|${season}` -> {share, winner}
const awardWinners = { mvp: new Set(), dpoy: new Set(), smoy: new Set(), roy: new Set() }
for (const r of awardRows) {
  if (r.award === AWARD_KEYS.mvp) mvpByKey.set(`${r.player_id}|${r.season}`, { share: num(r.share), winner: r.winner === 'TRUE' })
  for (const [key, award] of Object.entries(AWARD_KEYS)) {
    if (r.award === award && r.winner === 'TRUE') awardWinners[key].add(r.player_id)
  }
}

const allStarKeys = new Set(allStarRows.map((r) => `${r.player_id}|${r.season}`))
const everAllStar = new Set(allStarRows.map((r) => r.player_id))

// Draft history: 1947-2025, every row has a player_id.
const draftedPids = new Set(draftRows.map((r) => r.player_id))
const firstOverall = new Set(draftRows.filter((r) => num(r.overall_pick) === 1).map((r) => r.player_id))

// Latest display name per franchise abbrev (e.g. SEA -> Seattle SuperSonics).
const franchiseName = new Map()
for (const r of teamRows) {
  const existing = franchiseName.get(r.abbreviation)
  if (!existing || +r.season > existing.season) {
    franchiseName.set(r.abbreviation, { name: r.team, season: +r.season })
  }
}

// Every NBA/BAA champion by season-ending year. Powers the RINGLESS/CHAMPS
// themes: a player "has a ring" if any season of their career was spent on
// that season's champion.
const CHAMPIONS = {
  1947: 'PHW', 1948: 'BLB', 1949: 'MNL', 1950: 'MNL', 1951: 'ROC', 1952: 'MNL',
  1953: 'MNL', 1954: 'MNL', 1955: 'SYR', 1956: 'PHW', 1957: 'BOS', 1958: 'STL',
  1959: 'BOS', 1960: 'BOS', 1961: 'BOS', 1962: 'BOS', 1963: 'BOS', 1964: 'BOS',
  1965: 'BOS', 1966: 'BOS', 1967: 'PHI', 1968: 'BOS', 1969: 'BOS', 1970: 'NYK',
  1971: 'MIL', 1972: 'LAL', 1973: 'NYK', 1974: 'BOS', 1975: 'GSW', 1976: 'BOS',
  1977: 'POR', 1978: 'WSB', 1979: 'SEA', 1980: 'LAL', 1981: 'BOS', 1982: 'LAL',
  1983: 'PHI', 1984: 'BOS', 1985: 'LAL', 1986: 'BOS', 1987: 'LAL', 1988: 'LAL',
  1989: 'DET', 1990: 'DET', 1991: 'CHI', 1992: 'CHI', 1993: 'CHI', 1994: 'HOU',
  1995: 'HOU', 1996: 'CHI', 1997: 'CHI', 1998: 'CHI', 1999: 'SAS', 2000: 'LAL',
  2001: 'LAL', 2002: 'LAL', 2003: 'SAS', 2004: 'DET', 2005: 'SAS', 2006: 'MIA',
  2007: 'SAS', 2008: 'BOS', 2009: 'LAL', 2010: 'LAL', 2011: 'DAL', 2012: 'MIA',
  2013: 'MIA', 2014: 'SAS', 2015: 'GSW', 2016: 'CLE', 2017: 'GSW', 2018: 'GSW',
  2019: 'TOR', 2020: 'LAL', 2021: 'MIL', 2022: 'GSW', 2023: 'DEN', 2024: 'BOS',
  2025: 'OKC', 2026: 'NYK',
}

// The 99 club: the handful of transcendent seasons pinned to 99, the way
// 2K reserves 99 editorially. Everything else is formulaic and caps at 98.
const NINETY_NINE_CLUB = new Set([
  'jordami01-1991', 'jordami01-1996', 'jamesle01-2013', 'curryst01-2016',
  'chambwi01-1962', 'chambwi01-1967', 'onealsh01-2000', 'birdla01-1986',
  'johnsma02-1987', 'abdulka01-1972',
])

// NBA person ids for headshots, from the nba_api static index.
// Rows look like: [76001, "Abdelnaby", "Alaa", "Alaa Abdelnaby", False],
function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')
    .replace(/đ/g, 'd')
    .replace(/[.'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const indexText = readFileSync(join(RAW, 'nba-player-index.py'), 'utf-8')
const personIdsByName = new Map() // norm name -> [{id, active}]
for (const m of indexText.matchAll(/\[(\d+), "([^"]*)", "([^"]*)", "([^"]*)", (True|False)\]/g)) {
  const entry = { id: +m[1], active: m[5] === 'True' }
  const key = normalizeName(m[4])
  if (!personIdsByName.has(key)) personIdsByName.set(key, [])
  personIdsByName.get(key).push(entry)
}

function findPersonId(name, careerTo) {
  const candidates = personIdsByName.get(normalizeName(name))
  if (!candidates || candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0].id
  // Duplicate names: use active status vs career recency to disambiguate,
  // otherwise skip the photo rather than risk the wrong face.
  const wantActive = careerTo >= LAST_SEASON - 1
  const matching = candidates.filter((c) => c.active === wantActive)
  return matching.length === 1 ? matching[0].id : null
}

// ------------------------------------------- combine season rows per player

// Traded players have one combined row (team "2TM"/"3TM"/...) plus per-team
// rows. Stats come from the combined row; franchise membership comes from
// the per-team rows.
function combineRows(rows) {
  const combined = rows.find((r) => r.team.endsWith('TM')) ?? rows[0]
  const teams = rows.filter((r) => !r.team.endsWith('TM')).map((r) => r.team)
  return { combined, teams: teams.length > 0 ? teams : [combined.team] }
}

const perGameByKey = new Map() // `${player_id}|${season}` -> row[]
for (const r of perGameRows) {
  const key = `${r.player_id}|${r.season}`
  if (!perGameByKey.has(key)) perGameByKey.set(key, [])
  perGameByKey.get(key).push(r)
}

const advancedByKey = new Map()
for (const r of advancedRows) {
  const key = `${r.player_id}|${r.season}`
  if (!advancedByKey.has(key)) advancedByKey.set(key, [])
  advancedByKey.get(key).push(r)
}

// -------------------------------------------------- career paths (all rows)

// Career franchise memberships come from EVERY raw row (not just qualified
// cards), so a journeyman's cup-of-coffee stops still count and a ring on a
// bench season still counts.
const careerTeams = new Map() // pid -> Set(abbrev)
const ringPids = new Set()
for (const r of perGameRows) {
  if (r.team.endsWith('TM')) continue
  if (!careerTeams.has(r.player_id)) careerTeams.set(r.player_id, new Set())
  careerTeams.get(r.player_id).add(r.team)
  if (CHAMPIONS[+r.season] === r.team) ringPids.add(r.player_id)
}

// ------------------------------------------------------------ qualification

const maxGamesBySeason = new Map()
const seasonHasMp = new Map()
for (const rows of perGameByKey.values()) {
  const { combined } = combineRows(rows)
  const season = +combined.season
  maxGamesBySeason.set(season, Math.max(maxGamesBySeason.get(season) ?? 0, num(combined.g)))
  if (has(combined.mp_per_game)) seasonHasMp.set(season, true)
}

const seasonPool = new Map() // season -> candidate[]
for (const [key, rows] of perGameByKey) {
  const { combined: pg, teams } = combineRows(rows)
  const advRows = advancedByKey.get(key)
  if (!advRows) continue
  const { combined: adv } = combineRows(advRows)

  const season = +pg.season
  const maxG = maxGamesBySeason.get(season)
  const games = num(pg.g)
  const mpg = num(pg.mp_per_game)
  if (games < 0.5 * maxG) continue
  // Minutes weren't recorded before 1952; where they exist, require a real role.
  if (seasonHasMp.get(season) && mpg < 16) continue

  if (!seasonPool.has(season)) seasonPool.set(season, [])
  seasonPool.get(season).push({ key, pg, adv, teams, rawPos: pg.pos })
}

// ------------------------------------------------- percentiles within season

function percentileRanks(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  return (v) => {
    let lo = 0
    let hi = n
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] < v) lo = mid + 1
      else hi = mid
    }
    return n <= 1 ? 0.5 : lo / (n - 1)
  }
}

const scale = (p, min = 25, max = 99) => Math.round(min + (max - min) * Math.min(1, Math.max(0, p)))

// ------------------------------------------------------- position resolution

// Early decades list positions as bare G/F/C. Split them era-relatively:
// guards with big assist numbers run point, forwards who clean glass slide
// to the four. Modern PG/SG/SF/PF/C strings pass straight through.
const MODERN_POS = new Set(['PG', 'SG', 'SF', 'PF', 'C'])

function resolvePositions(candidate, astPct, trbPct) {
  const parts = candidate.rawPos.split('-')
  const mapOne = (p) => {
    if (MODERN_POS.has(p)) return p
    if (p === 'G') return astPct >= 0.65 ? 'PG' : 'SG'
    if (p === 'F') return trbPct >= 0.6 ? 'PF' : 'SF'
    if (p === 'C') return 'C'
    return null
  }
  const pos = mapOne(parts[0])
  if (!pos) return null
  let pos2 = parts[1] ? mapOne(parts[1]) : null
  if (pos2 === pos) pos2 = null
  return { pos, pos2 }
}

// ---------------------------------------------------------------- the cards

const cards = []
const heightByPid = {}
const weightByPid = {}
const firstSeasonByPid = {}

for (const [season, pool] of seasonPool) {
  const pct = {}
  const metric = {
    bpm: (c) => num(c.adv.bpm),
    per: (c) => num(c.adv.per),
    ws48: (c) => num(c.adv.ws_48),
    wsg: (c) => num(c.adv.ws) / Math.max(1, num(c.pg.g)),
    dwsg: (c) => num(c.adv.dws) / Math.max(1, num(c.pg.g)),
    pts: (c) => num(c.pg.pts_per_game),
    ts: (c) => num(c.adv.ts_percent),
    tp: (c) => num(c.pg.x3p_per_game),
    ft: (c) => num(c.pg.ft_percent),
    ast: (c) => num(c.pg.ast_per_game),
    asttov: (c) => num(c.pg.ast_per_game) / Math.max(0.5, num(c.pg.tov_per_game)),
    trb: (c) => (has(c.adv.trb_percent) ? num(c.adv.trb_percent) : num(c.pg.trb_per_game)),
    dbpm: (c) => num(c.adv.dbpm),
    stlp: (c) => num(c.adv.stl_percent),
    blkp: (c) => num(c.adv.blk_percent),
    shotload: (c) => num(c.pg.fga_per_game) + 0.44 * num(c.pg.fta_per_game),
    height: (c) => num(careerById.get(c.pg.player_id)?.ht_in_in) || 78,
  }
  for (const [name, fn] of Object.entries(metric)) {
    pct[name] = percentileRanks(pool.map(fn))
  }
  // 3pt accuracy percentile only among real shooters, so a 2/10 season
  // doesn't rank as elite accuracy.
  const shooters = pool.filter((c) => num(c.pg.x3pa_per_game) >= 1.5)
  const shooterAcc = percentileRanks(shooters.map((c) => num(c.pg.x3p_percent)))

  // What this season's data can support.
  const hasBpm = pool.some((c) => has(c.adv.bpm))
  const hasPer = pool.some((c) => has(c.adv.per))
  const hasUsg = pool.some((c) => has(c.adv.usg_percent))
  const hasStl = pool.some((c) => has(c.pg.stl_per_game))
  const has3p = pool.some((c) => has(c.pg.x3pa_per_game) && num(c.pg.x3pa_per_game) > 0)

  // Era-appropriate composite: BPM/PER/WS-48 when they all exist; in the
  // middle decades PER + win shares with a defensive win share term (PER
  // is blind to 60s defense - without it Bill Russell rates like a role
  // player); win shares + scoring at the dawn of time.
  const composite = (c) => {
    if (hasBpm) return 0.5 * pct.bpm(metric.bpm(c)) + 0.3 * pct.per(metric.per(c)) + 0.2 * pct.ws48(metric.ws48(c))
    if (hasPer)
      return (
        0.38 * pct.per(metric.per(c)) +
        0.3 * pct.ws48(metric.ws48(c)) +
        0.15 * pct.wsg(metric.wsg(c)) +
        0.17 * pct.dwsg(metric.dwsg(c))
      )
    return 0.65 * pct.wsg(metric.wsg(c)) + 0.35 * pct.pts(metric.pts(c))
  }
  const composites = pool.map(composite)
  const compositePct = percentileRanks(composites)

  pool.forEach((c, i) => {
    const positions = resolvePositions(c, pct.ast(metric.ast(c)), pct.trb(metric.trb(c)))
    if (!positions) return

    // 2K-style overall: season percentile through a curve that lands
    // fringe rotation guys at 68, the median at ~75, solid starters low
    // 80s, and only ~5% of a season at 90+ (like a real 2K roster), with
    // the season's best at 95. Award bonuses push MVP-caliber years to
    // 96-98. Only the 99 club touches 99.
    const p = compositePct(composites[i])
    let overall = 68 + 27 * (0.55 * p + 0.45 * p ** 8)

    const mvp = mvpByKey.get(c.key)
    if (mvp?.winner) overall += 2
    else if (mvp && mvp.share >= 0.25) overall += 1
    if (allStarKeys.has(c.key)) overall += 1
    overall = Math.min(98, Math.round(overall))

    const id = `${c.pg.player_id}-${season}`
    if (NINETY_NINE_CLUB.has(id)) overall = 99

    const isShooter = num(c.pg.x3pa_per_game) >= 1.5
    const attrs = {
      sc: scale(0.72 * pct.pts(metric.pts(c)) + 0.28 * pct.ts(metric.ts(c))),
      // Before the 3-point line, shooting touch comes from FT% (capped
      // well below real snipers - nobody was spacing the floor in 1965).
      sh: has3p
        ? scale(0.6 * pct.tp(metric.tp(c)) + 0.4 * (isShooter ? shooterAcc(num(c.pg.x3p_percent)) : pct.tp(metric.tp(c)) * 0.5))
        : scale(pct.ft(metric.ft(c)) * 0.4),
      pm: hasUsg
        ? scale(0.75 * pct.ast(metric.ast(c)) + 0.25 * pct.asttov(metric.asttov(c)))
        : scale(pct.ast(metric.ast(c))),
      rb: scale(pct.trb(metric.trb(c))),
      // Defense before 1974 (no dbpm/steals/blocks): defensive win shares.
      df: hasStl
        ? scale(0.55 * pct.dbpm(metric.dbpm(c)) + 0.25 * pct.stlp(metric.stlp(c)) + 0.2 * pct.blkp(metric.blkp(c)))
        : scale(pct.dwsg(metric.dwsg(c))),
      // Rim protection before blocks existed: size plus boards.
      rm: hasStl
        ? scale(0.8 * pct.blkp(metric.blkp(c)) + 0.2 * pct.trb(metric.trb(c)))
        : scale(0.55 * pct.height(metric.height(c)) + 0.45 * pct.trb(metric.trb(c))),
    }

    const career = careerById.get(c.pg.player_id)
    const r1 = (v) => Math.round(num(v) * 10) / 10

    // Usage before 1978: estimated from true shot volume, mapped onto the
    // familiar 10-36 band.
    const usg = hasUsg ? r1(c.adv.usg_percent) : r1(10 + 26 * pct.shotload(metric.shotload(c)))

    cards.push({
      id,
      pid: c.pg.player_id,
      name: c.pg.player,
      season,
      teams: c.teams,
      pos: positions.pos,
      pos2: positions.pos2,
      age: +c.pg.age || null,
      ovr: overall,
      usg,
      mpg: r1(c.pg.mp_per_game),
      photo: findPersonId(c.pg.player, career ? +career.to : 0),
      hof: career?.hof === 'TRUE',
      stats: {
        pts: r1(c.pg.pts_per_game),
        reb: r1(c.pg.trb_per_game),
        ast: r1(c.pg.ast_per_game),
        stl: r1(c.pg.stl_per_game),
        blk: r1(c.pg.blk_per_game),
        fg: r1(num(c.pg.fg_percent) * 100),
        tp: r1(num(c.pg.x3p_percent) * 100),
      },
      attrs,
    })

    if (career) {
      heightByPid[c.pg.player_id] = num(career.ht_in_in)
      weightByPid[c.pg.player_id] = num(career.wt)
      firstSeasonByPid[c.pg.player_id] = +career.from
    }
  })
}

// ------------------------------------------------------------------- tiers

// Global tiers over the whole card pool (percentiles were per-season, so
// tier thresholds apply evenly across eras). 2K-scale bands.
function tierOf(ovr) {
  if (ovr >= 96) return 'GOAT'
  if (ovr >= 91) return 'SUPERSTAR'
  if (ovr >= 85) return 'ALLSTAR'
  if (ovr >= 78) return 'STARTER'
  return 'ROTATION'
}
for (const card of cards) card.tier = tierOf(card.ovr)

cards.sort((a, b) => a.id.localeCompare(b.id))

// -------------------------------------------------------------- theme data

const poolPids = new Set(cards.map((c) => c.pid))
const onlyPool = (pids) => [...pids].filter((pid) => poolPids.has(pid)).sort()

const journeymen = []
const oneTeam = []
for (const [pid, teams] of careerTeams) {
  if (!poolPids.has(pid)) continue
  const career = careerById.get(pid)
  const span = career ? +career.to - +career.from : 0
  if (teams.size >= 6) journeymen.push(pid)
  if (teams.size === 1 && span >= 3) oneTeam.push(pid)
}

// Undrafted only means something once going undrafted was survivable -
// draft data itself covers 1947 on, so gate to the modern free-agent era.
const undrafted = cards
  .map((c) => c.pid)
  .filter((pid, i, arr) => arr.indexOf(pid) === i)
  .filter((pid) => !draftedPids.has(pid) && (firstSeasonByPid[pid] ?? 0) >= 1977)

const themeData = {
  heights: heightByPid,
  weights: weightByPid,
  firstSeason: firstSeasonByPid,
  mvp: onlyPool(awardWinners.mvp),
  dpoy: onlyPool(awardWinners.dpoy),
  smoy: onlyPool(awardWinners.smoy),
  roy: onlyPool(awardWinners.roy),
  allStarSeasons: [...allStarKeys].sort(),
  everAllStar: onlyPool(everAllStar),
  firstOverall: onlyPool(firstOverall),
  undrafted: undrafted.sort(),
  rings: onlyPool(ringPids),
  oneTeam: oneTeam.sort(),
  journeymen: journeymen.sort(),
}

// ------------------------------------------------------------------ output

const franchises = {}
const seenAbbrevs = new Set(cards.flatMap((c) => c.teams))
for (const abbrev of [...seenAbbrevs].sort()) {
  franchises[abbrev] = franchiseName.get(abbrev)?.name ?? abbrev
}

writeFileSync(OUT_PLAYERS, JSON.stringify(cards))
writeFileSync(OUT_FRANCHISES, JSON.stringify(franchises, null, 2))
writeFileSync(OUT_THEME_DATA, JSON.stringify(themeData))

// ------------------------------------------------------------------ report

const byTier = {}
for (const c of cards) byTier[c.tier] = (byTier[c.tier] ?? 0) + 1
const withPhoto = cards.filter((c) => c.photo !== null).length

console.log(`Cards: ${cards.length} player-seasons, ${new Set(cards.map((c) => c.pid)).size} distinct players`)
console.log(`Seasons: ${Math.min(...cards.map((c) => c.season))}-${Math.max(...cards.map((c) => c.season))}`)
console.log('Tiers:', byTier)
console.log(`Photos matched: ${withPhoto} (${Math.round((withPhoto / cards.length) * 100)}%)`)
console.log(`Franchises: ${Object.keys(franchises).length}`)
console.log(
  'Theme data:',
  Object.fromEntries(Object.entries(themeData).map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.keys(v).length])),
)

for (const id of NINETY_NINE_CLUB) {
  if (!cards.some((c) => c.id === id)) console.warn(`  WARNING: 99-club id missing from pool: ${id}`)
}

const probes = [
  'jordami01-1991', 'jamesle01-2013', 'curryst01-2016', 'jokicni01-2024', 'wembavi01-2026',
  'chambwi01-1962', 'russebi01-1962', 'mikange01-1950', 'westje01-1970', 'roberos01-1962',
  'birdla01-1986', 'duncati01-2003', 'gilgesh01-2025', 'brunsja01-2026',
]
for (const probe of probes) {
  const c = cards.find((x) => x.id === probe)
  console.log(
    c
      ? `  ${c.id}: ${c.name} ${c.season} ${c.pos}${c.pos2 ? '/' + c.pos2 : ''} OVR ${c.ovr} [${c.tier}] usg=${c.usg} ${JSON.stringify(c.attrs)}`
      : `  ${probe}: NOT FOUND`,
  )
}
console.log(`players.json: ${(JSON.stringify(cards).length / 1024 / 1024).toFixed(2)} MB`)
console.log(`themeData.json: ${(JSON.stringify(themeData).length / 1024).toFixed(0)} KB`)
