export const HOME_LEGACY_CTA_KEY: '/:cta:4';
export const PAGE_CTA_ROLES: readonly string[];
export function isHomeLegacyCta(block: { blockKey?: string; block_key?: string } | undefined): boolean;
export function isRecognizedPageCta(block: { blockKey?: string; block_key?: string; items?: unknown } | undefined): boolean;
export function pageCtaRoles(block: { blockKey?: string; block_key?: string; items?: unknown } | undefined): string[];
export function pageCtaRole(block: { blockKey?: string; block_key?: string; items?: unknown } | undefined): string | undefined;
export function resolvePageCtaBlock<T extends { blockKey?: string; block_key?: string; items?: unknown; status?: string }>(blocks?: T[], opts?: { role?: string }): T | undefined;
export function withoutPageCtaBlocks<T extends { blockKey?: string; block_key?: string; items?: unknown }>(blocks?: T[]): T[];
export function normalizePageCtaBlock<T extends { items?: unknown }>(block: T | undefined, defaultCta?: Record<string, unknown>): T | undefined;
