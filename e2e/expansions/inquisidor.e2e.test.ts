import { describe, it, beforeAll, afterEach, expect } from 'vitest';
import { GameClient } from '../helpers/GameClient';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

describe('Inquisidor Expansion E2E', () => {
    let clients: GameClient[];

    beforeAll(async () => {
        await new Promise((r) => setTimeout(r, 1000));
    });

    afterEach(() => {
        clients?.forEach(c => c.disconnect());
        clients = [];
    });

    it('Investigation flow: token holder can investigate and pass token', async () => {
        // Create 5 players with Inquisidor expansion
        clients = Array.from({ length: 5 }, (_, i) =>
            new GameClient(SERVER_URL, `Player${i + 1}`)
        );

        await Promise.all(clients.map(c => c.waitForConnection()));

        const roomId = await clients[0].createRoom(['inquisidor'], 5);
        await Promise.all(clients.slice(1).map(c => c.joinRoom(roomId)));
        await clients[0].startGame();

        // Get initial states
        let states = await Promise.all(clients.map(c => c.getState()));

        // Verify inquisitor state exists
        expect(states[0].inquisitorState).toBeTruthy();
        expect(states[0].inquisitorState.tokenHolder).toBeTruthy();

        // Play one mission to trigger investigation phase
        const leaderState = states.find(s => s.player.isLeader);
        const leaderClient = clients.find(c => c.playerId === leaderState?.player.playerId);

        if (leaderClient && leaderState) {
            // Select team
            const teamPlayers = states.map(s => s.player.id).slice(0, leaderState.missionSize);
            leaderClient.selectTeam(teamPlayers);

            await new Promise(r => setTimeout(r, 100));

            // All approve
            await Promise.all(clients.map(c => {
                c.submitVote(true);
                return Promise.resolve();
            }));

            await new Promise(r => setTimeout(r, 200));

            // Submit mission actions (all succeed)
            states = await Promise.all(clients.map(c => c.getState()));
            await Promise.all(states.map((state, i) => {
                if (state.selectedTeam?.includes(state.player.id)) {
                    clients[i].submitMissionAction(true);
                }
                return Promise.resolve();
            }));

            // Wait for investigation phase
            await new Promise(r => setTimeout(r, 300));

            states = await Promise.all(clients.map(c => c.getState()));

            // Should be in investigation phase
            expect(states[0].phase).toBe('INQUISITOR_INVESTIGATION');

            // Find token holder
            const tokenHolderId = states[0].inquisitorState.tokenHolder;
            const tokenHolderClient = clients.find(c => c.playerId === tokenHolderId);

            if (tokenHolderClient) {
                // Find another player to investigate
                const targetState = states.find(s => s.player.playerId !== tokenHolderId);

                if (targetState) {
                    // Investigate the target
                    tokenHolderClient.socket.emit('inquisitor:investigate', {
                        targetId: targetState.player.id
                    });

                    // Wait for investigation result
                    const result = await tokenHolderClient.waitForEvent('inquisitor:investigation-result');

                    // Verify result contains role information
                    expect(result.targetId).toBe(targetState.player.id);
                    expect(result.role).toMatch(/RESISTANCE|SPY/);

                    // Wait for token passed event
                    const tokenPassed = await Promise.race(
                        clients.map(c => c.waitForEvent('inquisitor:token-passed'))
                    );

                    expect(tokenPassed.newTokenHolder).toBe(targetState.player.id);

                    // End investigation
                    tokenHolderClient.socket.emit('inquisitor:end-investigation');

                    await new Promise(r => setTimeout(r, 200));

                    // Should go back to team selection
                    const finalStates = await Promise.all(clients.map(c => c.getState()));
                    expect(finalStates[0].phase).toBe('TEAM_SELECTION');
                }
            }
        }
    }, 30000);

    it.skip('Cannot investigate self', async () => {
        // TODO: Implement test
    });

    it.skip('Cannot investigate same player consecutively', async () => {
        // TODO: Implement test
    });

    it('Inquisidor state persists after reconnection', async () => {
        clients = Array.from({ length: 3 }, (_, i) =>
            new GameClient(SERVER_URL, `Player${i + 1}`)
        );

        await Promise.all(clients.map(c => c.waitForConnection()));

        const roomId = await clients[0].createRoom(['inquisidor'], 3);
        await Promise.all(clients.slice(1).map(c => c.joinRoom(roomId)));
        await clients[0].startGame();

        const states = await Promise.all(clients.map(c => c.getState()));
        const initialTokenHolder = states[0].inquisitorState.tokenHolder;

        // Simulate reconnection
        const reconnectClient = new GameClient(SERVER_URL, 'Player1');
        await reconnectClient.waitForConnection();
        await reconnectClient.joinRoom(roomId);

        const newState = await reconnectClient.getState();

        // Token holder should be the same (using UUID not socket.id)
        expect(newState.inquisitorState.tokenHolder).toBe(initialTokenHolder);

        reconnectClient.disconnect();
    }, 30000);
});
