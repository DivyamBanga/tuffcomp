// Generates src/data/squads.json from real World Cup data.
//
// Sources (raw CSVs in scripts/raw-data/, not committed - see scripts/fetch-raw-data.mjs):
//   1970-2022 men's squads: github.com/jfjelstul/worldcup (CC-BY-SA 4.0, Joshua C. Fjelstul)
//   2026 squads:            github.com/mominullptr/FIFA-World-Cup-2026-Dataset (CC0)
//
// Neither source has skill ratings - we don't have those for real players at this scale,
// so overall/attributes are derived algorithmically from real signal (tournament
// appearances, goals, awards, caps, market value), not hand-tuned or copied from any
// rating database. See PRD.md section 7 for the reasoning.
//
// Run with: node scripts/generate-squads.mjs

import { parse } from 'csv-parse/sync'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(__dirname, 'raw-data')
const OUT_FILE = join(__dirname, '..', 'src', 'data', 'squads.json')

const MEN_TOURNAMENTS_1970_2022 = [
  'WC-1970', 'WC-1974', 'WC-1978', 'WC-1982', 'WC-1986', 'WC-1990', 'WC-1994', 'WC-1998',
  'WC-2002', 'WC-2006', 'WC-2010', 'WC-2014', 'WC-2018', 'WC-2022',
]

const POSITION_MAP = { GK: 'GK', DF: 'DEF', MF: 'MID', FW: 'FWD' }
const MAJOR_AWARDS = new Set(['Golden Ball', 'Golden Boot', 'Best Young Player'])

function readCsv(filename) {
  const text = readFileSync(join(RAW_DIR, filename), 'utf-8')
  return parse(text, { columns: true, skip_empty_lines: true })
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

// Mononym players (common in Brazilian football, e.g. Pele, Jairzinho) are stored with
// family_name = the single name and given_name = the literal sentinel "not applicable".
function playerName(givenName, familyName) {
  if (givenName === 'not applicable') return familyName.trim()
  return `${givenName} ${familyName}`.trim()
}

// Deterministic pseudo-random offset in [-spread, spread] from a string seed, so reruns
// of this script always produce the same output for the same input data.
function hashJitter(seed, spread) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0
  return (Math.abs(h) % (spread * 2 + 1)) - spread
}

const ATTRIBUTE_ARCHETYPES = {
  GK: { pace: -35, shooting: -50, passing: -8, dribbling: -30, defending: 6, physical: 2 },
  DEF: { pace: -6, shooting: -32, passing: -4, dribbling: -16, defending: 10, physical: 6 },
  MID: { pace: -4, shooting: -12, passing: 9, dribbling: 5, defending: -10, physical: -4 },
  FWD: { pace: 6, shooting: 11, passing: -10, dribbling: 6, defending: -32, physical: -6 },
}

function computeAttributes(position, overall, seed) {
  const archetype = ATTRIBUTE_ARCHETYPES[position]
  const attributes = {}
  for (const key of ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical']) {
    attributes[key] = clamp(Math.round(overall + archetype[key] + hashJitter(seed + key, 6)), 20, 99)
  }
  return attributes
}

// --- 1970-2022 (jfjelstul) ---

function loadHistoricalSquads() {
  const squadRows = readCsv('squads.csv').filter((r) => MEN_TOURNAMENTS_1970_2022.includes(r.tournament_id))
  const appearanceRows = readCsv('player_appearances.csv').filter((r) =>
    MEN_TOURNAMENTS_1970_2022.includes(r.tournament_id),
  )
  const goalRows = readCsv('goals.csv').filter(
    (r) => MEN_TOURNAMENTS_1970_2022.includes(r.tournament_id) && r.own_goal === '0',
  )
  const awardRows = readCsv('award_winners.csv').filter((r) => MEN_TOURNAMENTS_1970_2022.includes(r.tournament_id))

  const appearanceStats = new Map() // `${tournament_id}|${player_id}` -> { count, starts }
  for (const row of appearanceRows) {
    const key = `${row.tournament_id}|${row.player_id}`
    const stat = appearanceStats.get(key) ?? { count: 0, starts: 0 }
    stat.count += 1
    if (row.starter === '1') stat.starts += 1
    appearanceStats.set(key, stat)
  }

  const goalCounts = new Map() // `${tournament_id}|${player_id}` -> count
  for (const row of goalRows) {
    const key = `${row.tournament_id}|${row.player_id}`
    goalCounts.set(key, (goalCounts.get(key) ?? 0) + 1)
  }

  const awardFlags = new Map() // `${tournament_id}|${player_id}` -> { hasAny, hasMajor }
  for (const row of awardRows) {
    const key = `${row.tournament_id}|${row.player_id}`
    const flag = awardFlags.get(key) ?? { hasAny: false, hasMajor: false }
    flag.hasAny = true
    if (MAJOR_AWARDS.has(row.award_name)) flag.hasMajor = true
    awardFlags.set(key, flag)
  }

  const squadsByKey = new Map() // `${tournament_id}|${team_id}` -> Squad

  for (const row of squadRows) {
    const position = POSITION_MAP[row.position_code]
    if (!position) continue // pre-1954-style unknown position codes, shouldn't occur in 1970+

    const year = Number.parseInt(row.tournament_id.slice(3), 10)
    const squadKey = `${row.tournament_id}|${row.team_id}`
    if (!squadsByKey.has(squadKey)) {
      squadsByKey.set(squadKey, {
        id: `${row.team_code.toLowerCase()}-${year}`,
        team: row.team_name,
        year,
        kind: 'nation',
        players: [],
      })
    }

    const statKey = `${row.tournament_id}|${row.player_id}`
    const appearance = appearanceStats.get(statKey) ?? { count: 0, starts: 0 }
    const goals = goalCounts.get(statKey) ?? 0
    const awards = awardFlags.get(statKey) ?? { hasAny: false, hasMajor: false }

    const playerSeed = `${row.tournament_id}-${row.player_id}`
    const overall = clamp(
      Math.round(
        60 +
          Math.min(appearance.count, 7) * 2 +
          Math.min(appearance.starts, 7) * 1.5 +
          Math.min(goals, 8) * 2.5 +
          (awards.hasMajor ? 10 : awards.hasAny ? 5 : 0) +
          hashJitter(playerSeed, 3),
      ),
      50,
      99,
    )

    squadsByKey.get(squadKey).players.push({
      id: `${row.team_code.toLowerCase()}-${year}-${row.player_id.toLowerCase()}`,
      name: playerName(row.given_name, row.family_name),
      nation: row.team_name,
      year,
      overall,
      positions: [position],
      attributes: computeAttributes(position, overall, playerSeed),
    })
  }

  return [...squadsByKey.values()]
}

// --- 2026 (mominullptr) ---

function loadWc2026Squads() {
  const teamRows = readCsv('wc2026_teams.csv')
  const teamNameById = new Map(teamRows.map((r) => [r.team_id, r.team_name]))
  const teamCodeById = new Map(teamRows.map((r) => [r.team_id, r.fifa_code]))

  const playerRows = readCsv('wc2026_squads.csv')
  const squadsByTeam = new Map() // team_id -> Squad

  for (const row of playerRows) {
    const position = POSITION_MAP[row.position] ?? row.position // already GK/DEF/MID/FWD in this source
    if (!['GK', 'DEF', 'MID', 'FWD'].includes(position)) continue

    const teamId = row.team_id
    if (!squadsByTeam.has(teamId)) {
      const code = (teamCodeById.get(teamId) ?? teamId).toLowerCase()
      squadsByTeam.set(teamId, {
        id: `${code}-2026`,
        team: teamNameById.get(teamId) ?? `Team ${teamId}`,
        year: 2026,
        kind: 'nation',
        players: [],
      })
    }

    const marketValue = Number.parseFloat(row.market_value_eur) || 100_000
    const caps = Number.parseInt(row.caps, 10) || 0
    const goals = Number.parseInt(row.goals, 10) || 0
    const playerSeed = `wc2026-${row.player_id}`

    const logValue = Math.log10(Math.max(marketValue, 100_000))
    const marketComponent = clamp(((logValue - 5.3) / 3) * 26, 0, 26)
    const overall = clamp(
      Math.round(
        58 + marketComponent + Math.min(caps, 100) * 0.09 + Math.min(goals, 60) * 0.12 + hashJitter(playerSeed, 3),
      ),
      50,
      99,
    )

    squadsByTeam.get(teamId).players.push({
      id: `wc2026-${row.player_id}`,
      name: row.player_name,
      nation: teamNameById.get(teamId) ?? `Team ${teamId}`,
      year: 2026,
      overall,
      positions: [position],
      attributes: computeAttributes(position, overall, playerSeed),
    })
  }

  return [...squadsByTeam.values()]
}

// --- Validate every squad can fill a 4-3-3 (1 GK, 4 DEF, 3 MID, 3 FWD) ---

function canFill433(squad) {
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const p of squad.players) {
    for (const pos of p.positions) counts[pos] = (counts[pos] ?? 0) + 1
  }
  return counts.GK >= 1 && counts.DEF >= 4 && counts.MID >= 3 && counts.FWD >= 3
}

const historical = loadHistoricalSquads()
const wc2026 = loadWc2026Squads()
const allSquads = [...historical, ...wc2026]

const validSquads = allSquads.filter(canFill433)
const dropped = allSquads.length - validSquads.length

writeFileSync(OUT_FILE, JSON.stringify(validSquads))

console.log(`Generated ${validSquads.length} squads (${dropped} dropped for insufficient position coverage)`)
console.log(`Historical (1970-2022): ${historical.length}, 2026: ${wc2026.length}`)
console.log(`Total players: ${validSquads.reduce((sum, s) => sum + s.players.length, 0)}`)
console.log(`Output: ${OUT_FILE}`)
