import { ExpansionPlugin } from '../types';
import { HookManager } from '../../hooks/HookManager';

/**
 * Merlin & Assassin Expansion
 * 
 * Adds special roles:
 * - MERLIN: Resistance player who can see all spies
 * - ASSASSIN: Spy who can kill Merlin after 3 successful missions
 * 
 * Win condition change:
 * - If Resistance wins 3 missions, Assassin gets one chance to kill Merlin
 * - If Assassin kills Merlin, Spies win
 */
export const MerlinAssassinExpansion: ExpansionPlugin = {
    id: 'merlin-assassin',
    name: 'Merlin & Assassin',
    version: '1.0.0',

    install(hookManager: HookManager) {
        console.log('[MerlinAssassin] Installing expansion...');

        // Hook: Assign special roles after base roles are assigned
        hookManager.register('roles:assign', (context) => {
            const { room } = context;

            const spies = room.players.filter((p: any) => p.role === 'SPY');
            const resistance = room.players.filter((p: any) => p.role === 'RESISTANCE');

            // Assign Merlin to a random Resistance player
            if (resistance.length > 0) {
                const merlinIdx = Math.floor(Math.random() * resistance.length);
                resistance[merlinIdx].specialRole = 'MERLIN';
                console.log(`[MerlinAssassin] Assigned MERLIN to ${resistance[merlinIdx].nickname}`);
            }

            // Assign Assassin to a random Spy
            if (spies.length > 0) {
                const assassinIdx = Math.floor(Math.random() * spies.length);
                spies[assassinIdx].specialRole = 'ASSASSIN';
                console.log(`[MerlinAssassin] Assigned ASSASSIN to ${spies[assassinIdx].nickname}`);
            }

            return context;
        });

        // Hook: Change phase to ASSASSINATION instead of GAME_OVER when Resistance wins
        hookManager.register('mission:resolve', (context) => {
            const { room, nextPhase } = context;

            // If Resistance is about to win (3 successful missions)
            if (room.succeededMissions >= 3 && nextPhase === 'GAME_OVER') {
                console.log('[MerlinAssassin] Resistance won 3 missions, starting ASSASSINATION phase');
                context.nextPhase = 'ASSASSINATION';
            }

            return context;
        });

        // Hook: Add spies visibility for MERLIN in state sync
        hookManager.register('state:sync', (context) => {
            const { player, state, room } = context;

            // Merlin can see all spies
            if (player.specialRole === 'MERLIN') {
                const spiesList = room.players
                    .filter((p: any) => p.role === 'SPY')
                    .map((p: any) => ({ id: p.id, nickname: p.nickname }));

                context.state.spies = spiesList;
                console.log(`[MerlinAssassin] Showing ${spiesList.length} spies to MERLIN`);
            }

            return context;
        });

        console.log('[MerlinAssassin] Expansion installed successfully');
    },

    uninstall(hookManager: HookManager) {
        console.log('[MerlinAssassin] Uninstalling expansion...');
        // Hooks are automatically cleared by HookManager when needed
        // No additional cleanup required
    }
};
