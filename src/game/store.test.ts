import { beforeAll, describe, expect, it } from 'vitest'
import { cpuChoose } from './draft'
import { CHASE_GAMES } from './match'
import { useGame } from './store'

// Drives a complete solo chase through the real zustand store - the same
// code path the UI uses - as an end-to-end smoke test without a browser.
describe('store: full chase run', () => {
  beforeAll(() => {
    useGame.setState({ myName: 'TESTER' })
  })

  it('plays draft -> preview -> 82 games -> record', async () => {
    const store = () => useGame.getState()

    await store().startSolo('grid')
    expect(store().screen).toBe('game')
    expect(store().match!.phase).toBe('draft')
    expect(store().match!.draft!.theme).not.toBeNull()

    // Human turns via the same dispatch the UI buttons call.
    let guard = 0
    while (store().match!.phase === 'draft' && guard++ < 20) {
      const draft = store().match!.draft!
      expect(draft.order[draft.pickIndex]).toBe(store().myId)
      store().dispatch({ type: 'DRAFT', action: cpuChoose(draft) })
    }
    expect(store().match!.phase).toBe('preview')
    // The chase generates a full slate of opposition.
    expect(store().match!.entries.filter((e) => e.isFiller).length).toBeGreaterThan(4)

    store().dispatch({ type: 'BEGIN_COMPETITION' })
    expect(store().match!.phase).toBe('season')
    expect(store().match!.season!.schedule.length).toBe(CHASE_GAMES)

    guard = 0
    while (store().match!.phase !== 'done' && guard++ < CHASE_GAMES + 5) {
      store().dispatch({ type: 'SIM_NEXT' })
    }
    expect(store().match!.phase).toBe('done')

    const match = store().match!
    const myRow = match.season!.standings.find((r) => r.teamId === store().myId)!
    expect(myRow.wins + myRow.losses).toBe(CHASE_GAMES)
    // A perfect run takes the ring; anything else just posts the record.
    if (myRow.losses === 0) expect(match.championId).toBe(store().myId)
    else expect(match.championId).toBeNull()

    store().goHome()
    expect(store().screen).toBe('home')
    expect(store().match).toBeNull()
  })
})
