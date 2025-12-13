import { describe, it, beforeAll, expect } from 'vitest';
import { io as Client, Socket } from 'socket.io-client';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

describe('Socket.io basic e2e', () => {
  beforeAll(async () => {
    // assume server already running (started externally)
    await new Promise((r) => setTimeout(r, 500));
  });

  it('two clients can create room, join and start game', async () => {
    // Keep sockets alive and in room so they receive broadcasts
    const sA: Socket = Client(SERVER_URL, { transports: ['websocket'] });

    const roomId = await new Promise<string>((resolve, reject) => {
      sA.on('connect', () => {
        console.log('[E2E] A connected, creating room');
        sA.emit('create_room_debug', { nickname: 'Alice', minPlayers: 1, playerId: 'pA' });
      });
      sA.on('room_created', (payload: any) => {
        console.log('[E2E] room_created', payload.roomId);
        resolve(payload.roomId);
      });
      sA.on('connect_error', (err) => { console.error('[E2E] A connect_error', err); reject(err); });
      setTimeout(() => reject(new Error('A create_room timeout')), 8000);
    });

    expect(roomId).toBeTruthy();

    // Create sB after room exists to ensure it receives join events
    const sB: Socket = Client(SERVER_URL, { transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      sB.on('connect', () => {
        console.log('[E2E] B connected, joining room', roomId);
        sB.emit('join_room', { roomId, nickname: 'Bob', playerId: 'pB' });
      });
      sB.on('joined_room', (payload: any) => {
        console.log('[E2E] B joined_room');
        resolve();
      });
      sB.on('connect_error', (err) => { console.error('[E2E] B connect_error', err); reject(err); });
      setTimeout(() => reject(new Error('B join timeout')), 8000);
    });

    // Start game by emitting from sA (a member of room)
    const started = await new Promise<boolean>((resolve) => {
      sA.emit('start_game', roomId);
      const onGameStarted = (payload: any) => { console.log('[E2E] game_started'); resolve(true); cleanup(); };
      const timeout = setTimeout(() => { console.error('[E2E] start timeout'); resolve(false); cleanup(); }, 10000);
      sA.on('game_started', onGameStarted);

      function cleanup() {
        clearTimeout(timeout);
        sA.off('game_started', onGameStarted);
        try { sA.disconnect(); } catch (e) {}
        try { sB.disconnect(); } catch (e) {}
      }
    });

    expect(started).toBe(true);
  }, 40000);
});
