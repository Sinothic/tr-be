import { MerlinAssassinExpansion } from './merlin-assassin';

/**
 * Central registry of all available expansions
 * Import and export all expansion plugins here
 */

export const AVAILABLE_EXPANSIONS = {
    'merlin-assassin': MerlinAssassinExpansion,
    // Future expansions will be added here
    // 'plot-thickens': PlotThickensExpansion,
};

/**
 * Get an expansion by ID
 */
export function getExpansion(id: string) {
    return AVAILABLE_EXPANSIONS[id as keyof typeof AVAILABLE_EXPANSIONS];
}

/**
 * Get all available expansion IDs
 */
export function getAvailableExpansionIds(): string[] {
    return Object.keys(AVAILABLE_EXPANSIONS);
}
