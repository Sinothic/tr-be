import { createServer } from 'http';
import express from 'express';
import { GameManager } from '../GameManager';

// We'll create a minimal express app mirroring the /api/rooms endpoint behavior
function createApp(gameManager: GameManager) {
  const app = express();
  const ROOM_STALE_MINUTES = 10;
  const ROOM_STALE_MS = ROOM_STALE_MINUTES * 60 * 1000;
  function isRoomStale(room: any) {
    if (!room || !room.lastActivityAt) return false;
    return Date.now() - room.lastActivityAt > ROOM_STALE_MS;
  }

  app.get('/api/rooms', (req, res) => {
    const openRooms = Array.from(gameManager.rooms.values())
      .filter(room => room.phase === 'LOBBY' && !isRoomStale(room))
      .map(room => ({ id: room.id, playerCount: room.players.length, maxPlayers: room.maxPlayers }));
    res.json(openRooms);
  });

  return app;
}

function httpGetJson(port: number, path: string): Promise<{ status: number; body: any }> {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const opts = { hostname: '127.0.0.1', port, path, method: 'GET' };
    const req = http.request(opts, (res: any) => {
      const chunks: any[] = [];
      res.on('data', (c: any) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          const body = JSON.parse(raw);
          resolve({ status: res.statusCode, body });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('Rooms API and list filtering', () => {
  test('API omits stale rooms and returns active ones', async () => {
    const gm = new GameManager();

    // Create active room
    const active = gm.createRoom();
    active.addPlayer('s1', 'A');

    // Create stale room by manipulating timestamps
    const stale = gm.createRoom();
    stale.addPlayer('s2', 'B');
    // set lastActivityAt far in past
    // @ts-ignore
    stale.lastActivityAt = Date.now() - (11 * 60 * 1000); // 11 minutes ago

    const app = createApp(gm);
    const server = createServer(app);

    await new Promise((resolve) => server.listen(0, resolve));
    // @ts-ignore
    const port = server.address().port;

    const res = await httpGetJson(port, '/api/rooms');
    expect(res.status).toBe(200);
    const body = res.body;
    // Should include active room id and not include stale room id
    const ids = body.map((r: any) => r.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(stale.id);

    server.close();
  });
});
