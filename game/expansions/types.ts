import { HookManager } from '../hooks/HookManager';

/**
 * Expansion plugin interface
 * All expansions must implement this interface
 */
export interface ExpansionPlugin {
    /** Unique identifier for the expansion */
    id: string;

    /** Human-readable name */
    name: string;

    /** Version string */
    version: string;

    /**
     * Install the expansion
     * Register all hooks and initialize any necessary state
     */
    install(hookManager: HookManager, io?: any): void;

    /**
     * Uninstall the expansion
     * Clean up hooks and state
     */
    uninstall(hookManager: HookManager): void;

    /**
     * Register socket event handlers for this expansion
     * Called when a socket needs to interact with a room that has this expansion
     * @param socket - The socket.io socket instance
     * @param room - The room instance
     * @param io - The socket.io server instance
     */
    registerSocketHandlers?(socket: any, room: any, io: any): void;
}

/**
 * Expansion registry
 * Manages loading and unloading of expansions
 */
export class ExpansionRegistry {
    private expansions = new Map<string, ExpansionPlugin>();
    private installed = new Set<string>();

    /**
     * Register an expansion (doesn't install it yet)
     */
    register(expansion: ExpansionPlugin): void {
        this.expansions.set(expansion.id, expansion);
        console.log(`[ExpansionRegistry] Registered expansion: ${expansion.name} (${expansion.id})`);
    }

    /**
     * Install an expansion by ID
     */
    install(expansionId: string, hookManager: HookManager, io?: any): boolean {
        const expansion = this.expansions.get(expansionId);

        if (!expansion) {
            console.error(`[ExpansionRegistry] Expansion not found: ${expansionId}`);
            return false;
        }

        if (this.installed.has(expansionId)) {
            console.warn(`[ExpansionRegistry] Expansion already installed: ${expansionId}`);
            return false;
        }

        try {
            expansion.install(hookManager, io);
            this.installed.add(expansionId);
            console.log(`[ExpansionRegistry] Installed expansion: ${expansion.name}`);
            return true;
        } catch (error) {
            console.error(`[ExpansionRegistry] Failed to install expansion ${expansionId}:`, error);
            return false;
        }
    }

    /**
     * Uninstall an expansion by ID
     */
    uninstall(expansionId: string, hookManager: HookManager): boolean {
        const expansion = this.expansions.get(expansionId);

        if (!expansion) {
            console.error(`[ExpansionRegistry] Expansion not found: ${expansionId}`);
            return false;
        }

        if (!this.installed.has(expansionId)) {
            console.warn(`[ExpansionRegistry] Expansion not installed: ${expansionId}`);
            return false;
        }

        try {
            expansion.uninstall(hookManager);
            this.installed.delete(expansionId);
            console.log(`[ExpansionRegistry] Uninstalled expansion: ${expansion.name}`);
            return true;
        } catch (error) {
            console.error(`[ExpansionRegistry] Failed to uninstall expansion ${expansionId}:`, error);
            return false;
        }
    }

    /**
     * Check if an expansion is installed
     */
    isInstalled(expansionId: string): boolean {
        return this.installed.has(expansionId);
    }

    /**
     * Get all registered expansion IDs
     */
    getRegisteredIds(): string[] {
        return Array.from(this.expansions.keys());
    }

    /**
     * Get all installed expansion IDs
     */
    getInstalledIds(): string[] {
        return Array.from(this.installed);
    }
}
