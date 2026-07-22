export type Position =
  | 'GK'
  | 'CB'
  | 'LB'
  | 'RB'
  | 'CDM'
  | 'CM'
  | 'CAM'
  | 'LM'
  | 'RM'
  | 'LW'
  | 'RW'
  | 'ST'

export interface Attributes {
  pace: number
  shooting: number
  passing: number
  dribbling: number
  defending: number
  physical: number
}

export interface Player {
  id: string
  name: string
  nation: string
  club: string
  league: string
  year: number
  overall: number
  positions: Position[]
  attributes: Attributes
}

export interface Squad {
  id: string
  team: string
  year: number
  kind: 'nation' | 'club'
  players: Player[]
}
