import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  SPY_COUNT,
  MISSION_CONFIG,
  MAX_REJECTIONS,
  MISSIONS_TO_SUCCEED,
  MISSIONS_TO_FAIL,
} from "./constants";
import { HookManager } from "./hooks/HookManager";

export type GamePhase =
  | "LOBBY"
  | "TEAM_SELECTION"
  | "VOTE"
  | "MISSION"
  | "ASSASSINATION"
  | "RESULTS"
  | "GAME_OVER";
export type Role = "RESISTANCE" | "SPY";
export type SpecialRole = "MERLIN" | "ASSASSIN" | null;

export interface Player {
  id: string; // socket.id (changes on reconnect)
  playerId: string; // permanent UUID for this player
  nickname: string;
  role?: Role;
  specialRole?: SpecialRole;
  isLeader: boolean;
}

export class Room {
  id: string;
  players: Player[] = [];
  maxPlayers: number = MAX_PLAYERS;
  minPlayers: number = MIN_PLAYERS;
  expansions: string[] = [];

  // Timestamps for activity tracking
  createdAt: number = Date.now();
  lastActivityAt: number = Date.now();
  loopStartAt: number | null = null;

  phase: GamePhase = "LOBBY";
  currentLeaderIndex: number = 0;
  currentMissionIndex: number = 0;
  failedMissions: number = 0;
  succeededMissions: number = 0;
  missionHistory: Array<{ success: boolean; failCount: number }> = [];
  assassinationTarget: string | null = null;

  // Mission configuration based on player count (standard Resistance rules)
  // [Players] => [Mission1, Mission2, Mission3, Mission4, Mission5] (Team sizes)
  private missionConfig: Record<number, number[]> = MISSION_CONFIG;
  private hookManager: HookManager;

  constructor(id: string, minPlayers?: number, expansions?: string[], hookManager?: HookManager) {
    this.id = id;
    this.hookManager = hookManager || new HookManager();
    if (minPlayers !== undefined) {
      this.minPlayers = minPlayers;
    }
    if (expansions) {
      this.expansions = expansions;
    }
  }

  addPlayer(id: string, nickname: string, playerId?: string): Player {
    const player: Player = {
      id,
      playerId: playerId || id, // Use provided playerId or fallback to socket.id
      nickname,
      isLeader: false,
    };
    this.players.push(player);
    this.lastActivityAt = Date.now();
    return player;
  }

  removePlayer(id: string) {
    this.players = this.players.filter((p) => p.id !== id);
    this.lastActivityAt = Date.now();
  }

  getPlayer(id: string) {
    return this.players.find((p) => p.id === id);
  }

  getPlayerByPlayerId(playerId: string) {
    return this.players.find((p) => p.playerId === playerId);
  }

  reconnectPlayer(playerId: string, newSocketId: string): boolean {
    const player = this.getPlayerByPlayerId(playerId);
    if (player) {
      player.id = newSocketId;
      this.lastActivityAt = Date.now();
      return true;
    }
    return false;
  }

  async startGame() {
    if (this.players.length < this.minPlayers) return false;

    // Trigger game:start hook before any game initialization
    await this.hookManager.trigger('game:start', { room: this });

    this.assignRoles();
    this.phase = "TEAM_SELECTION";
    this.currentLeaderIndex = Math.floor(Math.random() * this.players.length);
    this.updateLeader();
    this.lastActivityAt = Date.now();

    return true;
  }

  private async assignRoles() {
    const playerCount = this.players.length;
    const spyCount = SPY_COUNT[playerCount] || Math.ceil(playerCount / 3); // Fallback for unsupported player counts

    const shuffled = [...this.players].sort(() => 0.5 - Math.random());

    shuffled.forEach((player, index) => {
      player.role = index < spyCount ? "SPY" : "RESISTANCE";
      player.specialRole = null; // Initialize special role
    });

    // Trigger roles:assign hook to allow expansions to assign special roles
    await this.hookManager.trigger('roles:assign', { room: this, players: this.players });
  }

  private updateLeader() {
    this.players.forEach((p) => (p.isLeader = false));
    this.players[this.currentLeaderIndex].isLeader = true;
    this.lastActivityAt = Date.now();
  }

  nextTurn() {
    this.currentLeaderIndex =
      (this.currentLeaderIndex + 1) % this.players.length;
    this.updateLeader();
    this.phase = "TEAM_SELECTION";
    this.selectedTeam = [];
    this.votes = new Map();
  }

  getCurrentMissionSize(): number {
    return (
      this.missionConfig[this.players.length]?.[this.currentMissionIndex] || 0
    );
  }

  // INTERNAL STATE: Uses playerIds (UUIDs)
  selectedTeam: string[] = []; // List of playerIds
  votes: Map<string, boolean> = new Map(); // playerId -> boolean
  voteRejections: number = 0;
  missionActions: Map<string, boolean> = new Map(); // playerId -> boolean

  // Helper to convert socket IDs to playerIds for internal logic
  private getPlayerIdFromSocket(socketId: string): string | undefined {
    return this.getPlayer(socketId)?.playerId;
  }

  // Helper to convert internal playerIds back to socket IDs for client communication
  private getSocketIdFromPlayerId(playerId: string): string | undefined {
    return this.getPlayerByPlayerId(playerId)?.id;
  }

  // Helper for clients: Get selected team as Socket IDs
  getSelectedTeamSocketIds(): string[] {
    return this.selectedTeam
      .map(pid => this.getSocketIdFromPlayerId(pid))
      .filter((sid): sid is string => !!sid);
  }

  // Helper for clients: Get revealed votes using Socket IDs as keys
  getRevealedVotes(): Record<string, boolean> {
    const revealed: Record<string, boolean> = {};
    this.votes.forEach((approve, playerId) => {
      const socketId = this.getSocketIdFromPlayerId(playerId);
      if (socketId) {
        revealed[socketId] = approve;
      }
    });
    return revealed;
  }

  selectTeam(socketIds: string[]): boolean {
    const requiredSize = this.getCurrentMissionSize();
    if (socketIds.length !== requiredSize) return false;

    // Validate all players exist
    const playerIds: string[] = [];
    for (const sid of socketIds) {
      const player = this.getPlayer(sid);
      if (!player) return false;
      playerIds.push(player.playerId);
    }

    this.selectedTeam = playerIds;
    this.phase = "VOTE";
    this.lastActivityAt = Date.now();
    return true;
  }

  submitVote(socketId: string, approve: boolean) {
    const playerId = this.getPlayerIdFromSocket(socketId);
    if (!playerId) return;
    this.votes.set(playerId, approve);
    this.lastActivityAt = Date.now();
  }

  tallyVotes(): {
    approved: boolean;
    approveCount: number;
    rejectCount: number;
    penaltyApplied?: boolean;
  } {
    let approveCount = 0;
    let rejectCount = 0;

    this.votes.forEach((vote) => {
      if (vote) approveCount++;
      else rejectCount++;
    });

    const approved = approveCount > rejectCount;

    let penaltyApplied = false;

    if (!approved) {
      this.voteRejections++;

      if (this.voteRejections >= MAX_REJECTIONS) {
        // After MAX_REJECTIONS rejected proposals, Spies win immediately
        this.failedMissions = MISSIONS_TO_FAIL; // Force spy win condition
        this.phase = "GAME_OVER";
        penaltyApplied = true;
        this.voteRejections = 0;
      } else {
        this.nextTurn();
      }
    } else {
      this.phase = "MISSION";
      // this.voteRejections = 0; // Cumulative rejections rule: do not reset!
    }

    // Capture votes before clearing, but we don't return them here directly
    // typically index.ts accesses room.votes, but now that's internal UUIDs.
    // index.ts should use room.getRevealedVotes().
    const resultDetails = { approved, approveCount, rejectCount, penaltyApplied };

    this.votes.clear();

    this.lastActivityAt = Date.now();

    return resultDetails;
  }

  submitMissionAction(socketId: string, success: boolean) {
    const playerId = this.getPlayerIdFromSocket(socketId);
    if (!playerId) return false;

    if (!this.selectedTeam.includes(playerId)) return false;
    this.missionActions.set(playerId, success);
    this.lastActivityAt = Date.now();
    return true;
  }

  async resolveMission(): Promise<{
    success: boolean;
    failCount: number;
    votes: Map<string, boolean>; // Returns socketID -> boolean for compatibility if needed
  }> {
    let failCount = 0;
    this.missionActions.forEach((action) => {
      if (!action) failCount++;
    });

    const success = failCount === 0;

    if (success) {
      this.succeededMissions++;
    }
    else {
      this.failedMissions++;
    }

    // Track mission result in history
    this.missionHistory.push({ success, failCount });

    // Convert keys to Socket IDs for the return value
    const votesSocketIds = new Map<string, boolean>();
    this.missionActions.forEach((action, playerId) => {
      const sid = this.getSocketIdFromPlayerId(playerId);
      if (sid) {
        votesSocketIds.set(sid, action);
      } else {
        votesSocketIds.set(playerId, action);
      }
    });

    this.missionActions.clear();

    // Determine next phase based on win conditions
    let nextPhase: GamePhase = "TEAM_SELECTION";

    // Check win conditions
    if (this.failedMissions >= MISSIONS_TO_FAIL) {
      // Spies win
      nextPhase = "GAME_OVER";
    } else if (this.succeededMissions >= MISSIONS_TO_SUCCEED) {
      // Resistance wins (base game)
      nextPhase = "GAME_OVER";
    } else {
      this.currentMissionIndex++;
      nextPhase = "TEAM_SELECTION";
    }

    // Trigger mission:resolve hook to allow expansions to modify phase
    const hookResult = await this.hookManager.trigger('mission:resolve', {
      room: this,
      result: { success, failCount },
      nextPhase
    });

    // Apply phase from hook if modified
    if (hookResult.nextPhase) {
      this.phase = hookResult.nextPhase as GamePhase;
    } else {
      this.phase = nextPhase;
    }

    // Handle next turn if continuing
    if (this.phase === "TEAM_SELECTION") {
      this.nextTurn();
    }

    return { success, failCount, votes: votesSocketIds };
  }

  handleAssassination(targetId: string): { success: boolean; merlinId: string | null } {
    this.assassinationTarget = targetId;

    // Find Merlin
    const merlin = this.players.find(p => p.specialRole === "MERLIN");
    const merlinId = merlin?.id || null;

    // Check if Assassin guessed correctly
    const success = targetId === merlinId;

    this.phase = "GAME_OVER";

    return { success, merlinId };
  }

  async getGameState(requestingPlayerId: string) {
    const player = this.getPlayerByPlayerId(requestingPlayerId);
    if (!player) return null;

    // Build spy list for role info
    const spiesList = this.players
      .filter((p) => p.role === "SPY")
      .map((p) => ({ id: p.id, nickname: p.nickname }));

    // Spy visibility is now controlled by expansions via state:sync hook
    let spiesVisible: any[] | undefined = undefined;
    if (player.role === "SPY") {
      spiesVisible = spiesList;
    }

    // Check if player has voted in current phase (using UUID)
    const hasVoted = this.votes.has(requestingPlayerId);
    const myVote = this.votes.get(requestingPlayerId) || null;

    // Check if player has submitted mission action (using UUID)
    const hasSubmittedMissionAction = this.missionActions.has(requestingPlayerId);
    const myMissionAction = this.missionActions.get(requestingPlayerId) || null;

    // Get list of players who have voted (map UUID -> SocketID for client)
    const votedPlayers = Array.from(this.votes.keys())
      .map(pid => this.getSocketIdFromPlayerId(pid))
      .filter((sid): sid is string => !!sid);

    // Get list of players who have submitted mission actions (map UUID -> SocketID for client)
    const missionActionsSubmitted = Array.from(this.missionActions.keys())
      .map(pid => this.getSocketIdFromPlayerId(pid))
      .filter((sid): sid is string => !!sid);

    // Find assassin ID if in assassination phase
    const assassin = this.players.find((p) => p.specialRole === "ASSASSIN");

    const state = {
      roomId: this.id,
      player: {
        id: player.id,
        playerId: player.playerId,
        nickname: player.nickname,
        isLeader: player.isLeader,
      },
      minPlayers: this.minPlayers,
      expansions: this.expansions,
      gameStarted: this.phase !== "LOBBY",
      phase: this.phase,
      players: this.players.map((p) => ({
        id: p.id,
        playerId: p.playerId,
        nickname: p.nickname,
        isLeader: p.isLeader,
      })),
      currentLeader: this.players[this.currentLeaderIndex],
      missionIndex: this.currentMissionIndex,
      missionSize: this.getCurrentMissionSize(),
      selectedTeam: this.getSelectedTeamSocketIds(), // Map UUIDs to Socket IDs
      voteRejections: this.voteRejections,
      succeededMissions: this.succeededMissions,
      failedMissions: this.failedMissions,
      missionHistory: this.missionHistory,
      gameWinner: this.getWinner(),
      // Player-specific info
      myRole: player.role,
      specialRole: player.specialRole,
      spies: spiesVisible,
      hasVoted,
      myVote,
      votedPlayers,
      hasSubmittedMissionAction,
      myMissionAction,
      missionActionsSubmitted,
      assassinId: assassin?.id || null,
      assassinationTarget: this.assassinationTarget,
    };

    // Trigger state:sync hook to allow expansions to add custom state
    const hookResult = await this.hookManager.trigger('state:sync', {
      room: this,
      player,
      state
    });

    return hookResult.state || state;
  }

  async resetGame() {
    // Reset counters and history
    this.phase = "TEAM_SELECTION"; // Will be overridden by startGame/assignRoles logic usually, but here we reset
    this.currentMissionIndex = 0;
    this.failedMissions = 0;
    this.succeededMissions = 0;
    this.missionHistory = [];
    this.voteRejections = 0;
    this.selectedTeam = [];
    this.votes.clear();
    this.missionActions.clear();
    this.assassinationTarget = null;

    // Reset player states but keep players
    this.players.forEach(p => {
      p.isLeader = false;
      p.role = undefined;
      p.specialRole = undefined;
    });

    // Notify expansions to reset
    await this.hookManager.trigger('game:reset', { room: this });

    // Start game again (assign roles, pick leader, etc)
    await this.startGame();
  }

  getWinner(): "RESISTANCE" | "SPY" | null {
    if (this.phase !== "GAME_OVER") return null;

    // If assassination happened and was successful, spies win
    if (this.assassinationTarget) {
      const merlin = this.players.find(p => p.specialRole === "MERLIN");
      if (this.assassinationTarget === merlin?.id) {
        return "SPY";
      }
    }

    // Normal win conditions
    if (this.succeededMissions >= MISSIONS_TO_SUCCEED) return "RESISTANCE";
    if (this.failedMissions >= MISSIONS_TO_FAIL) return "SPY";

    return null;
  }
}
