import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { GameManager } from "./game/GameManager";
import { PLAYER_RECONNECT_TIMEOUT_SECONDS } from "./game/constants";
import { AVAILABLE_EXPANSIONS } from "./game/expansions";

const app = express();

// CORS configuration - allow ngrok, localhost, and all origins for development
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Explicitly allow ngrok domains and localhost
    const ngrokPatterns = [
      /^https?:\/\/.*\.ngrok\.io$/,
      /^https?:\/\/.*\.ngrok-free\.app$/,
      /^https?:\/\/.*\.ngrok\.app$/,
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
    ];

    // Check if origin matches ngrok or localhost patterns
    const isNgrokOrLocalhost = ngrokPatterns.some(pattern => pattern.test(origin));

    // Allow ngrok, localhost, and all other origins for flexibility
    callback(null, true);
  },
  credentials: true,
};

app.use(cors(corsOptions));

// API endpoint to get available expansions
app.get("/api/expansions", (req, res) => {
  const expansions = Object.entries(AVAILABLE_EXPANSIONS).map(([id, expansion]) => ({
    id: expansion.id,
    name: expansion.name,
    version: expansion.version,
  }));

  res.json(expansions);
});

// Debug endpoint to fill room with bots
app.post("/debug/fill-room/:roomId", (req, res) => {
  const { roomId } = req.params;
  const room = gameManager.getRoom(roomId);

  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const botNames = [
    "Alice",
    "Bob",
    "Charlie",
    "Diana",
    "Eve",
    "Frank",
    "Grace",
    "Henry",
  ];
  const neededPlayers = 5 - room.players.length;

  if (neededPlayers <= 0) {
    return res.json({
      message: "Room already has enough players",
      players: room.players.length,
    });
  }

  for (let i = 0; i < neededPlayers && i < botNames.length; i++) {
    const botId = `bot-${Date.now()}-${i}`;
    room.addPlayer(botId, botNames[i]);
  }

  io.to(roomId).emit("player_joined", { players: room.players });

  res.json({
    message: `Added ${neededPlayers} bots`,
    players: room.players.map((p) => p.nickname),
  });
});

app.use(express.json());

const httpServer = createServer(app);

// Socket.IO CORS configuration - allow ngrok and all origins
const socketCorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin
    if (!origin) return callback(null, true);

    // Explicitly allow ngrok domains and localhost
    // Also allow all other origins for development flexibility
    callback(null, true);
  },
  methods: ["GET", "POST"],
  credentials: true,
};

const io = new Server(httpServer, {
  cors: socketCorsOptions,
});

const gameManager = new GameManager();

// Debug mode: Set DEBUG_MIN_PLAYERS=1 (or 2) to test with fewer players
const DEBUG_MIN_PLAYERS = process.env.DEBUG_MIN_PLAYERS
  ? parseInt(process.env.DEBUG_MIN_PLAYERS, 10)
  : undefined;

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on(
    "create_room",
    ({ nickname, expansions, playerId }: { nickname: string; expansions?: string[]; playerId?: string }) => {
      const room = gameManager.createRoom(DEBUG_MIN_PLAYERS, expansions);
      const player = room.addPlayer(socket.id, nickname, playerId);
      socket.join(room.id);
      socket.emit("room_created", {
        roomId: room.id,
        player,
        minPlayers: room.minPlayers,
        expansions: room.expansions,
      });
      console.log(
        `Room created: ${room.id} by ${nickname} (playerId: ${player.playerId}) with expansions: ${expansions?.join(", ") || "none"
        }`
      );
    }
  );

  // Debug endpoint: create room with custom minPlayers (e.g., for testing with 1-2 players)
  socket.on(
    "create_room_debug",
    ({
      nickname,
      minPlayers,
      expansions,
      playerId,
    }: {
      nickname: string;
      minPlayers: number;
      expansions?: string[];
      playerId?: string;
    }) => {
      const room = gameManager.createRoom(minPlayers, expansions);
      const player = room.addPlayer(socket.id, nickname, playerId);
      socket.join(room.id);
      socket.emit("room_created", {
        roomId: room.id,
        player,
        minPlayers: room.minPlayers,
        expansions: room.expansions,
      });
      console.log(
        `Debug room created: ${room.id
        } by ${nickname} (playerId: ${player.playerId}, minPlayers: ${minPlayers}, expansions: ${expansions?.join(", ") || "none"
        })`
      );

      // Auto-start game if in debug mode (minPlayers < 5) and enough players (which is always true for minPlayers=1)
      // Removed auto-start logic as per user request. Game will require manual start.
      // if (room.minPlayers < 5 && room.players.length >= room.minPlayers) {
      //   setTimeout(() => {
      //     if (room.startGame()) {
      //       // Send role info to each player privately (include specialRole and spies visibility for MERLIN)
      //       const spiesList = room.players
      //         .filter((p) => p.role === "SPY")
      //         .map((p) => ({ id: p.id, nickname: p.nickname }));

      //       room.players.forEach((player) => {
      //         const payload: any = {
      //           role: player.role,
      //           specialRole: player.specialRole || null,
      //         };

      //         // MERLIN (a resistance special role) should see spies
      //         if (player.specialRole === "MERLIN") {
      //           payload.spies = spiesList;
      //         }

      //         // Spies should see other spies
      //         if (player.role === "SPY") {
      //           payload.spies = spiesList;
      //         }

      //         io.to(player.id).emit("role_assigned", payload);
      //       });

      //       // Broadcast game state to all players in room
      //       io.to(room.id).emit("game_started", {
      //         phase: room.phase,
      //         currentLeader: room.players[room.currentLeaderIndex],
      //         missionIndex: room.currentMissionIndex,
      //         missionSize: room.getCurrentMissionSize(),
      //         players: room.players.map((p) => ({
      //           id: p.id,
      //           nickname: p.nickname,
      //           isLeader: p.isLeader,
      //         })),
      //       });
      //       console.log(
      //         `Game auto-started in debug room ${room.id} with ${room.players.length} players`
      //       );
      //     }
      //   }, 2000); // Increased delay to ensure client navigation is complete
      // }
    }
  );

  socket.on(
    "join_room",
    async ({ roomId, nickname, playerId }: { roomId: string; nickname: string; playerId?: string }) => {
      const room = gameManager.getRoom(roomId);
      if (room) {
        let existingPlayer = null;

        // First, try to find by playerId if provided
        if (playerId) {
          existingPlayer = room.getPlayerByPlayerId(playerId);
        }

        // If not found by playerId, try nickname (backward compatibility)
        if (!existingPlayer) {
          existingPlayer = room.players.find((p) => p.nickname === nickname);
        }

        if (existingPlayer) {
          // Reconnect existing player with new socket ID
          existingPlayer.id = socket.id;
          socket.join(roomId);

          // Send full game state to the reconnected player
          const gameState = await room.getGameState(existingPlayer.playerId);
          console.log(`Sending game_state_sync to ${nickname}, phase: ${gameState?.phase}`);
          socket.emit("game_state_sync", gameState);

          // Notify all players about the reconnection
          io.to(roomId).emit("player_joined", { players: room.players });
          console.log(
            `Player ${nickname} (playerId: ${existingPlayer.playerId}) reconnected to room ${roomId} with new socket ${socket.id}`
          );
        } else {
          // New player joining
          const player = room.addPlayer(socket.id, nickname, playerId);
          socket.join(roomId);

          // Send room info to the new player
          socket.emit("joined_room", {
            roomId,
            player,
            minPlayers: room.minPlayers,
            expansions: room.expansions,
          });

          // Notify all players about the new player
          io.to(roomId).emit("player_joined", { players: room.players });
          console.log(`Player ${nickname} (playerId: ${player.playerId}) joined room ${roomId}`);

          // Auto-start game if in debug mode (minPlayers < 5) and enough players
          // Removed auto-start logic as per user request. Game will require manual start.
          // if (
          //   room.minPlayers < 5 &&
          //   room.players.length >= room.minPlayers &&
          //   room.phase === "LOBBY"
          // ) {
          //   setTimeout(() => {
          //     if (room.startGame()) {
          //       // Send role info to each player privately (include specialRole and spies visibility for MERLIN)
          //       const spiesList = room.players
          //         .filter((p) => p.role === "SPY")
          //         .map((p) => ({ id: p.id, nickname: p.nickname }));

          //       room.players.forEach((player) => {
          //         const payload: any = {
          //           role: player.role,
          //           specialRole: player.specialRole || null,
          //         };

          //         if (player.specialRole === "MERLIN") {
          //           payload.spies = spiesList;
          //         }

          //         if (player.role === "SPY") {
          //           payload.spies = spiesList;
          //         }

          //         io.to(player.id).emit("role_assigned", payload);
          //       });

          //       // Broadcast game state to all players in room
          //       io.to(roomId).emit("game_started", {
          //         phase: room.phase,
          //         currentLeader: room.players[room.currentLeaderIndex],
          //         missionIndex: room.currentMissionIndex,
          //         missionSize: room.getCurrentMissionSize(),
          //         players: room.players.map((p) => ({
          //           id: p.id,
          //           nickname: p.nickname,
          //           isLeader: p.isLeader,
          //         })),
          //       });
          //       console.log(
          //         `Game auto-started in debug room ${roomId} with ${room.players.length} players`
          //       );
          //     }
          //   }, 1000); // Small delay to ensure all clients are ready
          // }
        }
      } else {
        socket.emit("error", "Room not found");
      }
    }
  );

  socket.on("start_game", async (roomId: string) => {
    const room = gameManager.getRoom(roomId);
    if (room && await room.startGame()) {
      // Send role info to each player privately (include specialRole and spies visibility for MERLIN)
      const spiesList = room.players
        .filter((p) => p.role === "SPY")
        .map((p) => ({ id: p.id, nickname: p.nickname }));

      room.players.forEach((player) => {
        const payload: any = {
          role: player.role,
          specialRole: player.specialRole || null,
        };

        if (player.specialRole === "MERLIN") {
          payload.spies = spiesList;
        }

        if (player.role === "SPY") {
          payload.spies = spiesList;
        }

        console.log(`[Server] Sending role_assigned to ${player.nickname} (${player.role}):`, {
          role: payload.role,
          specialRole: payload.specialRole,
          spies: payload.spies ? `${payload.spies.length} spies` : 'undefined'
        });

        io.to(player.id).emit("role_assigned", payload);
      });

      // Broadcast game state to all players in room
      io.to(roomId).emit("game_started", {
        phase: room.phase,
        currentLeader: room.players[room.currentLeaderIndex],
        missionIndex: room.currentMissionIndex,
        missionSize: room.getCurrentMissionSize(),
        players: room.players.map((p) => ({
          id: p.id,
          nickname: p.nickname,
          isLeader: p.isLeader,
        })),
      });
      console.log(`Game started in room ${roomId}`);
    }
  });

  socket.on(
    "select_team",
    ({ roomId, playerIds }: { roomId: string; playerIds: string[] }) => {
      const room = gameManager.getRoom(roomId);
      if (room && room.selectTeam(playerIds)) {
        io.to(roomId).emit("team_selected", {
          selectedTeam: playerIds,
          phase: room.phase,
        });
        console.log(`Team selected in room ${roomId}`);
      }
    }
  );

  socket.on(
    "submit_vote",
    ({ roomId, approve }: { roomId: string; approve: boolean }) => {
      const room = gameManager.getRoom(roomId);
      if (room) {
        room.submitVote(socket.id, approve);

        // Notify all players that this player has voted
        io.to(roomId).emit("vote_submitted", { playerId: socket.id });

        // Check if all votes are in
        if (room.votes.size === room.players.length) {
          // Capture votes before tallying (which clears them)
          const votesToReveal = Object.fromEntries(room.votes);

          const result = room.tallyVotes();
          console.log(
            `Vote result for room ${roomId}:`,
            result,
            "votes:",
            votesToReveal
          );

          // Emit vote_result to clients so they can update their UI
          io.to(roomId).emit("vote_result", {
            ...result,
            votes: votesToReveal,
            phase: room.phase,
            voteRejections: room.voteRejections,
          });

          // Decide follow-up emits based on the tally result
          if (!result.approved) {
            // Vote rejected
            if (result.penaltyApplied) {
              // 5 rejections penalty applied: emit mission_result (failed by rejection)
              io.to(roomId).emit("mission_result", {
                success: false,
                failCount: 0,
                byRejection: true,
                succeededMissions: room.succeededMissions,
                failedMissions: room.failedMissions,
                phase: room.phase,
                missionIndex: room.currentMissionIndex,
              });

              // If the game ended due to the penalty, emit game_over
              if (room.phase === "GAME_OVER") {
                const resistanceWon = room.succeededMissions >= 3;
                io.to(roomId).emit("game_over", {
                  winner: resistanceWon ? "RESISTANCE" : "SPY",
                  players: room.players.map((p) => ({
                    id: p.id,
                    nickname: p.nickname,
                    role: p.role,
                    specialRole: p.specialRole || null,
                  })),
                });
              } else {
                // otherwise continue with next leader info
                io.to(roomId).emit("new_leader", {
                  currentLeader: room.players[room.currentLeaderIndex],
                  missionIndex: room.currentMissionIndex,
                  missionSize: room.getCurrentMissionSize(),
                });
              }
            } else {
              // Normal rejection: new leader and continue
              io.to(roomId).emit("new_leader", {
                currentLeader: room.players[room.currentLeaderIndex],
                missionSize: room.getCurrentMissionSize(),
              });
            }
          } else {
            // Approved -> mission phase already set in Room; nothing extra here (client handles mission state)
          }
        }
      }
    }
  );

  socket.on(
    "submit_mission_action",
    async ({ roomId, success }: { roomId: string; success: boolean }) => {
      const room = gameManager.getRoom(roomId);
      if (room && room.submitMissionAction(socket.id, success)) {
        // Notify all players that this player has submitted their action
        io.to(roomId).emit("mission_action_submitted", { playerId: socket.id });

        // Check if all mission actions are in
        if (room.missionActions.size === room.selectedTeam.length) {
          const result = await room.resolveMission();
          io.to(roomId).emit("mission_result", {
            ...result,
            votes: Object.fromEntries(result.votes), // Convert Map to object
            succeededMissions: room.succeededMissions,
            failedMissions: room.failedMissions,
            phase: room.phase,
          });

          if (room.phase === "TEAM_SELECTION") {
            // Next mission
            io.to(roomId).emit("new_leader", {
              currentLeader: room.players[room.currentLeaderIndex],
              missionIndex: room.currentMissionIndex,
              missionSize: room.getCurrentMissionSize(),
            });
          } else if (room.phase === "ASSASSINATION") {
            // Start assassination phase
            const assassin = room.players.find(
              (p) => p.specialRole === "ASSASSIN"
            );
            io.to(roomId).emit("assassination_phase", {
              assassinId: assassin?.id || null,
              players: room.players.map((p) => ({
                id: p.id,
                nickname: p.nickname,
              })),
            });
          } else if (room.phase === "GAME_OVER") {
            // Game ended
            const resistanceWon = room.succeededMissions >= 3;
            io.to(roomId).emit("game_over", {
              winner: resistanceWon ? "RESISTANCE" : "SPY",
              players: room.players.map((p) => ({
                id: p.id,
                nickname: p.nickname,
                role: p.role,
                specialRole: p.specialRole || null,
              })),
            });
          }
        }
      }
    }
  );

  // Track disconnect timeouts
  const disconnectTimeouts = new Map<string, NodeJS.Timeout>();

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);

    // Find which room this socket belongs to
    let playerRoom: any = null;
    let disconnectedPlayer: any = null;

    gameManager.rooms.forEach((room) => {
      const player = room.getPlayer(socket.id);
      if (player) {
        playerRoom = room;
        disconnectedPlayer = player;
      }
    });

    if (playerRoom && disconnectedPlayer) {
      // Set a timeout to remove the player after PLAYER_RECONNECT_TIMEOUT_SECONDS
      const timeout = setTimeout(() => {
        // Check if player is still disconnected (not reconnected)
        const currentPlayer = playerRoom.getPlayerByPlayerId(disconnectedPlayer.playerId);
        if (currentPlayer && currentPlayer.id === socket.id) {
          // Player never reconnected, remove them
          playerRoom.removePlayer(socket.id);
          io.to(playerRoom.id).emit("player_left", {
            playerId: disconnectedPlayer.playerId,
            players: playerRoom.players,
          });
          console.log(
            `Player ${disconnectedPlayer.nickname} (playerId: ${disconnectedPlayer.playerId}) removed from room ${playerRoom.id} after disconnect timeout`
          );
        }
        disconnectTimeouts.delete(socket.id);
      }, PLAYER_RECONNECT_TIMEOUT_SECONDS * 1000); // Convert seconds to milliseconds

      disconnectTimeouts.set(socket.id, timeout);
      console.log(
        `Player ${disconnectedPlayer.nickname} has 30 seconds to reconnect to room ${playerRoom.id}`
      );
    }
  });

  // Get room players (for manual reconnection)
  socket.on("get_room_players", (roomId: string) => {
    const room = gameManager.getRoom(roomId);
    if (room) {
      const playersWithStatus = room.players.map((p) => ({
        nickname: p.nickname,
        isConnected: io.sockets.sockets.has(p.id),
        // Don't send role/specialRole to avoid spoiling
      }));
      socket.emit("room_players_list", {
        roomId,
        players: playersWithStatus,
        gameStarted: room.phase !== "LOBBY",
      });
      console.log(`Sent players list for room ${roomId}:`, playersWithStatus);
    } else {
      socket.emit("error", "Room not found");
    }
  });

  // Handle assassination event during ASSASSINATION phase
  socket.on(
    "assassinate",
    ({ roomId, targetId }: { roomId: string; targetId: string }) => {
      const room = gameManager.getRoom(roomId);
      if (!room) return;
      // Ensure only the assassin can perform this action
      const assassin = room.players.find((p) => p.specialRole === "ASSASSIN");
      if (!assassin || socket.id !== assassin.id) {
        io.to(socket.id).emit("assassination_error", {
          message: "Apenas o Assassino pode executar esta ação.",
        });
        return;
      }

      // Disallow self-assassination
      if (targetId === assassin.id) {
        io.to(socket.id).emit("assassination_error", {
          message: "Você não pode se assassinar — humor negro detectado.",
        });
        return;
      }

      const result = room.handleAssassination(targetId);

      io.to(roomId).emit("assassination_result", {
        success: result.success,
        merlinId: result.merlinId,
        targetId, // Include targetId so all clients know who was picked
        phase: room.phase,
      });

      // Emit final game_over with winner determined by room.getWinner()
      const winner = room.getWinner();
      io.to(roomId).emit("game_over", {
        winner: winner,
        players: room.players.map((p) => ({
          id: p.id,
          nickname: p.nickname,
          role: p.role,
          specialRole: p.specialRole || null,
        })),
      });
    }
  );
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
