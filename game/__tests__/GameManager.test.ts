import { GameManager } from '../GameManager'

import { MIN_PLAYERS } from '../constants'

describe('GameManager', () => {
  let gameManager: GameManager

  beforeEach(() => {
    gameManager = new GameManager()
  })

  it('should create a room with default settings', () => {
    const room = gameManager.createRoom()
    expect(room).toBeDefined()
    expect(room.id).toBeDefined()
    expect(room.minPlayers).toBe(MIN_PLAYERS)
  })

  it('should create a room with custom minPlayers', () => {
    const room = gameManager.createRoom(3)
    expect(room.minPlayers).toBe(3)
  })

  it('should get a room by id', () => {
    const room = gameManager.createRoom()
    const retrieved = gameManager.getRoom(room.id)
    expect(retrieved).toBe(room)
  })

  it('should return undefined for non-existent room', () => {
    const retrieved = gameManager.getRoom('NONEXISTENT')
    expect(retrieved).toBeUndefined()
  })

  it('should generate unique room ids', () => {
    const room1 = gameManager.createRoom()
    const room2 = gameManager.createRoom()
    expect(room1.id).not.toBe(room2.id)
  })
})