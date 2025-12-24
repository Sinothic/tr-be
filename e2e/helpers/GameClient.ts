import io, { Socket } from 'socket.io-client';

/**
 * Game client helper for E2E tests
 * Simulates a player connecting and interacting with the game via WebSocket
 */
export class GameClient {
    socket: Socket;
    nickname: string;
    playerId?: string;
    roomId?: string;
    state: any = {};
    events: Array<{ name: string; data: any }> = [];

    constructor(serverUrl: string, nickname: string) {
        this.nickname = nickname;
        this.socket = io(serverUrl, { transports: ['websocket'] });
        this.setupListeners();
    }

    private setupListeners() {
        // Track all events for debugging
        this.socket.onAny((eventName, ...args) => {
            this.events.push({ name: eventName, data: args });
        });

        // Core game events
        this.socket.on('room_created', (data) => {
            this.roomId = data.roomId;
            this.playerId = data.player?.playerId;
        });

        this.socket.on('joined_room', (data) => {
            this.roomId = data.roomId;
            this.playerId = data.player?.playerId;
        });

        this.socket.on('game_state_sync', (state) => {
            this.state = state;
        });

        this.socket.on('game_started', (data) => {
            console.log(`[${this.nickname}] Game started`);
        });

        this.socket.on('phase_change', (data) => {
            if (this.state) {
                this.state.phase = data.phase;
            }
        });
    }

    /**
     * Wait for connection to be established
     */
    async waitForConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.socket.connected) {
                resolve();
            } else {
                this.socket.once('connect', () => resolve());
                this.socket.once('connect_error', (err) => reject(err));
                setTimeout(() => reject(new Error('Connection timeout')), 5000);
            }
        });
    }

    /**
     * Create a new room
     */
    async createRoom(expansions: string[] = [], minPlayers?: number): Promise<string> {
        return new Promise((resolve, reject) => {
            const event = minPlayers !== undefined ? 'create_room_debug' : 'create_room';
            const payload: any = { nickname: this.nickname, expansions };
            if (minPlayers !== undefined) {
                payload.minPlayers = minPlayers;
            }

            this.socket.emit(event, payload);
            this.socket.once('room_created', (data) => {
                console.log(`[${this.nickname}] Created room ${data.roomId}`);
                resolve(data.roomId);
            });
            setTimeout(() => reject(new Error('Create room timeout')), 5000);
        });
    }

    /**
     * Join an existing room
     */
    async joinRoom(roomId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket.emit('join_room', { roomId, nickname: this.nickname });
            this.socket.once('joined_room', () => {
                console.log(`[${this.nickname}] Joined room ${roomId}`);
                resolve();
            });
            setTimeout(() => reject(new Error('Join room timeout')), 5000);
        });
    }

    /**
     * Start the game (must be in room)
     */
    async startGame(): Promise<void> {
        if (!this.roomId) throw new Error('Not in a room');

        return new Promise((resolve, reject) => {
            this.socket.emit('start_game', this.roomId);
            this.socket.once('game_started', () => {
                console.log(`[${this.nickname}] Game started`);
                resolve();
            });
            setTimeout(() => reject(new Error('Start game timeout')), 5000);
        });
    }

    /**
     * Select team (leader only)
     */
    selectTeam(playerIds: string[]): void {
        if (!this.roomId) throw new Error('Not in a room');
        console.log(`[E2E][ServerGameClient] ${this.nickname} emitting select_team payload:`, { roomId: this.roomId, playerIds });
        this.socket.emit('select_team', { roomId: this.roomId, playerIds: playerIds });
    }

    /**
     * Submit vote on team proposal
     */
    submitVote(approve: boolean): void {
        if (!this.roomId) throw new Error('Not in a room');
        this.socket.emit('submit_vote', { roomId: this.roomId, approve });
    }

    /**
     * Submit mission action
     */
    submitMissionAction(success: boolean): void {
        if (!this.roomId) throw new Error('Not in a room');
        this.socket.emit('submit_mission_action', { roomId: this.roomId, success });
    }

    /**
     * Wait for a specific event
     */
    async waitForEvent(eventName: string, timeout = 15000): Promise<any> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.socket.off(eventName, handler);
                reject(new Error(`Event ${eventName} timeout`));
            }, timeout);

            const handler = (data: any) => {
                clearTimeout(timer);
                resolve(data);
            };

            this.socket.once(eventName, handler);
        });
    }

    /**
     * Get the current game state
     */
    async getState(): Promise<any> {
        if (!this.roomId) throw new Error('Not in a room');

        return new Promise((resolve, reject) => {
            this.socket.emit('get_game_state', this.roomId);
            this.socket.once('game_state_sync', (state) => resolve(state));
            setTimeout(() => reject(new Error('Get state timeout')), 15000);
        });
    }

    /**
     * Get events received by this client
     */
    getEvents(): Array<{ name: string; data: any }> {
        return this.events;
    }

    /**
     * Clear event history
     */
    clearEvents(): void {
        this.events = [];
    }

    /**
     * Disconnect from server
     */
    disconnect(): void {
        this.socket.disconnect();
    }
}
