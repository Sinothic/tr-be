import { Room } from "../Room";

describe("Room activity timestamps", () => {
  let now = Date.now();
  let originalDateNow: () => number;

  beforeEach(() => {
    now = Date.now();
    // Replace Date.now with controllable value
    originalDateNow = Date.now.bind(Date);
    // @ts-ignore - overwrite for test
    Date.now = () => now;
  });

  afterEach(() => {
    // Restore original Date.now
    // @ts-ignore
    Date.now = originalDateNow;
  });

  test("lastActivityAt advances after common actions", async () => {
    const room = new Room("TST1");
    const initialLast = room.lastActivityAt;
    expect(initialLast).toBeDefined();

    const advance = (ms = 1000) => {
      now += ms;
    };

    // addPlayer
    advance();
    const p = room.addPlayer("s1", "Alice");
    expect(room.players.some((pl) => pl.playerId === p.playerId)).toBeTruthy();
    expect(room.lastActivityAt).toBe(now);

    // removePlayer
    advance();
    room.removePlayer("s1");
    expect(room.lastActivityAt).toBe(now);

    // Add again for reconnect test
    advance();
    const p2 = room.addPlayer("s3", "Bob");
    expect(room.players.some((pl) => pl.playerId === p2.playerId)).toBeTruthy();

    // reconnectPlayer
    advance();
    const reconnected = room.reconnectPlayer(p2.playerId, "s4");
    expect(reconnected).toBe(true);
    expect(room.lastActivityAt).toBe(now);

    // startGame (async)
    advance();
    // Ensure enough players to start game: add players until minPlayers
    while (room.players.length < room.minPlayers) {
      room.addPlayer(`bot-${room.players.length}`, `Bot${room.players.length}`);
    }
    const started = await room.startGame();
    // startGame might return false if not enough players; ensure it's boolean
    expect(typeof started === "boolean").toBeTruthy();
    // lastActivityAt should update on startGame only if startGame proceeded; we assert it's >= now
    expect(room.lastActivityAt).toBe(now);

    // nextTurn to change leader
    advance();
    room.nextTurn();
    expect(room.lastActivityAt).toBe(now);

    // Prepare players for selectTeam: ensure 5 players so mission config exists
    advance();
    room.players = [
      { id: "a", playerId: "pA", nickname: "A", isLeader: false },
      { id: "b", playerId: "pB", nickname: "B", isLeader: false },
      { id: "c", playerId: "pC", nickname: "C", isLeader: false },
      { id: "d", playerId: "pD", nickname: "D", isLeader: false },
      { id: "e", playerId: "pE", nickname: "E", isLeader: false },
    ];

    // selectTeam
    const size = room.getCurrentMissionSize() || 2;
    const team = room.players.slice(0, size).map((p) => p.id);
    advance();
    const selected = room.selectTeam(team);
    expect(selected).toBeTruthy();
    expect(room.lastActivityAt).toBe(now);

    // submitVote
    advance();
    const voter = room.players[0].id;
    room.submitVote(voter, true);
    expect(room.lastActivityAt).toBe(now);

    // fill remaining votes so tallyVotes can run
    advance();
    for (let i = 1; i < room.players.length; i++) {
      const pid = room.players[i].playerId || room.players[i].id;
      room.votes.set(pid, true);
    }
    // tallyVotes (updates lastActivityAt after clearing votes)
    advance();
    const result = room.tallyVotes();
    expect(result).toBeDefined();
    expect(room.lastActivityAt).toBe(now);

    // submitMissionAction (ensure selectedTeam set to include first player's playerId)
    advance();
    // ensure selectedTeam contains player[0]
    room.selectedTeam = [room.players[0].playerId || room.players[0].id];
    const missionSubmitted = room.submitMissionAction(room.players[0].id, true);
    expect(missionSubmitted).toBeTruthy();
    expect(room.lastActivityAt).toBe(now);
  });
});
