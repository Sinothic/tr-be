export type GamePhase =
  | "LOBBY"
  | "TEAM_SELECTION"
  | "VOTE"
  | "MISSION"
  | "RESULTS"
  | "GAME_OVER";
export type Role = "RESISTANCE" | "SPY";

export interface Player {
  id: string;
  nickname: string;
  role?: Role;
  isLeader: boolean;
}

export class Room {
  id: string;
  players: Player[] = [];
  maxPlayers: number = 10;
  minPlayers: number = 5;

  phase: GamePhase = "LOBBY";
  currentLeaderIndex: number = 0;
  currentMissionIndex: number = 0;
  failedMissions: number = 0;
  succeededMissions: number = 0;

  // Mission configuration based on player count (standard Resistance rules)
  // [Players] => [Mission1, Mission2, Mission3, Mission4, Mission5] (Team sizes)
  private missionConfig: Record<number, number[]> = {
    1: [1, 1, 1, 1, 1], // Debug mode
    2: [1, 1, 1, 2, 2], // Debug mode
    3: [2, 2, 2, 2, 3], // Debug mode
    4: [2, 2, 2, 3, 3], // Debug mode
    5: [2, 3, 2, 3, 3],
    6: [2, 3, 4, 3, 4],
    7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5],
    9: [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5],
  };

  constructor(id: string, minPlayers?: number) {
    this.id = id;
    if (minPlayers !== undefined) {
      this.minPlayers = minPlayers;
    }
  }

  addPlayer(id: string, nickname: string): Player {
    const player: Player = {
      id,
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

  startGame() {
    if (this.players.length < this.minPlayers) return false;

    this.assignRoles();
    this.phase = "TEAM_SELECTION";
    this.currentLeaderIndex = Math.floor(Math.random() * this.players.length);
    this.updateLeader();

    return true;
  }

  private assignRoles() {
    const playerCount = this.players.length;
    let spyCount = Math.ceil(playerCount / 3);
    if (playerCount === 5) spyCount = 2; // Special case for 5 players (usually 2 spies)

    const shuffled = [...this.players].sort(() => 0.5 - Math.random());

    shuffled.forEach((player, index) => {
      player.role = index < spyCount ? "SPY" : "RESISTANCE";
    });
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

      if (this.voteRejections >= 5) {
        // After 5 rejected proposals, count as a failed mission (but do not end the game immediately)
        this.failedMissions++;
        penaltyApplied = true;
        this.voteRejections = 0; // reset rejection counter after applying the penalty

        // Advance mission index and check for game end
        if (this.succeededMissions >= 3 || this.failedMissions >= 3) {
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

  resolveMission(): { success: boolean; failCount: number } {
    let failCount = 0;
    this.missionActions.forEach((action) => {
      if (!action) failCount++;
    });

    const success = failCount === 0;

    if (success) {
      this.succeededMissions++;
    } else {
      this.failedMissions++;
    }

    // Check win conditions
    if (this.succeededMissions >= 3 || this.failedMissions >= 3) {
      this.phase = "GAME_OVER";
    } else {
      this.currentMissionIndex++;
      this.nextTurn();
    }

    this.missionActions.clear();
    return { success, failCount };
  }
}
