import { describe, it, expect, beforeEach } from 'vitest';
import { Room } from '../Room';
import { HookManager } from '../hooks/HookManager';
import { MAX_REJECTIONS, MISSIONS_TO_FAIL, MISSIONS_TO_SUCCEED } from '../constants';

function createRoomWithPlayers(count: number, minPlayers?: number) {
  const hookManager = new HookManager();
  const room = new Room('room1', minPlayers, [], hookManager);
  for (let i = 1; i <= count; i++) {
    room.addPlayer(`s${i}`, `player${i}`, `p${i}`);
  }
  return { room, hookManager };
}

describe('Room core behaviors', () => {
  it('selectTeam validates team size and players', () => {
    const { room } = createRoomWithPlayers(3);
    // For 3 players mission size should be 2 (see constants)
    const size = room.getCurrentMissionSize();
    expect(size).toBeGreaterThan(0);

    // Wrong size
    const okWrong = room.selectTeam(['s1']);
    expect(okWrong).toBe(false);

    // Non-existent player
    const okInvalid = room.selectTeam(['s1', 's9']);
    expect(okInvalid).toBe(false);

    // Correct
    const ok = room.selectTeam(['s1', 's2']);
    expect(ok).toBe(true);
    expect(room.phase).toBe('VOTE');
  });

  it('submitMissionAction validates membership and socket mapping', () => {
    const { room } = createRoomWithPlayers(3);
    // No team selected
    expect(room.submitMissionAction('s1', true)).toBe(false);

    // Select team then submit
    room.selectTeam(['s1', 's2']);
    expect(room.submitMissionAction('s1', true)).toBe(true);
    expect(room.submitMissionAction('s2', false)).toBe(true);

    // Unknown socket
    expect(room.submitMissionAction('fake', true)).toBe(false);
  });

  it('tallyVotes approves path sets MISSION phase and clears votes', () => {
    const { room } = createRoomWithPlayers(3);
    room.selectTeam(['s1', 's2']);
    // Submit votes: two approves, one reject => approved
    room.submitVote('s1', true);
    room.submitVote('s2', true);
    room.submitVote('s3', false);

    const res = room.tallyVotes();
    expect(res.approved).toBe(true);
    expect(res.approveCount).toBe(2);
    expect(room.phase).toBe('MISSION');
    expect(room.voteRejections).toBe(0);
  });

  it('tallyVotes rejection increments voteRejections and advances leader when below max', () => {
    const { room } = createRoomWithPlayers(4);
    room.selectTeam(['s1', 's2']);
    room.submitVote('s1', false);
    room.submitVote('s2', false);
    room.submitVote('s3', false);
    room.submitVote('s4', true); // 3 reject,1 approve => rejected

    const beforeLeader = room.currentLeaderIndex;
    const res = room.tallyVotes();
    expect(res.approved).toBe(false);
    expect(room.voteRejections).toBe(1);
    // after a single rejection it should have called nextTurn
    expect(room.phase).toBe('TEAM_SELECTION');
    expect(room.currentLeaderIndex).not.toBe(beforeLeader);
  });

  it('tallyVotes applies penalty when reaching MAX_REJECTIONS', () => {
    const { room } = createRoomWithPlayers(5);
    room.voteRejections = MAX_REJECTIONS - 1;
    room.selectTeam(['s1', 's2']);
    // All reject
    room.submitVote('s1', false);
    room.submitVote('s2', false);
    room.submitVote('s3', false);
    room.submitVote('s4', false);
    room.submitVote('s5', false);

    const res = room.tallyVotes();
    expect(res.penaltyApplied).toBe(true);
    // After 5 rejections, game should end immediately with Spy win
    expect(room.phase).toBe('GAME_OVER');
    expect(room.getWinner()).toBe('SPY');
    expect(room.voteRejections).toBe(0); // Reset to 0 after game over
  });

  it('resolveMission counts fails and allows hook to override nextPhase', async () => {
    const { room, hookManager } = createRoomWithPlayers(5);
    // Prepare a selected team and mission actions
    room.selectTeam(['s1', 's2']);
    // s1 succeeds, s2 fails
    room.submitMissionAction('s1', true);
    room.submitMissionAction('s2', false);

    // Register a hook that forces GAME_OVER
    hookManager.register('mission:resolve', async (ctx) => {
      return { ...ctx, nextPhase: 'GAME_OVER' } as any;
    });

    const result = await room.resolveMission();
    expect(result.success).toBe(false);
    expect(result.failCount).toBe(1);
    // Hook should have overridden the phase
    expect(room.phase).toBe('GAME_OVER');
  });

  it('getGameState returns null for unknown player and allows state:sync to modify', async () => {
    const { room, hookManager } = createRoomWithPlayers(3);
    const unknown = await room.getGameState('no-such');
    expect(unknown).toBeNull();

    // Register state:sync hook to add a custom field
    hookManager.register('state:sync', async (ctx) => {
      const state = ctx.state || {};
      state.__custom = 'hello';
      return { ...ctx, state } as any;
    });

    const state = await room.getGameState('p1');
    expect(state).toBeTruthy();
    // Hook should have added custom field
    expect((state as any).__custom).toBe('hello');
  });

  it('handleAssassination and getWinner logic', () => {
    const { room } = createRoomWithPlayers(3);
    // Assign special roles
    const p1 = room.getPlayer('s1')!;
    const p2 = room.getPlayer('s2')!;
    p1.specialRole = 'MERLIN';
    p2.specialRole = 'ASSASSIN';

    // Wrong guess
    const miss = room.handleAssassination('s3');
    expect(miss.success).toBe(false);
    expect(room.phase).toBe('GAME_OVER');
    // getWinner should consider assassinationTarget and merlin (miss => no immediate spy win)
    expect(room.getWinner()).toBeNull();

    // Reset and test merlin death path
    const { room: room2 } = createRoomWithPlayers(3);
    const rp1 = room2.getPlayer('s1')!;
    const rp2 = room2.getPlayer('s2')!;
    rp1.specialRole = 'MERLIN';
    rp2.specialRole = 'ASSASSIN';
    // Assassin selects the merlin
    const hit = room2.handleAssassination(rp1.id);
    expect(hit.success).toBe(true);
    expect(room2.getWinner()).toBe('SPY');
  });

  it('getWinner returns correct results for mission counts when game over', () => {
    const { room } = createRoomWithPlayers(3);
    room.phase = 'GAME_OVER';

    room.succeededMissions = MISSIONS_TO_SUCCEED;
    expect(room.getWinner()).toBe('RESISTANCE');

    room.succeededMissions = 0;
    room.failedMissions = MISSIONS_TO_FAIL;
    expect(room.getWinner()).toBe('SPY');

    // No decisive winner
    room.failedMissions = 0;
    expect(room.getWinner()).toBeNull();
  });

  it('getSelectedTeamSocketIds and getRevealedVotes mapping', () => {
    const { room } = createRoomWithPlayers(4);
    room.selectTeam(['s1', 's2']);
    // Votes using player socket ids
    room.submitVote('s1', true);
    room.submitVote('s3', false);

    const sel = room.getSelectedTeamSocketIds();
    expect(Array.isArray(sel)).toBe(true);
    expect(sel.length).toBe(2);

    const revealed = room.getRevealedVotes();
    // Should have socket keys (s1 and s3)
    expect(revealed['s1']).toBe(true);
    expect(revealed['s3']).toBe(false);
  });
});
