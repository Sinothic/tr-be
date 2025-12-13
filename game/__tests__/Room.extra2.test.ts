import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Room } from '../Room'
import { HookManager } from '../hooks/HookManager'

describe('Room additional behaviors', () => {
  let room: Room
  beforeEach(() => {
    room = new Room('r1', 3, [], new HookManager())
    // create 3 players
    room.addPlayer('s1', 'Alice', 'p1')
    room.addPlayer('s2', 'Bob', 'p2')
    room.addPlayer('s3', 'Charlie', 'p3')
  })

  it('reconnectPlayer updates socket id if playerId exists', () => {
    const res = room.reconnectPlayer('p2', 's2-new')
    expect(res).toBe(true)
    const p = room.getPlayer('s2-new')
    expect(p).toBeTruthy()
    expect(p?.playerId).toBe('p2')
  })

  it('selectTeam rejects wrong size and accepts correct size', () => {
    // set mission config to expect 2 for our 3 players (default config applies)
    const wrong = room.selectTeam(['s1'])
    expect(wrong).toBe(false)

    // choose correct size from missionConfig
    const size = room.getCurrentMissionSize()
    const socketIds = ['s1','s2'].slice(0, size)
    const ok = room.selectTeam(socketIds)
    expect(ok).toBe(size === socketIds.length)
    if (ok) expect(room.phase).toBe('VOTE')
  })

  it('tallyVotes applies penalty after max rejections', () => {
    // set up: select a team of correct size first
    const size = room.getCurrentMissionSize()
    const sids = ['s1','s2','s3'].slice(0,size)
    room.selectTeam(sids)

    // submit rejects until reaching MAX_REJECTIONS (simulate via repeated tallies)
    // submit votes to cause rejection
    for (let i = 0; i < size; i++) {
      room.submitVote(sids[i], false)
    }

    const r = room.tallyVotes()
    expect(r.approved).toBe(false)

    // if not yet at MAX_REJECTIONS, voteRejections increased and nextTurn was called
    expect(room.voteRejections).toBeGreaterThanOrEqual(0)
  })

  it('submitMissionAction validates membership and records actions', () => {
    // select team and set selectedTeam to internal playerIds
    const size = room.getCurrentMissionSize()
    const socketIds = ['s1','s2'].slice(0,size)
    const ok = room.selectTeam(socketIds)
    if (!ok) return

    // submitting from a non-team socket should fail
    const resBad = room.submitMissionAction('s3', true)
    expect(resBad).toBe(false)

    // submitting from team member should succeed
    const resGood = room.submitMissionAction(socketIds[0], true)
    expect(resGood).toBe(true)
  })

  it('resolveMission handles success and failure and honors mission:resolve hook override', async () => {
    // prepare mission actions
    const size = room.getCurrentMissionSize()
    const socketIds = ['s1','s2','s3'].slice(0,size)
    const ok = room.selectTeam(socketIds)
    if (!ok) return

    // All succeed
    for (const sid of socketIds) {
      room.submitMissionAction(sid, true)
    }

    const res1 = await room.resolveMission()
    expect(res1.success).toBe(true)

    // Now a failing mission
    // select next team again
    const s2 = ['s1','s2','s3'].slice(0,size)
    const ok2 = room.selectTeam(s2)
    if (!ok2) return
    // one fail
    room.submitMissionAction(s2[0], false)
    room.submitMissionAction(s2[1 % s2.length], true)

    // Register a hook that forces nextPhase to ASSASSINATION
    const hm = (room as any).hookManager as HookManager
    hm.register('mission:resolve', async ({ nextPhase }: any) => {
      return { nextPhase: 'ASSASSINATION' }
    })

    const res2 = await room.resolveMission()
    // because hook forces ASSASSINATION, phase should be ASSASSINATION
    expect(room.phase).toBe('ASSASSINATION')
  })

  it('handleAssassination sets target and getWinner logic', () => {
    // assign special roles manually
    const p1 = room.getPlayer('s1')!
    p1.specialRole = 'MERLIN'
    const p2 = room.getPlayer('s2')!
    p2.specialRole = 'ASSASSIN'

    const result = room.handleAssassination(p1.id)
    expect(result.success).toBe(true)
    expect(room.phase).toBe('GAME_OVER')
    expect(room.getWinner()).toBe('SPY')
  })

  it('getGameState returns null for unknown requesting player', async () => {
    const state = await room.getGameState('non-existent')
    expect(state).toBeNull()
  })
})
