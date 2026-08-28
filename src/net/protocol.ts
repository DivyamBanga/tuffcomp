import type { DraftPlayer } from '../game/draft'
import type { MatchAction, MatchConfig, MatchState } from '../game/match'

// Room codes avoid ambiguous glyphs (no O/0, I/1).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 4

export function makeRoomCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  }
  return code
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
}

// Peer ids are namespaced so codes can stay short.
export function peerIdForCode(code: string): string {
  return `tuffcomp-ringchasers-${code}`
}

export interface LobbySnapshot {
  code: string
  hostName: string
  players: DraftPlayer[]
  config: MatchConfig
}

// Everything on the wire. The host broadcasts full snapshots; guests send
// intents. Snapshots are small (tens of KB) so no delta logic is needed.
// TYPING is ephemeral flavor: the on-the-clock drafter's live keystrokes,
// relayed by the host so the whole room watches them think.
export type NetMessage =
  | { t: 'HELLO'; playerId: string; name: string }
  | { t: 'WELCOME'; playerId: string }
  | { t: 'REJECTED'; reason: string }
  | { t: 'SNAPSHOT'; lobby: LobbySnapshot; match: MatchState | null }
  | { t: 'ACTION'; action: MatchAction }
  | { t: 'TYPING'; playerId: string; text: string }
