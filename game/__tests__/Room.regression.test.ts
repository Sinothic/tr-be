import { describe, it, expect } from 'vitest';
import { Room } from '../Room';
import { HookManager } from '../hooks/HookManager';

function createRoomWithPlayers(count: number) {
    const hookManager = new HookManager();
    const room = new Room('test-room', 5, [], hookManager);
    for (let i = 1; i <= count; i++) {
        room.addPlayer(`s${i}`, `player${i}`, `p${i}`);
    }
    return room;
}

describe('Room Regression Tests', () => {
    it('FIX: ensures votes from disconnected players are returned in resolveMission', async () => {
        const room = createRoomWithPlayers(5);

        // Select team (p1, p2) - Mission 1 for 5 players requires 2 team members
        const success = room.selectTeam(['s1', 's2']);
        expect(success).toBe(true);

        // Create actions:
        // p1: Success
        // p2: Fail (this player will disconnect)

        room.submitMissionAction('s1', true);
        room.submitMissionAction('s2', false);

        // Simulate p2 disconnecting: remove from socket mapping
        const p2 = room.getPlayerByPlayerId('p2');
        if (p2) {
            room.removePlayer(p2.id);
        }

        // Resolve mission
        const result = await room.resolveMission();

        // Logic should still work (failCount based on `missionActions` map which keys by `playerId`)
        expect(result.failCount).toBe(1);
        expect(result.success).toBe(false);

        // BUG REGRESSION CHECK: 
        // The votes map returned to client should contain ALL votes.
        // It must NOT exclude the disconnected player's vote.
        const returnedVotes = result.votes; // Map<socketId | playerId, boolean>

        // We expect 2 votes total (for the 2 mission members)
        expect(returnedVotes.size).toBe(2);

        // Ensure one of the keys is the playerId (since socketId is gone)
        expect(returnedVotes.has('p2')).toBe(true);
        expect(returnedVotes.get('p2')).toBe(false);
    });
});
