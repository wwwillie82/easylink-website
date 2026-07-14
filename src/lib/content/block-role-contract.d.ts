export const GOLDEN_CTA_KEY: 'golden:cta-section';
export const legacyRoleByKey: Readonly<Record<string, readonly string[]>>;
export const fixedPresentationRoles: readonly string[];
export function blockHasRole(block: { blockKey?: string; block_key?: string; items?: unknown }, role: string): boolean;
export function blockFixedRole(block: { blockKey?: string; block_key?: string; items?: unknown }): string | undefined;
export function findRoleBlock<T extends { blockKey?: string; block_key?: string; items?: unknown; type?: string }>(blocks: T[] | undefined, role: string, fallback?: (block: T) => boolean): T | undefined;
export function withoutBlocks<T>(blocks: T[] | undefined, consumed: Array<T | undefined>): T[];
