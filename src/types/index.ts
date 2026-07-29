export type Pos = 'PG' | 'SG' | 'SF' | 'PF' | 'C'

export type Tier = 'GOAT' | 'SUPERSTAR' | 'ALLSTAR' | 'STARTER' | 'ROTATION'

export interface CardStats {
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  fg: number
  tp: number
}

// Six 25-99 attributes, era-relative percentiles within the card's season:
// sc scoring, sh outside shooting, pm playmaking, rb rebounding,
// df overall defense, rm rim protection.
export interface CardAttrs {
  sc: number
  sh: number
  pm: number
  rb: number
  df: number
  rm: number
}

// One real player-season (e.g. '91 Jordan). The unit you draft.
export interface Card {
  id: string
  pid: string
  name: string
  season: number
  teams: string[]
  pos: Pos
  pos2: Pos | null
  age: number | null
  ovr: number
  usg: number
  mpg: number
  photo: number | null
  hof: boolean
  stats: CardStats
  attrs: CardAttrs
  tier: Tier
}

export const TIERS: Tier[] = ['GOAT', 'SUPERSTAR', 'ALLSTAR', 'STARTER', 'ROTATION']
export const POSITIONS: Pos[] = ['PG', 'SG', 'SF', 'PF', 'C']

export function headshotUrl(card: Card): string | null {
  return card.photo === null
    ? null
    : `https://cdn.nba.com/headshots/nba/latest/1040x760/${card.photo}.png`
}
