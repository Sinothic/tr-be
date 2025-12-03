// This file will contain the main game settings.

export const PLAYER_RECONNECT_TIMEOUT_SECONDS = 600;

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 20;

export const SPY_COUNT: Record<number, number> = {
  1: 0,
  2: 1,
  3: 1,
  4: 1,
  5: 2,
  6: 2,
  7: 3,
  8: 3,
  9: 3,
  10: 4,
  11: 4,
  12: 4,
  13: 5,
  14: 5,
  15: 5,
  16: 6,
  17: 6,
  18: 6,
  19: 7,
  20: 7,
};

export const MISSION_CONFIG: Record<number, number[]> = {
  1: [1, 1, 1, 1, 1],
  2: [1, 2, 1, 2, 2],
  3: [2, 2, 2, 2, 2],
  4: [2, 2, 2, 3, 3],
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
  11: [3, 4, 4, 5, 5],
  12: [3, 4, 4, 5, 5],
  13: [3, 4, 5, 6, 6],
  14: [4, 5, 5, 6, 6],
  15: [4, 5, 5, 6, 6],
  16: [4, 5, 6, 7, 7],
  17: [5, 6, 6, 7, 7],
  18: [5, 6, 6, 7, 7],
  19: [6, 7, 7, 8, 8],
  20: [6, 7, 7, 8, 8],
};

export const MAX_REJECTIONS = 5;
export const MISSIONS_TO_SUCCEED = 3;
export const MISSIONS_TO_FAIL = 3;