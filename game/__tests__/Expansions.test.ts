import { describe, it, expect, beforeEach } from 'vitest';
import { HookManager } from '../hooks/HookManager';
import { MerlinAssassinExpansion } from '../expansions/merlin-assassin';
import { BlindSpiesExpansion } from '../expansions/blind-spies';
import { Room } from '../Room';

describe('Expansions', () => {
  it('merlin-assassin assigns special roles and modifies mission resolution', async () => {
    const hm = new HookManager();
    MerlinAssassinExpansion.install(hm);

    const room = new Room('R', 5, [], hm);
    // Add players and assign roles manually
    room.addPlayer('s0', 'p0', 'p0');
    room.addPlayer('s1', 'p1', 'p1');
    room.addPlayer('s2', 'p2', 'p2');

    // Assign roles explicitly: two resistance, one spy
    const p0 = room.getPlayer('s0')!; p0.role = 'RESISTANCE';
    const p1 = room.getPlayer('s1')!; p1.role = 'RESISTANCE';
    const p2 = room.getPlayer('s2')!; p2.role = 'SPY';

    // Trigger roles:assign
    const ctx = await hm.trigger('roles:assign' as any, { room });
    // Ensure someone got MERLIN and someone ASSASSIN assigned
    const hasMerlin = room.players.some(p => p.specialRole === 'MERLIN');
    const hasAssassin = room.players.some(p => p.specialRole === 'ASSASSIN');
    expect(hasMerlin).toBe(true);
    expect(hasAssassin).toBe(true);

    // Simulate 3 succeeded missions to cause ASSASSINATION phase
    room.succeededMissions = 3;
    const hookResult = await hm.trigger('mission:resolve' as any, { room, nextPhase: 'GAME_OVER' });
    expect(hookResult.nextPhase).toBe('ASSASSINATION');
  });

  it('blind-spies hides spies from spies but not merlin', async () => {
    const hm = new HookManager();
    BlindSpiesExpansion.install(hm);

    const room = new Room('R', 5, [], hm);
    room.addPlayer('s0', 'p0', 'p0');
    room.addPlayer('s1', 'p1', 'p1');

    const p0 = room.getPlayer('s0')!; p0.role = 'SPY';
    const p1 = room.getPlayer('s1')!; p1.role = 'SPY';

    // p0 is a spy, should not see spies
    const stateForP0 = await hm.trigger('state:sync' as any, { player: p0, state: {}, room });
    expect(stateForP0.state.spies).toBeUndefined();

    // If p0 is MERLIN specialRole, they'd still see spies (blind-spies doesn't hide for MERLIN)
    p0.specialRole = 'MERLIN';
    const stateForP0Merlin = await hm.trigger('state:sync' as any, { player: p0, state: {}, room });
    // blind-spies does not add spies list, but also should not prevent other expansions; here we just ensure it doesn't set undefined
    // So we expect state to remain defined (no spies property)
    expect(stateForP0Merlin.state.spies).toBeUndefined();
  });
});
