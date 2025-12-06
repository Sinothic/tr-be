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

  phase: GamePhase = "LOBBY";
  currentLeaderIndex: number = 0;
  currentMissionIndex: number = 0;
  failedMissions: number = 0;
  succeededMissions: number = 0;
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
    return player;
  }

  removePlayer(id: string) {
    this.players = this.players.filter((p) => p.id !== id);
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

  // Team Selection
  selectedTeam: string[] = [];
  votes: Map<string, boolean> = new Map();
  voteRejections: number = 0;
  missionActions: Map<string, boolean> = new Map();

  selectTeam(playerIds: string[]): boolean {
    const requiredSize = this.getCurrentMissionSize();
    if (playerIds.length !== requiredSize) return false;

    // Validate all players exist
    const allValid = playerIds.every((id) =>
      this.players.find((p) => p.id === id)
    );
    if (!allValid) return false;

    this.selectedTeam = playerIds;
    this.phase = "VOTE";
    return true;
  }

  submitVote(playerId: string, approve: boolean) {
    this.votes.set(playerId, approve);
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
        // After MAX_REJECTIONS rejected proposals, count as a failed mission (but do not end the game immediately)
        this.failedMissions++;
        penaltyApplied = true;
        this.voteRejections = 0; // reset rejection counter after applying the penalty

        // Advance mission index and check for game end
        if (this.succeededMissions >= MISSIONS_TO_SUCCEED || this.failedMissions >= MISSIONS_TO_FAIL) {
          this.phase = "GAME_OVER";
        } else {
          this.currentMissionIndex++;
          this.nextTurn();
        }
      } else {
        this.nextTurn();
      }
    } else {
      this.phase = "MISSION";
      this.voteRejections = 0;
    }

    // Clear votes after tallying
    this.votes.clear();

    return { approved, approveCount, rejectCount, penaltyApplied };
  }

  submitMissionAction(playerId: string, success: boolean) {
    if (!this.selectedTeam.includes(playerId)) return false;
    this.missionActions.set(playerId, success);
    return true;
  }

  async resolveMission(): Promise<{
    success: boolean;
    failCount: number;
    votes: Map<string, boolean>;
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

    const votes = new Map(this.missionActions);
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

    return { success, failCount, votes };
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

  async getGameState(playerId: string) {
    const player = this.getPlayerByPlayerId(playerId);
    if (!player) return null;

    // Build spy list for role info
    const spiesList = this.players
      .filter((p) => p.role === "SPY")
      .map((p) => ({ id: p.id, nickname: p.nickname }));

    // Spy visibility is now controlled by expansions via state:sync hook
    // By default, spies can see each other (base game behavior)
    let spiesVisible: any[] | undefined = undefined;
    if (player.role === "SPY") {
      spiesVisible = spiesList;
    }

    // Check if player has voted in current phase
    const hasVoted = this.votes.has(player.id);
    const myVote = this.votes.get(player.id) || null;

    // Check if player has submitted mission action
    const hasSubmittedMissionAction = this.missionActions.has(player.id);
    const myMissionAction = this.missionActions.get(player.id) || null;

    // Get list of players who have voted (just IDs)
    const votedPlayers = Array.from(this.votes.keys());

    // Get list of players who have submitted mission actions
    const missionActionsSubmitted = Array.from(this.missionActions.keys());

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
        nickname: p.nickname,
        isLeader: p.isLeader,
      })),
      currentLeader: this.players[this.currentLeaderIndex],
      missionIndex: this.currentMissionIndex,
      missionSize: this.getCurrentMissionSize(),
      selectedTeam: this.selectedTeam,
      voteRejections: this.voteRejections,
      succeededMissions: this.succeededMissions,
      failedMissions: this.failedMissions,
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
    console.log(`[Room] Before hook - spies for ${player.nickname}:`, state.spies ? 'visible' : 'hidden');
    const hookResult = await this.hookManager.trigger('state:sync', {
      room: this,
      player,
      state
    });
    console.log(`[Room] After hook - spies for ${player.nickname}:`, hookResult.state.spies ? 'visible' : 'hidden');

    return hookResult.state || state;
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
