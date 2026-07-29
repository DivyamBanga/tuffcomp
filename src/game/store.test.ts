import { beforeAll, describe, expect, it } from 'vitest'
import { cpuChoose } from './draft'
import { useGame } from './store'

// Drives a complete solo game through the real zustand store - the same code
// path the UI uses - as an end-to-end smoke test without a browser.
describe('store: full solo run', () => {
  beforeAll(() => {
    useGame.setState({ myName: 'TESTER' })
  })

  it('plays home -> setup -> draft -> preview -> season -> playoffs -> champion', async () => {
    const store = () => useGame.getState()

    store().goSetup('solo')
    expect(store().screen).toBe('setup')
    store().setConfig({ mode: 'tiers', format: 'season', leagueSize: 4 })
    store().setCpuDrafters(1)

    await store().startSolo()
    expect(store().screen).toBe('game')
    expect(store().match!.phase).toBe('draft')

    // Human turns via the same dispatch the UI buttons call; CPU turns
    // auto-run inside the reducer.
    let guard = 0
    while (store().match!.phase === 'draft' && guard++ < 40) {
      const draft = store().match!.draft!
      const turn = draft.order[draft.pickIndex]
      expect(turn).toBe(store().myId) // CPU turns should never surface
      store().dispatch({ type: 'DRAFT', action: cpuChoose(draft) })
    }
    expect(store().match!.phase).toBe('preview')
    expect(store().match!.entries.length).toBe(4)

    store().dispatch({ type: 'BEGIN_COMPETITION' })
    expect(store().match!.phase).toBe('season')

    guard = 0
    while (store().match!.phase !== 'done' && guard++ < 300) {
      store().dispatch({ type: 'SIM_NEXT' })
    }
    expect(store().match!.phase).toBe('done')
    expect(store().match!.championId).not.toBeNull()
    expect(store().trophySaved).toBe(true)
    expect(store().trophies.length).toBeGreaterThan(0)

    store().goHome()
    expect(store().screen).toBe('home')
    expect(store().match).toBeNull()
  })
})
