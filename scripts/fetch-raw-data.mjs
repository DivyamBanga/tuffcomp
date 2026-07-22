// Downloads the raw CSVs that scripts/generate-squads.mjs transforms into
// src/data/squads.json. Not committed (scripts/raw-data/ is gitignored) -
// run this once before running generate-squads.mjs.
//
// Run with: node scripts/fetch-raw-data.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, 'raw-data')

const FILES = {
  'squads.csv': 'https://raw.githubusercontent.com/jfjelstul/worldcup/master/data-csv/squads.csv',
  'goals.csv': 'https://raw.githubusercontent.com/jfjelstul/worldcup/master/data-csv/goals.csv',
  'award_winners.csv': 'https://raw.githubusercontent.com/jfjelstul/worldcup/master/data-csv/award_winners.csv',
  'player_appearances.csv':
    'https://raw.githubusercontent.com/jfjelstul/worldcup/master/data-csv/player_appearances.csv',
  'wc2026_squads.csv':
    'https://raw.githubusercontent.com/mominullptr/FIFA-World-Cup-2026-Dataset/main/squads_and_players.csv',
  'wc2026_teams.csv': 'https://raw.githubusercontent.com/mominullptr/FIFA-World-Cup-2026-Dataset/main/teams.csv',
}

mkdirSync(OUT_DIR, { recursive: true })

for (const [filename, url] of Object.entries(FILES)) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  writeFileSync(join(OUT_DIR, filename), await response.text())
  console.log(`Fetched ${filename}`)
}
