import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameManager } from '../game/GameManager';
import { MockSocket, MockIO } from './helpers/MockSocket';
import { AVAILABLE_EXPANSIONS } from '../game/expansions';

describe('Game Integration Tests - Using Real Server Code', () => {
    let gameManager: GameManager;
    let mockIO: MockIO;
    let sockets: MockSocket[];

    beforeEach(() => {
        gameManager = new GameManager();
        mockIO = new MockIO();
        sockets = [];
    });

    afterEach(() => {
        mockIO.cleanup();
        sockets = [];
    });

    it('Creates room and assigns roles correctly (5 players)', async () => {
        // Create room with real GameManager
        const room = gameManager.createRoom(5, [], mockIO);

        // Create 5 mock sockets (simulating players)
        for (let i = 0; i < 5; i++) {
            const socket = mockIO.createSocket(`socket${i}`);
            sockets.push(socket);

            // Add player using real Room code
            room.addPlayer(socket.id, `Player${i + 1}`, `uuid${i + 1}`);
            socket.join(room.id);
        }

        // Start game using real Room code
        await room.startGame();

        // Verify roles were assigned correctly
        const spies = room.players.filter(p => p.role === 'SPY');
        const resistance = room.players.filter(p => p.role === 'RESISTANCE');

        expect(spies.length).toBe(2);
        expect(resistance.length).toBe(3);
        expect(room.phase).toBe('TEAM_SELECTION');
    });

    it('Full game flow: team selection -> voting -> mission', async () => {
        // Setup
        const room = gameManager.createRoom(5, [], mockIO);
        for (let i = 0; i < 5; i++) {
            const socket = mockIO.createSocket(`socket${i}`);
            sockets.push(socket);
            room.addPlayer(socket.id, `Player${i + 1}`, `uuid${i + 1}`);
            socket.join(room.id);
        }
        await room.startGame();

        // Find leader
        const leader = room.players.find(p => p.isLeader);
        expect(leader).toBeTruthy();

        // Leader selects team
        const teamSize = room.getCurrentMissionSize();
        const selectedTeam = room.players.slice(0, teamSize).map(p => p.id);
        const success = room.selectTeam(selectedTeam);
        expect(success).toBe(true);
        expect(room.phase).toBe('VOTE');

        // All players vote
        sockets.forEach(socket => {
            room.submitVote(socket.id, true);
        });

        // Tally votes
        const voteResult = room.tallyVotes();
        expect(voteResult.approved).toBe(true);
        expect(room.phase).toBe('MISSION');

        // Players on mission submit actions
        selectedTeam.forEach(playerId => {
            room.submitMissionAction(playerId, true);
        });

        // Resolve mission
        const missionResult = await room.resolveMission();
        expect(missionResult.success).toBe(true);
        expect(room.succeededMissions).toBe(1);
    });

    it('Inquisidor expansion: Investigation with real handlers', async () => {
        // Create room with Inquisidor expansion
        const room = gameManager.createRoom(5, ['inquisidor'], mockIO);

        // Create mock sockets
        for (let i = 0; i < 5; i++) {
            const socket = mockIO.createSocket(`socket${i}`);
            sockets.push(socket);

            // Register expansion handlers on THIS socket (simulating what index.ts does)
            const expansion = AVAILABLE_EXPANSIONS['inquisidor'];
            if (expansion && expansion.registerSocketHandlers) {
                expansion.registerSocketHandlers(socket as any, room, mockIO as any);
            }

            room.addPlayer(socket.id, `Player${i + 1}`, `uuid${i + 1}`);
            socket.join(room.id);
        }

        await room.startGame();

        // Verify inquisitor state was initialized
        expect((room as any).inquisitorState).toBeTruthy();
        expect((room as any).inquisitorState.tokenHolder).toBeTruthy();

        // Play one mission to get to investigation phase
        const leader = room.players.find(p => p.isLeader)!;
        const teamSize = room.getCurrentMissionSize();
        const team = room.players.slice(0, teamSize).map(p => p.id);

        room.selectTeam(team);
        sockets.forEach(s => room.submitVote(s.id, true));
        room.tallyVotes();
        team.forEach(id => room.submitMissionAction(id, true));
        await room.resolveMission();

        // Should be in investigation phase
        expect(room.phase).toBe('INQUISITOR_INVESTIGATION');

        // Find token holder socket
        const tokenHolderId = (room as any).inquisitorState.tokenHolder;
        const tokenHolder = room.players.find(p => p.playerId === tokenHolderId)!;
        const tokenHolderSocket = sockets.find(s => s.id === tokenHolder.id)!;

        // Find target (different player)
        const target = room.players.find(p => p.playerId !== tokenHolderId)!;

        // Token holder investigates (using REAL handler)
        tokenHolderSocket.emit('inquisitor:investigate', { targetId: target.id });

        // Wait for event to be processed
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify investigation result was emitted
        const investigationResults = tokenHolderSocket.getEmittedEvents('inquisitor:investigation-result');
        expect(investigationResults.length).toBe(1);
        expect(investigationResults[0].data.targetId).toBe(target.id);
        expect(investigationResults[0].data.role).toBe(target.role);

        // Verify token was passed
        const tokenPassedEvents = mockIO.getSocketsInRoom(room.id)
            .flatMap(s => s.getEmittedEvents('inquisitor:token-passed'));
        expect(tokenPassedEvents.length).toBeGreaterThan(0);
        expect(tokenPassedEvents[0].data.newTokenHolder).toBe(target.id);
    });

    it('Validates investigation rules: cannot investigate self', async () => {
        const room = gameManager.createRoom(5, ['inquisidor'], mockIO);

        for (let i = 0; i < 5; i++) {
            const socket = mockIO.createSocket(`socket${i}`);
            sockets.push(socket);

            const expansion = AVAILABLE_EXPANSIONS['inquisidor'];
            if (expansion?.registerSocketHandlers) {
                expansion.registerSocketHandlers(socket as any, room, mockIO as any);
            }

            room.addPlayer(socket.id, `Player${i + 1}`, `uuid${i + 1}`);
            socket.join(room.id);
        }

        await room.startGame();

        // Get to investigation phase
        const leader = room.players.find(p => p.isLeader)!;
        const team = room.players.slice(0, room.getCurrentMissionSize()).map(p => p.id);
        room.selectTeam(team);
        sockets.forEach(s => room.submitVote(s.id, true));
        room.tallyVotes();
        team.forEach(id => room.submitMissionAction(id, true));
        await room.resolveMission();

        // Find token holder
        const tokenHolderId = (room as any).inquisitorState.tokenHolder;
        const tokenHolder = room.players.find(p => p.playerId === tokenHolderId)!;
        const tokenHolderSocket = sockets.find(s => s.id === tokenHolder.id)!;

        // Try to investigate self
        // IMPORTANT: Must add error listener before causing error, otherwise EventEmitter crashes
        tokenHolderSocket.on('error', () => { });
        tokenHolderSocket.emit('inquisitor:investigate', { targetId: tokenHolder.id });
        await new Promise(resolve => setTimeout(resolve, 10));

        // Should receive error
        const errors = tokenHolderSocket.getEmittedEvents('error');
        expect(errors.length).toBe(1);
        expect(errors[0].data.message).toContain('si mesmo');
    });
});
