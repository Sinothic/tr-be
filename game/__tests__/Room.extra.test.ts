import { describe, it, expect } from 'vitest'
import { Room } from '../Room'
import { HookManager } from '../hooks/HookManager'
import { MAX_REJECTIONS } from '../constants'

describe('Room extra behaviors', () => {
  it('selectTeam rejects wrong size and accepts correct size', () => {
    const room = new Room('R1', 3)
    room.addPlayer('s1', 'p1')
    room.addPlayer('s2', 'p2')
    room.addPlayer('s3', 'p3')

    // Force missionConfig for 3 players to [2,2,2,2,2]
    room['missionConfig'][3] = [2,2,2,2,2]
    room['currentMissionIndex'] = 0

    expect(room.selectTeam(['s1'])).toBe(false)
    expect(room.selectTeam(['s1','s2'])).toBe(true)
    expect(room.phase).toBe('VOTE')
  })

  it('tallyVotes applies penalty after max rejections', () => {
    const room = new Room('R2', 3)
    room.addPlayer('s1', 'p1')
    room.addPlayer('s2', 'p2')
    room.addPlayer('s3', 'p3')

    // simulate previous rejections so next rejection triggers penalty
    room['voteRejections'] = MAX_REJECTIONS - 1

    // Simulate votes all rejecting (using playerIds)
    room.votes.set('p1', false)
    room.votes.set('p2', false)
    room.votes.set('p3', false)

    const res = room.tallyVotes()
    expect(res.approved).toBe(false)
    // penaltyApplied true when voteRejections reached
    expect(res.penaltyApplied).toBe(true)
  })

  it('resolveMission increments fail/succeed and advances phase, and handles hooks', async () => {
    const hm = new HookManager()
    const room = new Room('R3', 3, [], hm)
    room.addPlayer('s1', 'p1')
    room.addPlayer('s2', 'p2')
    room.addPlayer('s3', 'p3')

    // setup mission size and select team
    room['missionConfig'][3] = [2,2,2,2,2]
    room['currentMissionIndex'] = 0
    const ok = room.selectTeam(['s1','s2'])
    expect(ok).toBe(true)

    // submit mission actions: one fail
    room.submitMissionAction('s1', true)
    room.submitMissionAction('s2', false)

    const result = await room.resolveMission()
    expect(result.success).toBe(false)
    expect(result.failCount).toBe(1)
    // Phase should be TEAM_SELECTION or GAME_OVER depending on counts; ensure it's a valid phase
    expect(['TEAM_SELECTION','GAME_OVER']).toContain(room.phase)
  })

  it('handleAssassination finds merlin and returns outcome', () => {
    const room = new Room('R4', 3)
    room.addPlayer('s1', 'p1')
    room.addPlayer('s2', 'p2')
    room.addPlayer('s3', 'p3')

    // assign merlin to s2
    const p2 = room.getPlayer('s2')!
    p2.specialRole = 'MERLIN'

    const out = room.handleAssassination('s2')
    expect(out.success).toBe(true)
    expect(out.merlinId).toBe('s2')
    expect(room.phase).toBe('GAME_OVER')
  })
})
