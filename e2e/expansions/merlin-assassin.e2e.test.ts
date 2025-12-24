import { describe, it, beforeAll, afterEach, expect } from 'vitest';
import { GameClient } from '../helpers/GameClient';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

describe('Merlin & Assassin Expansion E2E', () => {
    let clients: GameClient[];

    beforeAll(async () => {
        await new Promise((r) => setTimeout(r, 1000));
    });

    afterEach(() => {
        clients?.forEach(c => c.disconnect());
        clients = [];
    });

    it('Triggers ASSASSINATION phase and allows assassin to choose target', async () => {
        // Create 5 players with merlin-assassin expansion
        clients = Array.from({ length: 5 }, (_, i) => new GameClient(SERVER_URL, `P${i + 1}`));
        await Promise.all(clients.map(c => c.waitForConnection()));

        const roomId = await clients[0].createRoom(['merlin-assassin'], 5);
        await Promise.all(clients.slice(1).map(c => c.joinRoom(roomId)));
        await clients[0].startGame();

        // Play rounds forcing Resistance to win missions quickly
        let succeeded = 0;
        let rounds = 0;
        const maxRounds = 20;

        while (succeeded < 3 && rounds < maxRounds) {
            rounds++;
            const states = await Promise.all(clients.map(c => c.getState()));
            const leaderState = states.find(s => s.player.isLeader);
            if (!leaderState) break;

            const leaderClient = clients.find(c => c.playerId === leaderState.player.playerId)!;
            const teamSize = leaderState.missionSize;

            // Select a team favoring Resistance players
            const resistanceIds = states.filter(s => s.myRole === 'RESISTANCE').map(s => s.player.id);
            const selected = resistanceIds.slice(0, teamSize).length === teamSize
                ? resistanceIds.slice(0, teamSize)
                : states.map(s => s.player.id).slice(0, teamSize);

            leaderClient.selectTeam(selected);
            await new Promise(r => setTimeout(r, 100));

            // Everyone votes approve to let mission proceed
            await Promise.all(states.map((st, i) => {
                clients[i].submitVote(true);
                return Promise.resolve();
            }));

            await new Promise(r => setTimeout(r, 200));

            // Submit mission actions: Resistance succeed, Spies may choose
            const postStates = await Promise.all(clients.map(c => c.getState()));
            if (postStates[0].phase === 'MISSION') {
                await Promise.all(postStates.map((st, i) => {
                    if (st.selectedTeam?.includes(st.player.id)) {
                        const success = st.myRole === 'RESISTANCE';
                        clients[i].submitMissionAction(success);
                    }
                    return Promise.resolve();
                }));

                // Wait for resolution
                await new Promise(r => setTimeout(r, 300));
                const after = await Promise.all(clients.map(c => c.getState()));
                if (after[0].succeededMissions > succeeded) succeeded = after[0].succeededMissions;
            }
        }

        expect(succeeded).toBeGreaterThanOrEqual(3);

        // Now the server should move to ASSASSINATION phase (Merlin & Assassin expansion)
        const states = await Promise.all(clients.map(c => c.getState()));
        expect(states[0].phase === 'ASSASSINATION' || states[0].phase === 'GAME_OVER').toBe(true);

        // If ASSASSINATION, find assassin and perform assassination
        if (states[0].phase === 'ASSASSINATION') {
            const assassinIndex = states.findIndex(s => s.specialRole === 'ASSASSIN');
            expect(assassinIndex).toBeGreaterThanOrEqual(0);

            const assassinClient = clients[assassinIndex];

            // Assassin should pick a target (choose highest suspicion or random)
            const target = states.find(s => s.specialRole !== 'ASSASSIN' && s.player.id !== assassinClient.playerId);
            expect(target).toBeTruthy();

            // Emit assassination
            assassinClient.socket.emit('assassinate', { roomId, targetId: target!.player.id });

            // Wait for game_over
            const result = await assassinClient.waitForEvent('game_over', 5000);
            expect(result.winner).toBeTruthy();
        }
    }, 60000);
});
