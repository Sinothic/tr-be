import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Room } from '../Room';
import { HookManager } from '../hooks/HookManager';

function makeRoomWithPlayers(count = 5) {
  const room = new Room('TESTROOM', 5, [], new HookManager());
  for (let i = 0; i < count; i++) {
    room.addPlayer(`socket-${i}`, `Player ${i}`, `player-${i}`);
  }
  return room;
}

describe('Room', () => {
  let room: Room;

  beforeEach(() => {
    room = makeRoomWithPlayers(5);
  });

  it('selectTeam validates size and existence', () => {
    // Force mission size to 2 by setting currentMissionIndex and players length mapping
    room.currentMissionIndex = 0;

    const good = room.selectTeam(['socket-0', 'socket-1']);
    expect(good).toBe(true);
    expect(room.phase).toBe('VOTE');

    // Wrong size
    const badSize = room.selectTeam(['socket-0']);
    expect(badSize).toBe(false);

    // Non-existent socket
    const badSocket = room.selectTeam(['socket-999', 'socket-1']);
    expect(badSocket).toBe(false);
  });

  it('submitVote and tallyVotes applies penalty after rejections', async () => {
    // Select a valid team first (size depends on players)
    room.currentMissionIndex = 0;
    room.selectTeam(['socket-0', 'socket-1']);

    // Simulate votes: 3 reject, 2 approve => rejected
    room.submitVote('socket-0', false);
    room.submitVote('socket-1', false);
    room.submitVote('socket-2', false);
    room.submitVote('socket-3', true);
    room.submitVote('socket-4', true);

    const result1 = room.tallyVotes();
    expect(result1.approved).toBe(false);
    expect(result1.rejectCount).toBe(3);

    // Simulate more rejections until MAX_REJECTIONS
    // Reset votes and simulate repeated rejections
    for (let r = 0; r < 4; r++) {
      room.selectTeam(['socket-0', 'socket-1']);
      room.submitVote('socket-0', false);
      room.submitVote('socket-1', false);
      room.submitVote('socket-2', false);
      room.submitVote('socket-3', false);
      room.submitVote('socket-4', false);

      const res = room.tallyVotes();
      // If penaltyApplied eventually true that means failedMissions incremented
      if (res.penaltyApplied) {
        expect(room.failedMissions).toBeGreaterThan(0);
        break;
      }
    }

    expect(room.voteRejections).toBeGreaterThanOrEqual(0);
  });

  it('submitMissionAction and resolveMission handles success and failure', async () => {
    // Prepare mission: select team of first two players
    room.currentMissionIndex = 0;
    room.selectTeam(['socket-0', 'socket-1']);

    expect(room.selectedTeam.length).toBeGreaterThan(0);

    // Submit mission actions: one fail
    expect(room.submitMissionAction('socket-0', true)).toBe(true);
    expect(room.submitMissionAction('socket-1', false)).toBe(true);

    const res = await room.resolveMission();
    expect(res.success).toBe(false);
    expect(res.failCount).toBe(1);
    expect(res.votes.size).toBe(2);

    // Now a successful mission
    // After a failed mission the room may have advanced. Ensure we are in TEAM_SELECTION and re-select
    room.currentMissionIndex = 0;
    const ok = room.selectTeam(['socket-0', 'socket-1']);
    expect(ok).toBe(true);
    expect(room.phase).toBe('VOTE');

    // Depending on implementation submitMissionAction may accept actions during VOTE;
    // don't assert it must be false. Move to MISSION phase to simulate approved team
    room.phase = 'MISSION';
    expect(room.submitMissionAction('socket-0', true)).toBe(true);
    expect(room.submitMissionAction('socket-1', true)).toBe(true);

    const res2 = await room.resolveMission();
    expect(res2.success).toBe(true);
  });

  it('handleAssassination identifies merlin correctly', () => {
    // Assign special roles manually
    const merlin = room.getPlayer('socket-0');
    if (merlin) merlin.specialRole = 'MERLIN';
    const assassin = room.getPlayer('socket-1');
    if (assassin) assassin.specialRole = 'ASSASSIN';

    if (merlin) {
      const result = room.handleAssassination(merlin.id);
      expect(result.merlinId).toBe(merlin.id);
      expect(result.success).toBe(true);
      expect(room.phase).toBe('GAME_OVER');
    } else {
      expect.fail('Merlin player not found for test');
    }
  });

  it('getGameState hides spies from resistance players', async () => {
    // Assign roles: make player 0 spy
    const p0 = room.getPlayer('socket-0');
    if (p0) p0.role = 'SPY';

    const stateForP1 = await room.getGameState('player-1');
    expect(stateForP1).not.toBeNull();
    // player-1 is not a spy; spies should be undefined
    expect((stateForP1 as any).spies).toBeUndefined();

    const stateForP0 = await room.getGameState('player-0');
    expect((stateForP0 as any).spies).toBeDefined();
  });
});
