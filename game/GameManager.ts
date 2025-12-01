import { Room } from "./Room";

export class GameManager {
  rooms: Map<string, Room> = new Map();

  createRoom(minPlayers?: number, expansions?: string[]): Room {
    const roomId = this.generateRoomId();
    const room = new Room(roomId, minPlayers, expansions);
    this.rooms.set(roomId, room);
    return room;
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
