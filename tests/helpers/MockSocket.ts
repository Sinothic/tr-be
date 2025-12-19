import { EventEmitter } from 'events';

/**
 * Mock socket for testing
 * Simulates socket.io Socket interface without needing real WebSocket connection
 */
export class MockSocket extends EventEmitter {
    id: string;
    rooms: Set<string> = new Set();
    emittedEvents: Array<{ event: string; data: any }> = [];

    constructor(id: string) {
        super();
        this.id = id;
    }

    /**
     * Mock socket.join - adds room to internal set
     */
    join(roomId: string): void {
        this.rooms.add(roomId);
    }

    /**
     * Mock socket.emit - tracks emitted events for assertions
     */
    emit(event: string, ...args: any[]): boolean {
        this.emittedEvents.push({ event, data: args[0] });
        return super.emit(event, ...args);
    }

    /**
     * Get events emitted by this socket
     */
    getEmittedEvents(eventName?: string): Array<{ event: string; data: any }> {
        if (eventName) {
            return this.emittedEvents.filter(e => e.event === eventName);
        }
        return this.emittedEvents;
    }

    /**
     * Clear emitted events history
     */
    clearEmittedEvents(): void {
        this.emittedEvents = [];
    }

    /**
     * Simulate disconnection
     */
    disconnect(): void {
        this.emit('disconnect');
        this.removeAllListeners();
    }
}

/**
 * Mock IO (socket.io server) for testing
 * Simulates socket.io Server interface
 */
export class MockIO extends EventEmitter {
    sockets: Map<string, MockSocket> = new Map();
    rooms: Map<string, Set<MockSocket>> = new Map();

    /**
     * Create a new mock socket and simulate connection
     */
    createSocket(id: string): MockSocket {
        const socket = new MockSocket(id);
        this.sockets.set(id, socket);

        // When socket joins a room, track it
        const originalJoin = socket.join.bind(socket);
        socket.join = (roomId: string) => {
            originalJoin(roomId);
            if (!this.rooms.has(roomId)) {
                this.rooms.set(roomId, new Set());
            }
            this.rooms.get(roomId)!.add(socket);
        };

        return socket;
    }

    /**
     * Mock io.to(room).emit - emits to all sockets in room
     */
    to(roomId: string) {
        return {
            emit: (event: string, data: any) => {
                const socketsInRoom = this.rooms.get(roomId);
                if (socketsInRoom) {
                    socketsInRoom.forEach(socket => {
                        socket.emit(event, data);
                    });
                }
            }
        };
    }

    /**
     * Get all sockets in a room
     */
    getSocketsInRoom(roomId: string): MockSocket[] {
        return Array.from(this.rooms.get(roomId) || []);
    }

    /**
     * Cleanup
     */
    cleanup(): void {
        this.sockets.forEach(s => s.disconnect());
        this.sockets.clear();
        this.rooms.clear();
    }
}
