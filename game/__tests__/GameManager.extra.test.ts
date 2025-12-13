import { describe, it, expect } from 'vitest'
import { GameManager } from '../GameManager'

describe('GameManager', () => {
  it('creates and retrieves rooms', () => {
    const gm = new GameManager()
    const room = gm.createRoom(5, [])
    expect(room).toBeDefined()
    expect(gm.getRoom(room.id)).toBe(room)
  })

  it('removes rooms', () => {
    const gm = new GameManager()
    const room = gm.createRoom(5, [])
    expect(gm.getRoom(room.id)).toBe(room)
    gm.removeRoom(room.id)
    expect(gm.getRoom(room.id)).toBeUndefined()
  })

  it('installs known expansions when creating room', () => {
    const gm = new GameManager()
    // Use known expansion id 'blind-spies' which exists in AVAILABLE_EXPANSIONS
    const room = gm.createRoom(5, ['blind-spies'])
    expect(room.expansions).toContain('blind-spies')
  })

  it('installExpansions warns for unknown expansion ids but does not throw', () => {
    const gm = new GameManager()
    // Should not throw
    gm.installExpansions(['non-existent-expansion'], (null as unknown) as any)
    // No assertion beyond not throwing; ensure room creation still works afterwards
    const room = gm.createRoom(5, [])
    expect(room).toBeDefined()
  })
})
