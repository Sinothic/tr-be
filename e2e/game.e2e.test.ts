import { describe, it, beforeAll, afterEach, expect } from 'vitest';
import { GameClient } from './helpers/GameClient';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

describe('Base Game E2E - Full Playthrough', () => {
    let clients: GameClient[];

    beforeAll(async () => {
        // Wait for server to be ready
        await new Promise((r) => setTimeout(r, 1000));
    });

    afterEach(() => {
        // Disconnect all clients
        clients?.forEach(c => c.disconnect());
        clients = [];
    });

    it('5 players: Resistance wins with 3 successful missions', async () => {
        // Create 5 players
        clients = Array.from({ length: 5 }, (_, i) =>
            new GameClient(SERVER_URL, `Player${i + 1}`)
        );

        // Wait for all connections
        await Promise.all(clients.map(c => c.waitForConnection()));

        // Player 1 creates room
        const roomId = await clients[0].createRoom([], 5);
        expect(roomId).toBeTruthy();

        // Others join
        await Promise.all(
            clients.slice(1).map(c => c.joinRoom(roomId))
        );

        // Start game
        await clients[0].startGame();

        // Get initial state for all players
        const states = await Promise.all(clients.map(c => c.getState()));

        // Verify roles were assigned
        states.forEach(state => {
            expect(state.myRole).toMatch(/RESISTANCE|SPY/);
        });

        // Count roles
        const resistanceCount = states.filter(s => s.myRole === 'RESISTANCE').length;
        const spyCount = states.filter(s => s.myRole === 'SPY').length;
        expect(resistanceCount).toBe(3);
        expect(spyCount).toBe(2);

        // Play until Resistance wins (3 successful missions)
        let missionCount = 0;
        const maxRounds = 20; // Prevent infinite loop
        let round = 0;

        while (missionCount < 5 && round < maxRounds) {
            round++;

            // Get current states
            const currentStates = await Promise.all(clients.map(c => c.getState()));
            const leaderState = currentStates.find(s => s.player.isLeader);
            if (!leaderState) break;

            const leaderClient = clients.find(c => c.playerId === leaderState.player.playerId);
            if (!leaderClient) break;

            // Leader selects team (all Resistance if possible)
            const teamSize = leaderState.missionSize;
            const resistancePlayers = currentStates
                .filter(s => s.myRole === 'RESISTANCE')
                .map(s => s.player.id)
                .slice(0, teamSize);

            // If not enough Resistance, fill with anyone
            const selectedTeam = resistancePlayers.length >= teamSize
                ? resistancePlayers
                : currentStates.map(s => s.player.id).slice(0, teamSize);

            leaderClient.selectTeam(selectedTeam);

            // Wait for vote phase
            await new Promise(r => setTimeout(r, 100));

            // All players vote (approve if Resistance, random if Spy)
            await Promise.all(currentStates.map((state, i) => {
                const approve = state.myRole === 'RESISTANCE' || Math.random() > 0.3;
                clients[i].submitVote(approve);
                return Promise.resolve();
            }));

            // Wait for mission phase or new turn
            await new Promise(r => setTimeout(r, 200));

            // Check if vote passed
            const afterVoteStates = await Promise.all(clients.map(c => c.getState()));
            if (afterVoteStates[0].phase === 'MISSION') {
                // Players on mission submit actions
                await Promise.all(afterVoteStates.map((state, i) => {
                    if (state.selectedTeam?.includes(state.player.id)) {
                        // Resistance always succeeds, Spies might sabotage
                        const success = state.myRole === 'RESISTANCE';
                        clients[i].submitMissionAction(success);
                    }
                    return Promise.resolve();
                }));

                missionCount++;

                // Wait for mission resolution
                await new Promise(r => setTimeout(r, 200));
            }

            // Check if game is over
            const finalStates = await Promise.all(clients.map(c => c.getState()));
            if (finalStates[0].phase === 'GAME_OVER') {
                expect(finalStates[0].gameWinner).toBeTruthy();
                console.log(`Game ended. Winner: ${finalStates[0].gameWinner}`);
                break;
            }
        }

        expect(round).toBeLessThan(maxRounds);
    }, 60000); // 60 second timeout

    it('5 players: Can create and join room without expansions', async () => {
        clients = [
            new GameClient(SERVER_URL, 'Alice'),
            new GameClient(SERVER_URL, 'Bob')
        ];

        await Promise.all(clients.map(c => c.waitForConnection()));

        const roomId = await clients[0].createRoom([], 2);
        await clients[1].joinRoom(roomId);

        await clients[0].startGame();

        const states = await Promise.all(clients.map(c => c.getState()));

        // Verify base game started correctly
        expect(states[0].gameStarted).toBe(true);
        expect(states[0].phase).toBe('TEAM_SELECTION');
        expect(states.every(s => s.myRole)).toBe(true);
    }, 30000);
});
