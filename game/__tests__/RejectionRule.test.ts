import { describe, it, expect, vi } from "vitest";
import { Room } from "../Room";
import { MAX_REJECTIONS } from "../constants";

describe("Room - 5 Rejections Rule", () => {
    it("should end game with SPY win after 5 vote rejections", () => {
        const room = new Room("test-room");
        room.minPlayers = 5;

        // Add 5 players
        for (let i = 0; i < 5; i++) {
            room.addPlayer(`socket-${i}`, `Player${i}`);
        }

        room.startGame(); // Assigns roles, sets phase to TEAM_SELECTION

        // Simulate 5 consecutive rejections
        // We need to loop MAX_REJECTIONS times
        for (let i = 0; i < MAX_REJECTIONS; i++) {
            // 1. Select Team
            const leader = room.players[room.currentLeaderIndex];
            const team = [room.players[0].playerId, room.players[1].playerId]; // Size 2 for 5 players mission 1
            room.selectTeam(team);

            // 2. Vote Reject (All reject)
            room.players.forEach(p => {
                room.submitVote(p.id, false);
            });

            // 3. Tally
            const result = room.tallyVotes();

            // If it's the 5th rejection (index 4), it should trigger penalty
            if (i === MAX_REJECTIONS - 1) {
                expect(result.penaltyApplied).toBe(true);
            } else {
                expect(result.approved).toBe(false);
                expect(room.voteRejections).toBe(i + 1);
            }
        }

        // Assertions after 5 rejections
        expect(room.phase).toBe("GAME_OVER");
        expect(room.getWinner()).toBe("SPY");
    });
});
