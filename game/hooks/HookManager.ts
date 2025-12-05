import { GameHook, HookCallback, HookContext } from './types';

/**
 * HookManager - Central system for managing game hooks
 * Allows expansions to register callbacks for specific game events
 */
export class HookManager {
    private hooks: Map<GameHook, HookCallback[]> = new Map();

    /**
     * Register a callback for a specific hook
     */
    register(hookName: GameHook, callback: HookCallback): void {
        if (!this.hooks.has(hookName)) {
            this.hooks.set(hookName, []);
        }
        this.hooks.get(hookName)!.push(callback);
        console.log(`[HookManager] Registered callback for hook: ${hookName}`);
    }

    /**
     * Trigger a hook with the given context
     * All registered callbacks will be called in order
     * Each callback can modify the context
     */
    async trigger(hookName: GameHook, context: HookContext): Promise<HookContext> {
        const callbacks = this.hooks.get(hookName) || [];

        if (callbacks.length === 0) {
            return context;
        }

        console.log(`[HookManager] Triggering hook: ${hookName} (${callbacks.length} callbacks)`);

        let result = context;

        for (const callback of callbacks) {
            try {
                result = await callback(result);

                // Allow hooks to stop propagation
                if (result.stopPropagation) {
                    console.log(`[HookManager] Hook ${hookName} stopped propagation`);
                    break;
                }
            } catch (error) {
                console.error(`[HookManager] Error in hook ${hookName}:`, error);
                // Continue with other callbacks even if one fails
            }
        }

        return result;
    }

    /**
     * Clear all callbacks for a specific hook, or all hooks if no name provided
     */
    clear(hookName?: GameHook): void {
        if (hookName) {
            this.hooks.delete(hookName);
            console.log(`[HookManager] Cleared callbacks for hook: ${hookName}`);
        } else {
            this.hooks.clear();
            console.log(`[HookManager] Cleared all hooks`);
        }
    }

    /**
     * Get the number of registered callbacks for a hook
     */
    getCallbackCount(hookName: GameHook): number {
        return this.hooks.get(hookName)?.length || 0;
    }

    /**
     * Check if a hook has any registered callbacks
     */
    hasCallbacks(hookName: GameHook): boolean {
        return this.getCallbackCount(hookName) > 0;
    }
}
