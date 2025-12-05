import { Room } from "./Room";
import { HookManager } from "./hooks/HookManager";
import { ExpansionRegistry } from "./expansions/types";
import { AVAILABLE_EXPANSIONS } from "./expansions";

export class GameManager {
  rooms: Map<string, Room> = new Map();
  hookManager: HookManager = new HookManager();
  expansionRegistry: ExpansionRegistry = new ExpansionRegistry();

  constructor() {
    // Register all available expansions
    Object.values(AVAILABLE_EXPANSIONS).forEach(expansion => {
      this.expansionRegistry.register(expansion);
    });
  }

  createRoom(minPlayers?: number, expansions?: string[]): Room {
    const roomId = this.generateRoomId();
    const room = new Room(roomId, minPlayers, expansions, this.hookManager);
    this.rooms.set(roomId, room);

    // Install expansions for this room
    if (expansions && expansions.length > 0) {
      this.installExpansions(expansions);
    }

    return room;
  }

  /**
   * Install expansions for a room based on expansion IDs
   */
  installExpansions(expansionIds: string[], io?: any): void {
    expansionIds.forEach(id => {
      this.expansionRegistry.install(id, this.hookManager, io);
    });
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  removeRoom(roomId: string) {
    this.rooms.delete(roomId);
  }

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
  }
}
