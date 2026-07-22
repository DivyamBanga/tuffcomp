import type { Position } from '../types'

export interface FormationSlot {
  id: string
  position: Position
  // Cosmetic role name shown on the pitch (LB, CB, CDM, ST, ...). Eligibility
  // is decided by `position` alone - the label is purely visual flavor so the
  // pitch still reads as a real 4-3-3 shape.
  label: string
}

export interface Formation {
  id: string
  name: string
  slots: FormationSlot[]
}

// The only supported formation. Real position data at the scale we draw from
// only distinguishes GK/DEF/MID/FWD (see scripts/generate-squads.mjs), so
// slot eligibility is broad even though the pitch still shows real roles.
export const FORMATION_433: Formation = {
  id: '4-3-3',
  name: '4-3-3',
  slots: [
    { id: 'gk', position: 'GK', label: 'GK' },
    { id: 'lb', position: 'DEF', label: 'LB' },
    { id: 'cb1', position: 'DEF', label: 'CB' },
    { id: 'cb2', position: 'DEF', label: 'CB' },
    { id: 'rb', position: 'DEF', label: 'RB' },
    { id: 'cdm', position: 'MID', label: 'CDM' },
    { id: 'cm1', position: 'MID', label: 'CM' },
    { id: 'cm2', position: 'MID', label: 'CM' },
    { id: 'lw', position: 'FWD', label: 'LW' },
    { id: 'st', position: 'FWD', label: 'ST' },
    { id: 'rw', position: 'FWD', label: 'RW' },
  ],
}

export const FORMATIONS: Formation[] = [FORMATION_433]
