import type { Formation } from '../engine/formations'

// Percentages within the pitch container. y runs from the goal line (near
// 100, own box) up to the edge of the attacking third (near 0).
type SlotCoordinates = Record<string, { x: number; y: number }>

const PITCH_LAYOUT: Record<string, SlotCoordinates> = {
  '4-3-3': {
    gk: { x: 50, y: 92 },
    lb: { x: 14, y: 72 },
    cb1: { x: 38, y: 80 },
    cb2: { x: 62, y: 80 },
    rb: { x: 86, y: 72 },
    cdm: { x: 50, y: 58 },
    cm1: { x: 30, y: 42 },
    cm2: { x: 70, y: 42 },
    lw: { x: 14, y: 18 },
    st: { x: 50, y: 10 },
    rw: { x: 86, y: 18 },
  },
  '4-4-2': {
    gk: { x: 50, y: 92 },
    lb: { x: 14, y: 72 },
    cb1: { x: 38, y: 80 },
    cb2: { x: 62, y: 80 },
    rb: { x: 86, y: 72 },
    lm: { x: 14, y: 42 },
    cm1: { x: 38, y: 46 },
    cm2: { x: 62, y: 46 },
    rm: { x: 86, y: 42 },
    st1: { x: 38, y: 12 },
    st2: { x: 62, y: 12 },
  },
}

export function slotCoordinates(formation: Formation, slotId: string): { x: number; y: number } {
  return PITCH_LAYOUT[formation.id]?.[slotId] ?? { x: 50, y: 50 }
}
