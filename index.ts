import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { GameManager } from "./game/GameManager";

const app = express();
app.use(cors());

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
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
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
    ({ nickname, expansions }: { nickname: string; expansions?: string[] }) => {
      const room = gameManager.createRoom(DEBUG_MIN_PLAYERS, expansions);
      const player = room.addPlayer(socket.id, nickname);
      socket.join(room.id);
      socket.emit("room_created", {
        roomId: room.id,
        player,
        minPlayers: room.minPlayers,
        expansions: room.expansions,
      });
      console.log(
        `Room created: ${room.id} by ${nickname} with expansions: ${
          expansions?.join(", ") || "none"
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
    }: {
      nickname: string;
      minPlayers: number;
      expansions?: string[];
    }) => {
      const room = gameManager.createRoom(minPlayers, expansions);
      const player = room.addPlayer(socket.id, nickname);
      socket.join(room.id);
      socket.emit("room_created", {
        roomId: room.id,
        player,
        minPlayers: room.minPlayers,
        expansions: room.expansions,
      });
      console.log(
        `Debug room created: ${
          room.id
        } by ${nickname} (minPlayers: ${minPlayers}, expansions: ${
          expansions?.join(", ") || "none"
        })`
      );

      // Auto-start game if in debug mode (minPlayers < 5) and enough players (which is always true for minPlayers=1)
      if (room.minPlayers < 5 && room.players.length >= room.minPlayers) {
        setTimeout(() => {
          if (room.startGame()) {
            // Send role info to each player privately (include specialRole and spies visibility for MERLIN)
            const spiesList = room.players
              .filter((p) => p.role === "SPY")
              .map((p) => ({ id: p.id, nickname: p.nickname }));

            room.players.forEach((player) => {
              const payload: any = {
                role: player.role,
                specialRole: player.specialRole || null,
              };

              // MERLIN (a resistance special role) should see spies
              if (player.specialRole === "MERLIN") {
                payload.spies = spiesList;
              }

              // Spies should see other spies
              if (player.role === "SPY") {
                payload.spies = spiesList;
              }

              io.to(player.id).emit("role_assigned", payload);
            });

            // Broadcast game state to all players in room
            io.to(room.id).emit("game_started", {
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
            console.log(
              `Game auto-started in debug room ${room.id} with ${room.players.length} players`
            );
          }
        }, 2000); // Increased delay to ensure client navigation is complete
      }
    }
  );

  socket.on(
    "join_room",
    ({ roomId, nickname }: { roomId: string; nickname: string }) => {
      const room = gameManager.getRoom(roomId);
      if (room) {
        // Check if player with this nickname already exists
        const existingPlayer = room.players.find(
          (p) => p.nickname === nickname
        );

        if (existingPlayer) {
          // Reconnect existing player with new socket ID
          existingPlayer.id = socket.id;
          socket.join(roomId);

          // Send current room state to the reconnected player
          socket.emit("joined_room", {
            roomId,
            player: existingPlayer,
            minPlayers: room.minPlayers,
          });

          // Notify all players about the reconnection
          io.to(roomId).emit("player_joined", { players: room.players });
          console.log(
            `Player ${nickname} reconnected to room ${roomId} with new socket ${socket.id}`
          );
        } else {
          // New player joining
          const player = room.addPlayer(socket.id, nickname);
          socket.join(roomId);

          // Send room info to the new player
          socket.emit("joined_room", {
            roomId,
            player,
            minPlayers: room.minPlayers,
          });

          // Notify all players about the new player
          io.to(roomId).emit("player_joined", { players: room.players });
          console.log(`Player ${nickname} joined room ${roomId}`);

          // Auto-start game if in debug mode (minPlayers < 5) and enough players
          if (
            room.minPlayers < 5 &&
            room.players.length >= room.minPlayers &&
            room.phase === "LOBBY"
          ) {
            setTimeout(() => {
              if (room.startGame()) {
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
                console.log(
                  `Game auto-started in debug room ${roomId} with ${room.players.length} players`
                );
              }
            }, 1000); // Small delay to ensure all clients are ready
          }
        }
      } else {
        socket.emit("error", "Room not found");
      }
    }
  );

  socket.on("start_game", (roomId: string) => {
    const room = gameManager.getRoom(roomId);
    if (room && room.startGame()) {
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
          const result = room.tallyVotes();
          console.log(
            `Vote result for room ${roomId}:`,
            result,
            "voteRejections:",
            room.voteRejections
          );

          // Emit vote_result to clients so they can update their UI
          io.to(roomId).emit("vote_result", {
            ...result,
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
    ({ roomId, success }: { roomId: string; success: boolean }) => {
      const room = gameManager.getRoom(roomId);
      if (room && room.submitMissionAction(socket.id, success)) {
        // Check if all mission actions are in
        if (room.missionActions.size === room.selectedTeam.length) {
          const result = room.resolveMission();
          io.to(roomId).emit("mission_result", {
            ...result,
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

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    // TODO: Handle player removal from room
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
