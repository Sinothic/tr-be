import { describe, it, expect } from "vitest";
import { Room } from "../Room";
import { MAX_REJECTIONS } from "../constants";

describe("Room - Cumulative Rejections Rule", () => {
    it("should NOT reset rejections on approval and end game after 5 cumulative rejections", async () => {
        const room = new Room("test-room-cumulative");
        room.minPlayers = 5;

        // Add 5 players
        const players = [];
        for (let i = 0; i < 5; i++) {
            players.push(room.addPlayer(`socket-${i}`, `Player${i}`));
        }

        room.startGame();

        let cumulativeRejections = 0;

        // Phase 1: 1 Rejection then 1 Approval
        // 1. Select Team
        room.selectTeam([players[0].playerId, players[1].playerId]);
        // 2. Reject
        players.forEach(p => room.submitVote(p.id, false));
        room.tallyVotes();
        cumulativeRejections++;

        expect(room.voteRejections).toBe(cumulativeRejections);

        // 3. Select Team again
        room.selectTeam([players[0].playerId, players[1].playerId]);
        // 4. Approve
        players.forEach(p => room.submitVote(p.id, true));
        room.tallyVotes();

        console.log("Rejections after approval:", room.voteRejections);

        // START OF CHANGE: Logic says we should NOT reset.
        // So expect(room.voteRejections).toBe(1);
        // But currently it resets, so this test will fail if I assert logic before fix.
        // I will write the test assuming the DESIRED behavior.
        expect(room.voteRejections).toBe(cumulativeRejections);

        // Now resolve mission to move forward (irrelevant to rejection count but good for simulation)
        room.submitMissionAction(players[0].id, true);
        room.submitMissionAction(players[1].id, true);
        await room.resolveMission();

        // Now accumulate 4 more rejections
        for (let i = 0; i < 4; i++) {
            room.selectTeam([players[0].playerId, players[1].playerId]);
            players.forEach(p => room.submitVote(p.id, false));
            const result = room.tallyVotes();
            cumulativeRejections++;

            if (i === 3) {
                // This is the 5th total rejection (1 + 4)
                expect(result.penaltyApplied).toBe(true);
            } else {
                expect(result.penaltyApplied).toBe(false);
                expect(room.voteRejections).toBe(cumulativeRejections);
            }
        }

        expect(room.voteRejections).toBe(0); // Should be reset after penalty? Or just game over.
        expect(room.phase).toBe("GAME_OVER");
        expect(room.getWinner()).toBe("SPY");
    });
});
