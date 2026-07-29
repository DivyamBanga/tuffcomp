// Transforms the raw CSVs in scripts/raw-data/ into src/data/players.json
// (the card pool) and src/data/franchises.json (abbrev -> display name).
//
// Every card is a real player-season (1980-2026): real per-game stats, a
// 0-99 overall and six attributes derived from era-relative percentiles
// (BPM/PER/WS-48 are league-relative by construction, and every percentile
// is computed within its own season, so a 1987 card and a 2026 card compete
// fairly), plus the NBA person id for the official headshot photo. Fully
// deterministic - no RNG anywhere, reruns produce identical output.
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

const FIRST_SEASON = 1980
const LAST_SEASON = 2026

function readCsv(name) {
  return parse(readFileSync(join(RAW, name), 'utf-8'), { columns: true, skip_empty_lines: true })
}

const num = (v) => {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------- raw inputs

const perGameRows = readCsv('player-per-game.csv').filter(
  (r) => r.lg === 'NBA' && +r.season >= FIRST_SEASON && +r.season <= LAST_SEASON,
)
const advancedRows = readCsv('advanced.csv').filter(
  (r) => r.lg === 'NBA' && +r.season >= FIRST_SEASON && +r.season <= LAST_SEASON,
)
const careerRows = readCsv('player-career-info.csv')
const awardRows = readCsv('player-award-shares.csv').filter((r) => r.award === 'nba mvp')
const allStarRows = readCsv('all-star-selections.csv').filter((r) => r.lg === 'NBA')
const teamRows = readCsv('team-abbrev.csv').filter((r) => r.lg === 'NBA')

// ------------------------------------------------------------- lookup tables

const careerById = new Map(careerRows.map((r) => [r.player_id, r]))

const mvpByKey = new Map() // `${player_id}|${season}` -> {share, winner}
for (const r of awardRows) {
  mvpByKey.set(`${r.player_id}|${r.season}`, { share: num(r.share), winner: r.winner === 'TRUE' })
}

const allStarKeys = new Set(allStarRows.map((r) => `${r.player_id}|${r.season}`))

// Latest display name per franchise abbrev (e.g. SEA -> Seattle SuperSonics).
const franchiseName = new Map()
for (const r of teamRows) {
  const existing = franchiseName.get(r.abbreviation)
  if (!existing || +r.season > existing.season) {
    franchiseName.set(r.abbreviation, { name: r.team, season: +r.season })
  }
}

// NBA person ids for headshots, from the nba_api static index.
// Rows look like: [76001, "Abdelnaby", "Alaa", "Alaa Abdelnaby", False],
function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
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

// ------------------------------------------------------------ qualification

const maxGamesBySeason = new Map()
for (const rows of perGameByKey.values()) {
  const { combined } = combineRows(rows)
  const season = +combined.season
  maxGamesBySeason.set(season, Math.max(maxGamesBySeason.get(season) ?? 0, num(combined.g)))
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
  if (games < 0.5 * maxG || mpg < 16) continue

  const pos = pg.pos.split('-')[0]
  if (!['PG', 'SG', 'SF', 'PF', 'C'].includes(pos)) continue

  if (!seasonPool.has(season)) seasonPool.set(season, [])
  seasonPool.get(season).push({ key, pg, adv, teams, pos, pos2: pg.pos.split('-')[1] ?? null })
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

const cards = []
for (const [season, pool] of seasonPool) {
  const pct = {}
  const metric = {
    bpm: (c) => num(c.adv.bpm),
    per: (c) => num(c.adv.per),
    ws48: (c) => num(c.adv.ws_48),
    pts: (c) => num(c.pg.pts_per_game),
    ts: (c) => num(c.adv.ts_percent),
    tp: (c) => num(c.pg.x3p_per_game),
    tppct: (c) => num(c.pg.x3p_percent),
    ast: (c) => num(c.pg.ast_per_game),
    asttov: (c) => num(c.pg.ast_per_game) / Math.max(0.5, num(c.pg.tov_per_game)),
    trbp: (c) => num(c.adv.trb_percent),
    dbpm: (c) => num(c.adv.dbpm),
    stlp: (c) => num(c.adv.stl_percent),
    blkp: (c) => num(c.adv.blk_percent),
  }
  for (const [name, fn] of Object.entries(metric)) {
    pct[name] = percentileRanks(pool.map(fn))
  }
  // 3pt accuracy percentile only among real shooters, so a 2/10 season
  // doesn't rank as elite accuracy.
  const shooters = pool.filter((c) => num(c.pg.x3pa_per_game) >= 1.5)
  const shooterAcc = percentileRanks(shooters.map((c) => num(c.pg.x3p_percent)))

  const composites = pool.map(
    (c) => 0.5 * pct.bpm(metric.bpm(c)) + 0.3 * pct.per(metric.per(c)) + 0.2 * pct.ws48(metric.ws48(c)),
  )
  const compositePct = percentileRanks(composites)

  pool.forEach((c, i) => {
    const p = compositePct(composites[i])
    let overall = Math.round(60 + 39 * p ** 2.6)

    const mvp = mvpByKey.get(c.key)
    if (mvp?.winner) overall += 2
    else if (mvp && mvp.share >= 0.25) overall += 1
    if (allStarKeys.has(c.key)) overall += 1
    overall = Math.min(99, overall)

    const isShooter = num(c.pg.x3pa_per_game) >= 1.5
    const attrs = {
      sc: scale(0.72 * pct.pts(metric.pts(c)) + 0.28 * pct.ts(metric.ts(c))),
      sh: scale(
        0.6 * pct.tp(metric.tp(c)) +
          0.4 * (isShooter ? shooterAcc(num(c.pg.x3p_percent)) : pct.tp(metric.tp(c)) * 0.5),
      ),
      pm: scale(0.75 * pct.ast(metric.ast(c)) + 0.25 * pct.asttov(metric.asttov(c))),
      rb: scale(pct.trbp(metric.trbp(c))),
      df: scale(0.55 * pct.dbpm(metric.dbpm(c)) + 0.25 * pct.stlp(metric.stlp(c)) + 0.2 * pct.blkp(metric.blkp(c))),
      rm: scale(0.8 * pct.blkp(metric.blkp(c)) + 0.2 * pct.trbp(metric.trbp(c))),
    }

    const career = careerById.get(c.pg.player_id)
    const r1 = (v) => Math.round(num(v) * 10) / 10

    cards.push({
      id: `${c.pg.player_id}-${season}`,
      pid: c.pg.player_id,
      name: c.pg.player,
      season,
      teams: c.teams,
      pos: c.pos,
      pos2: c.pos2,
      age: +c.pg.age || null,
      ovr: overall,
      usg: r1(c.adv.usg_percent),
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
  })
}

// ------------------------------------------------------------------- tiers

// Global tiers over the whole card pool (percentiles were per-season, so
// tier thresholds apply evenly across eras).
function tierOf(ovr) {
  if (ovr >= 96) return 'GOAT'
  if (ovr >= 91) return 'SUPERSTAR'
  if (ovr >= 86) return 'ALLSTAR'
  if (ovr >= 80) return 'STARTER'
  return 'ROTATION'
}
for (const card of cards) card.tier = tierOf(card.ovr)

cards.sort((a, b) => a.id.localeCompare(b.id))

// ------------------------------------------------------------------ output

const franchises = {}
const seenAbbrevs = new Set(cards.flatMap((c) => c.teams))
for (const abbrev of [...seenAbbrevs].sort()) {
  franchises[abbrev] = franchiseName.get(abbrev)?.name ?? abbrev
}

writeFileSync(OUT_PLAYERS, JSON.stringify(cards))
writeFileSync(OUT_FRANCHISES, JSON.stringify(franchises, null, 2))

// ------------------------------------------------------------------ report

const byTier = {}
for (const c of cards) byTier[c.tier] = (byTier[c.tier] ?? 0) + 1
const withPhoto = cards.filter((c) => c.photo !== null).length

console.log(`Cards: ${cards.length} player-seasons, ${new Set(cards.map((c) => c.pid)).size} distinct players`)
console.log('Tiers:', byTier)
console.log(`Photos matched: ${withPhoto} (${Math.round((withPhoto / cards.length) * 100)}%)`)
console.log(`Franchises: ${Object.keys(franchises).length}`)

for (const probe of ['jordami01-1991', 'jamesle01-2013', 'curryst01-2016', 'jokicni01-2024', 'wembavi01-2026']) {
  const c = cards.find((x) => x.id === probe)
  console.log(
    c
      ? `  ${c.id}: ${c.name} ${c.season} ${c.pos} OVR ${c.ovr} [${c.tier}] photo=${c.photo} ${JSON.stringify(c.attrs)}`
      : `  ${probe}: NOT FOUND`,
  )
}
console.log(`players.json: ${(JSON.stringify(cards).length / 1024 / 1024).toFixed(2)} MB`)
