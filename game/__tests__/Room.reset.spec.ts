import { describe, it, expect } from 'vitest';
import { Room } from '../Room';
import { HookManager } from '../hooks/HookManager';
import { MIN_PLAYERS } from '../constants';

function createRoomWithPlayers(count: number) {
    const hookManager = new HookManager();
    const room = new Room('test-room', MIN_PLAYERS, [], hookManager);
    for (let i = 1; i <= count; i++) {
        room.addPlayer(`s${i}`, `player${i}`, `p${i}`);
    }
    return { room, hookManager };
}

describe('Room.resetGame', () => {
    it('resets all counters and game state', async () => {
        const { room } = createRoomWithPlayers(5);
        await room.startGame();

        // Advance game state
        room.succeededMissions = 2;
        room.failedMissions = 1;
        room.currentMissionIndex = 3;
        room.voteRejections = 2;
        room.missionHistory = [
            { success: true, failCount: 0 },
            { success: true, failCount: 0 },
            { success: false, failCount: 1 }
        ];
        room.selectedTeam = ['p1', 'p2'];
        room.votes.set('p1', true);
        room.missionActions.set('p1', true);
        room.assassinationTarget = 'p3';

        // Verify state is "dirty"
        expect(room.succeededMissions).toBe(2);
        expect(room.missionHistory.length).toBe(3);

        // Perform reset
        await room.resetGame();

        // Verify state is clean
        expect(room.succeededMissions).toBe(0);
        expect(room.failedMissions).toBe(0);
        expect(room.currentMissionIndex).toBe(0);
        expect(room.voteRejections).toBe(0);
        expect(room.missionHistory).toEqual([]);
        expect(room.selectedTeam).toEqual([]);
        expect(room.votes.size).toBe(0);
        expect(room.missionActions.size).toBe(0);
        expect(room.assassinationTarget).toBeNull();

        // Phase should be TEAM_SELECTION (as startGame was called internally)
        expect(room.phase).toBe('TEAM_SELECTION');

        // Roles should be assigned
        expect(room.players[0].role).toBeDefined();
    });
});
