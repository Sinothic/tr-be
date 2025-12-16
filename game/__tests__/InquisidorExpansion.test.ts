import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookManager } from '../hooks/HookManager';
import { InquisidorExpansion } from '../expansions/inquisidor';
import { Room } from '../Room';

describe('InquisidorExpansion', () => {
    let hm: HookManager;
    let room: Room;
    let mockIo: any;
    let mockSocket: any;
    let socketHandlers: Record<string, Function> = {};

    beforeEach(() => {
        hm = new HookManager();
        socketHandlers = {};

        // Mock Socket
        mockSocket = {
            id: 'socket-1',
            room: null,
            playerId: 'player-uuid-1', // Simulate property availability if needed
            on: vi.fn((event, handler) => {
                socketHandlers[event] = handler;
            }),
            emit: vi.fn()
        };

        // Mock IO
        mockIo = {
            on: vi.fn((event, handler) => {
                if (event === 'connection') {
                    handler(mockSocket);
                }
            }),
            to: vi.fn().mockReturnValue({
                emit: vi.fn()
            }),
            emit: vi.fn()
        };

        // Create Room
        room = new Room('TEST', 5, [], hm);

        // Add players (Simulate UUIDs)
        room.addPlayer('socket-1', 'Alice', 'uuid-1');
        room.addPlayer('socket-2', 'Bob', 'uuid-2');
        room.addPlayer('socket-3', 'Charlie', 'uuid-3');

        // Assign current room to socket
        mockSocket.room = room;

        // Install Expansion
        InquisidorExpansion.install(hm, mockIo);
    });

    it('initializes inquisitor state with UUIDs on game:start', async () => {
        // Trigger game:start
        await hm.trigger('game:start' as any, { room });

        expect(room.inquisitorState).toBeDefined();
        // Check that tokenHolder is a UUID (one of uuid-1, uuid-2, uuid-3)
        expect(['uuid-1', 'uuid-2', 'uuid-3']).toContain(room.inquisitorState.tokenHolder);
        expect(room.inquisitorState.lastInvestigated).toBeNull();

        // socket id check (should NOT be socket-1 etc)
        expect(['socket-1', 'socket-2', 'socket-3']).not.toContain(room.inquisitorState.tokenHolder);
    });

    it('converts UUID to SocketID during state:sync', async () => {
        // Setup state manually
        room.inquisitorState = {
            tokenHolder: 'uuid-1', // Alice
            lastInvestigated: 'uuid-2', // Bob
            investigationHistory: []
        };

        const context = { room, state: {} as any };
        await hm.trigger('state:sync' as any, context);

        expect(context.state.inquisitorToken).toBeDefined();
        expect(context.state.inquisitorToken.holder).toBe('socket-1'); // Converted!
        expect(context.state.inquisitorToken.lastInvestigated).toBe('socket-2'); // Converted!
    });

    it('validates investigation using UUIDs', async () => {
        // Alice (uuid-1 / socket-1) holds token
        room.inquisitorState = {
            tokenHolder: 'uuid-1',
            lastInvestigated: null,
            investigationHistory: []
        };

        // Try to investigate Bob (socket-2)
        // Simulate socket call
        // We need to capture the handler for 'inquisitor:investigate'
        // Since install() runs immediately in beforeEach, handlers are registered.

        // Wait, install() registers on connection.
        // And mockIo.on('connection') ran in beforeEach.
        // So socketHandlers should be populated.

        const investigateHandler = socketHandlers['inquisitor:investigate'];
        expect(investigateHandler).toBeDefined();

        // Call handler as Alice (socket-1)
        mockSocket.id = 'socket-1';
        investigateHandler({ targetId: 'socket-2' });

        // Assert success: socket.emit result
        expect(mockSocket.emit).toHaveBeenCalledWith('inquisitor:investigation-result', expect.objectContaining({
            targetNickname: 'Bob'
        }));

        // Assert state update (UUIDs)
        expect(room.inquisitorState.tokenHolder).toBe('uuid-2'); // Token passed to Bob
        expect(room.inquisitorState.lastInvestigated).toBe('uuid-2');
    });

    it('blocks self-investigation', async () => {
        room.inquisitorState = {
            tokenHolder: 'uuid-1',
            lastInvestigated: null,
            investigationHistory: []
        };

        const investigateHandler = socketHandlers['inquisitor:investigate'];

        // Alice tries to investigate Alice (socket-1)
        mockSocket.id = 'socket-1';
        investigateHandler({ targetId: 'socket-1' });

        expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
            message: 'Você não pode investigar a si mesmo'
        }));

        // State unchanged
        expect(room.inquisitorState.tokenHolder).toBe('uuid-1');
    });

    it('recovers state correctly after reconnection (simulated)', async () => {
        // 1. Setup State: Alice (uuid-1) holds token
        room.inquisitorState = {
            tokenHolder: 'uuid-1',
            lastInvestigated: null,
            investigationHistory: []
        };

        // 2. Simulate Reconnection: Alice gets NEW socket ID
        const alice = room.getPlayer('socket-1');
        if (alice) alice.id = 'socket-1-new'; // Update player mapping in room

        // 3. Client requests token state using NEW socket
        const newSocket = { ...mockSocket, id: 'socket-1-new', room: room };
        const getHandler = socketHandlers['get-inquisitor-token'];

        // We need to bind context? No, handler uses closure or takes socket?
        // Wait, my implementation uses `socket` from closure `io.on('connection', (socket) => ...)`
        // The handler captured the ORIGINAL `mockSocket`.
        // This is a limitation of this test setup.
        // To test with a "new" socket connection, we need to trigger `io.on('connection')` again.

        // Trigger connection again with new socket
        let newHandlers: any = {};
        const newSocketMock = {
            id: 'socket-1-new',
            room: room,
            on: vi.fn((e, h) => newHandlers[e] = h),
            emit: vi.fn()
        };

        // Check if I can access the connection handler
        // mockIo.on was called. I can't easily re-trigger it unless I stored it.
        // But `install` called it once.

        // Actually, simpler: The `getSocketId` helper uses `room.players`.
        // If I update `room.players`, the logic should find the new socket ID.

        // Let's use the handler from the first connection for simplicity, 
        // assuming the logic *inside* looks up fresh data from `room`.

        // Update Alice's socket ID in the room
        const p = room.players.find(p => p.playerId === 'uuid-1');
        if (p) p.id = 'socket-1-new';

        // Call get-token
        getHandler();

        // Expect emit with NEW socket ID
        expect(mockSocket.emit).toHaveBeenCalledWith('inquisitor:token-passed', {
            newTokenHolder: 'socket-1-new', // Correctly resolved to new socket
            investigatedPlayer: null
        });
    });
});
