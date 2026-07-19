import ContentPageRenderer from './ContentPageRenderer.astro';
import SolutionsIndexRenderer from './SolutionsIndexRenderer.astro';
import SolutionDetailRenderer from './SolutionDetailRenderer.astro';
import AudiencesIndexRenderer from './AudiencesIndexRenderer.astro';
import AudienceDetailRenderer from './AudienceDetailRenderer.astro';
import IntegrationsRenderer from './IntegrationsRenderer.astro';
import PricingRenderer from './PricingRenderer.astro';
import ContactRenderer from './ContactRenderer.astro';
import type { SupportedPublicPageType } from './types';

export type PublicPageRenderer = typeof ContentPageRenderer;
export const supportedPublicPageTypes = ['solutions_index', 'solution_detail', 'audiences_index', 'audience_detail', 'integrations', 'pricing', 'contact', 'content_page'] as const satisfies readonly SupportedPublicPageType[];

const renderers = {
  solutions_index: SolutionsIndexRenderer,
  solution_detail: SolutionDetailRenderer,
  audiences_index: AudiencesIndexRenderer,
  audience_detail: AudienceDetailRenderer,
  integrations: IntegrationsRenderer,
  pricing: PricingRenderer,
  contact: ContactRenderer,
  content_page: ContentPageRenderer,
} satisfies Record<SupportedPublicPageType, PublicPageRenderer>;

export function isSupportedPublicPageType(type: string): type is SupportedPublicPageType {
  return supportedPublicPageTypes.includes(type as SupportedPublicPageType);
}

export function getPublicPageRenderer(type: string): PublicPageRenderer {
  if (!isSupportedPublicPageType(type)) throw new Error(`Unsupported published public page.type: ${type}`);
  return renderers[type];
}
