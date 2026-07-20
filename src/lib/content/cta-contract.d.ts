export const GOLDEN_CTA_KEY: 'golden:cta-section';
export const CTA_SECTION_ROLE: 'cta-section';
export const PRICING_CTA_ROLE: 'pricing-cta';
export const CTA_SECTION_SORT_ORDER: 900;
export type CtaBlock = { id?: number; page_id?: number; blockKey?: string; block_key?: string; type?: string; title?: string; body?: string; items?: unknown; sort_order?: number; status?: string };
export function normalizeDefaultCta(value?: Record<string, unknown>): Record<string, string>;
export function canonicalCtaBlockFromDefault(defaultCta?: Record<string, unknown>): { block_key: string; type: 'cta'; title: string; body: string; items: Array<Record<string, string>>; sort_order: number; status: 'published' };
export function blockItems(block?: CtaBlock): unknown[];
export function itemHasRole(item: unknown, role: string): boolean;
export function blockHasExplicitRole(block: CtaBlock | undefined, role: string): boolean;
export function isCanonicalCtaSection(block: CtaBlock | undefined): boolean;
export function isPricingCta(block: CtaBlock | undefined): boolean;
export function assertSingleCanonicalCta<T extends CtaBlock>(blocks?: T[]): T | null;
export function mergePricingCtaDefaults(existingBlock: CtaBlock, targetBlock: CtaBlock): CtaBlock;

export function mergeSpecialCtaDefaults(existingBlock: CtaBlock, defaultCta: Record<string, unknown> | undefined, role: string): CtaBlock;
