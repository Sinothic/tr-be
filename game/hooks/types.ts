/**
 * Available game hooks that expansions can register to
 */
export type GameHook =
    | 'game:start'           // Triggered when game starts (before phase change)
    | 'game:end'             // Triggered when game ends
    | 'roles:assign'         // Triggered after base roles are assigned
    | 'team:select'          // Triggered when team is selected
    | 'vote:submit'          // Triggered when a player submits a vote
    | 'vote:tally'           // Triggered when votes are tallied
    | 'mission:submit'       // Triggered when mission action is submitted
    | 'mission:resolve'      // Triggered after mission is resolved
    | 'player:join'          // Triggered when player joins room
    | 'player:disconnect'    // Triggered when player disconnects
    | 'state:sync';          // Triggered when syncing game state to player

/**
 * Context passed to hook callbacks
 * Hooks can modify this context and return it
 */
export interface HookContext {
    room?: any;
    player?: any;
    players?: any[];
    result?: any;
    state?: any;
    vote?: boolean;
    playerId?: string;
    targetId?: string;
    nextPhase?: string;
    revealOrder?: string[];
    [key: string]: any; // Allow additional properties
}

/**
 * Hook callback function signature
 */
export type HookCallback = (context: HookContext) => HookContext | Promise<HookContext>;
