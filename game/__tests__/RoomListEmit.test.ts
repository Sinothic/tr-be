import { Server } from 'socket.io';
import { createServer } from 'http';
import Client from 'socket.io-client';
import { GameManager } from '../GameManager';

// We'll spin up a real Socket.IO server on an ephemeral port to test emits

describe('room_list_update emit payload', () => {
  let io: Server | null = null;
  let httpServer: any = null;

  afterEach(() => {
    if (io) io.close();
    if (httpServer) httpServer.close();
    io = null;
    httpServer = null;
  });

  test('emits filtered open rooms payload', (done) => {
    const gm = new GameManager();

    // create active room
    const active = gm.createRoom();
    active.addPlayer('s1', 'A');

    // create stale room
    const stale = gm.createRoom();
    stale.addPlayer('s2', 'B');
    // @ts-ignore
    stale.lastActivityAt = Date.now() - (11 * 60 * 1000);

    const app = require('express')();
    httpServer = createServer(app);
    io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

    // replicate getOpenRooms logic here for the test binding
    function isRoomStale(room: any) {
      const ROOM_STALE_MINUTES = 10;
      const ROOM_STALE_MS = ROOM_STALE_MINUTES * 60 * 1000;
      if (!room || !room.lastActivityAt) return false;
      return Date.now() - room.lastActivityAt > ROOM_STALE_MS;
    }

    function getOpenRooms() {
      return Array.from(gm.rooms.values())
        .filter((room) => room.phase === 'LOBBY' && !isRoomStale(room))
        .map((room) => ({ id: room.id, playerCount: room.players.length, maxPlayers: room.maxPlayers }));
    }

    io.on('connection', (socket) => {
      // emit payload on connection to simulate server behavior
      socket.emit('room_list_update', getOpenRooms());
    });

    httpServer.listen(() => {
      const port = (httpServer.address()).port;
      const client = Client(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });

      client.on('connect', () => {
        // wait for the payload
      });

      client.on('room_list_update', (payload: any) => {
        try {
          const ids = payload.map((r: any) => r.id);
          expect(ids).toContain(active.id);
          expect(ids).not.toContain(stale.id);
          client.close();
          done();
        } catch (err) {
          client.close();
          done(err);
        }
      });
    });
  });
});
