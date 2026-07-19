export function normalizeRootInvariantRoute(route: unknown): string;
export function pageInvariantIdentity(page?: { id?: unknown; title?: unknown; type?: unknown; route?: unknown }): string;
export function assertRootHomePage<T extends { route?: unknown; type?: unknown }>(page: T | null | undefined, context?: string): T;
export function validateRootHomeSnapshot(pages?: Array<{ id?: unknown; title?: unknown; type?: unknown; route?: unknown }>): { ok: true } | { ok: false; error: string };
