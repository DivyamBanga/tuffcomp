// Downloads the raw data that scripts/generate-players.mjs transforms into
// src/data/players.json. Output lands in scripts/raw-data/ (gitignored -
// large and regenerable).
//
// Sources:
//   - github.com/sumitrodatta/bball-reference-datasets - historical NBA
//     player statistics CSVs derived from Basketball Reference (the GitHub
//     home of the Kaggle "NBA Stats 1947-present" dataset)
//   - github.com/swar/nba_api - static player index (NBA person ids), used
//     only to map players to official NBA headshot photo ids
//
// Run with: npm run data:fetch

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, 'raw-data')

const BBREF_BASE = 'https://raw.githubusercontent.com/sumitrodatta/bball-reference-datasets/master/Data'

const FILES = {
  'player-per-game.csv': `${BBREF_BASE}/Player%20Per%20Game.csv`,
  'advanced.csv': `${BBREF_BASE}/Advanced.csv`,
  'player-career-info.csv': `${BBREF_BASE}/Player%20Career%20Info.csv`,
  'player-award-shares.csv': `${BBREF_BASE}/Player%20Award%20Shares.csv`,
  'all-star-selections.csv': `${BBREF_BASE}/All-Star%20Selections.csv`,
  'team-abbrev.csv': `${BBREF_BASE}/Team%20Abbrev.csv`,
  'draft-pick-history.csv': `${BBREF_BASE}/Draft%20Pick%20History.csv`,
  'nba-player-index.py': 'https://raw.githubusercontent.com/swar/nba_api/master/src/nba_api/stats/library/data.py',
}

mkdirSync(OUT_DIR, { recursive: true })

for (const [filename, url] of Object.entries(FILES)) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  writeFileSync(join(OUT_DIR, filename), await response.text())
  console.log(`Fetched ${filename}`)
}
