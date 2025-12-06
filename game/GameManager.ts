import { Room } from "./Room";
import { HookManager } from "./hooks/HookManager";
import { AVAILABLE_EXPANSIONS } from "./expansions";

export class GameManager {
  rooms: Map<string, Room> = new Map();

  createRoom(minPlayers?: number, expansions?: string[]): Room {
    const roomId = this.generateRoomId();

    // Create a new HookManager for this room (isolated from other rooms)
    const roomHookManager = new HookManager();

    // Install expansions for this room BEFORE creating the room
    if (expansions && expansions.length > 0) {
      this.installExpansions(expansions, roomHookManager);
    }

    const room = new Room(roomId, minPlayers, expansions, roomHookManager);
    this.rooms.set(roomId, room);

    return room;
  }

  /**
   * Install expansions directly on a specific HookManager
   * Bypasses ExpansionRegistry to avoid global state issues
   */
  installExpansions(expansionIds: string[], hookManager: HookManager, io?: any): void {
    expansionIds.forEach(id => {
      const expansion = AVAILABLE_EXPANSIONS[id as keyof typeof AVAILABLE_EXPANSIONS];
      if (expansion) {
        expansion.install(hookManager, io);
        console.log(`[GameManager] Installed expansion ${expansion.name} for room`);
      } else {
        console.warn(`[GameManager] Expansion not found: ${id}`);
      }
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
