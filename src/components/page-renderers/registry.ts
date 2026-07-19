import type { SupportedPublicPageType } from './types';

export const supportedPublicPageTypes = ['solutions_index', 'solution_detail', 'audiences_index', 'audience_detail', 'integrations', 'pricing', 'contact', 'content_page'] as const satisfies readonly SupportedPublicPageType[];

export function isSupportedPublicPageType(type: string): type is SupportedPublicPageType {
  return supportedPublicPageTypes.includes(type as SupportedPublicPageType);
}

export function unsupportedPublicPageTypeError(type: string): Error {
  return new Error(`Unsupported published public page.type: ${type}`);
}
