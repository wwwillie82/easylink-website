import type { SitePage } from '@/lib/content/static';
import type { PublicRouteIndex, PublicContentMode } from '@/lib/content/public-pages';

export type SupportedPublicPageType = 'solutions_index' | 'solution_detail' | 'audiences_index' | 'audience_detail' | 'integrations' | 'pricing' | 'contact' | 'content_page';

export type PublicPageRendererProps = {
  page: SitePage;
  routeIndex: PublicRouteIndex;
  mode: PublicContentMode;
};
