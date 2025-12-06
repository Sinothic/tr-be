import { ExpansionPlugin } from '../types'
import { HookManager } from '../../hooks/HookManager'

/**
 * Blind Spies Expansion
 * 
 * Removes spy visibility from spies themselves.
 * Spies will not know who their allies are, making the game more challenging.
 * 
 * Compatibility:
 * - Works standalone
 * - Compatible with Merlin & Assassin (Merlin still sees all spies)
 */
export const BlindSpiesExpansion: ExpansionPlugin = {
    id: 'blind-spies',
    name: 'Espiões Cegos',
    version: '1.0.0',

    install(hookManager: HookManager) {
        console.log('[BlindSpies] Installing expansion...')

        // Hook: Remove spy visibility from spies in state sync
        hookManager.register('state:sync', (context) => {
            const { player, state } = context

            // Remove spy visibility for spies (but not for Merlin)
            // This allows Merlin to still see spies if merlin-assassin expansion is active
            if (player.role === 'SPY' && player.specialRole !== 'MERLIN') {
                context.state.spies = undefined
                console.log(`[BlindSpies] Hiding spies from ${player.nickname}`)
            }

            return context
        })

        console.log('[BlindSpies] Expansion installed successfully')
    },

    uninstall(hookManager: HookManager) {
        console.log('[BlindSpies] Uninstalling expansion...')
        // Hooks are automatically cleared by HookManager when needed
        // No additional cleanup required
    }
}
