import type { Position } from '../types'

export interface FormationSlot {
  id: string
  position: Position
}

export interface Formation {
  id: string
  name: string
  slots: FormationSlot[]
}

export const FORMATION_433: Formation = {
  id: '4-3-3',
  name: '4-3-3',
  slots: [
    { id: 'gk', position: 'GK' },
    { id: 'lb', position: 'LB' },
    { id: 'cb1', position: 'CB' },
    { id: 'cb2', position: 'CB' },
    { id: 'rb', position: 'RB' },
    { id: 'cdm', position: 'CDM' },
    { id: 'cm1', position: 'CM' },
    { id: 'cm2', position: 'CM' },
    { id: 'lw', position: 'LW' },
    { id: 'st', position: 'ST' },
    { id: 'rw', position: 'RW' },
  ],
}

export const FORMATION_442: Formation = {
  id: '4-4-2',
  name: '4-4-2',
  slots: [
    { id: 'gk', position: 'GK' },
    { id: 'lb', position: 'LB' },
    { id: 'cb1', position: 'CB' },
    { id: 'cb2', position: 'CB' },
    { id: 'rb', position: 'RB' },
    { id: 'lm', position: 'LM' },
    { id: 'cm1', position: 'CM' },
    { id: 'cm2', position: 'CM' },
    { id: 'rm', position: 'RM' },
    { id: 'st1', position: 'ST' },
    { id: 'st2', position: 'ST' },
  ],
}

export const FORMATIONS: Formation[] = [FORMATION_433, FORMATION_442]
