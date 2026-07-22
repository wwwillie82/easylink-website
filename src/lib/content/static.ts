import { publishedAudiences, audiences } from '@/content/audiences';
import { integrations } from '@/content/integrations';
import { publishedSolutions, solutions } from '@/content/solutions';
import { siteNavigation } from '@/content/siteNavigation';
import type { ContentBlock, ContentStatus, PublicContentItem } from '@/content/types';
import type { VideoConfig } from '@/content/types';

export type SitePageType = 'home' | 'solutions_index' | 'solution_detail' | 'audiences_index' | 'audience_detail' | 'integrations' | 'pricing' | 'contact' | 'content_page';

export type SitePage = {
  id?: number | string;
  route: string;
  slug: string;
  type: SitePageType | string;
  title: string;
  seoTitle: string;
  seoDescription: string;
  heroEyebrow: string;
  heroTitle: string;
  heroDescription: string;
  heroAsset: string;
  heroVideo?: VideoConfig | null;
  heroHeight?: string;
  heroImageFit?: string;
  heroImagePositionX?: number;
  heroImagePositionY?: number;
  heroImagePositionMobileX?: number;
  heroImagePositionMobileY?: number;
  heroOverlayStrength?: string;
  heroImageScale?: number;
  presentation?: { heroVariant?: 'listing' | 'detail'; [key: string]: unknown };
  status: ContentStatus;
  sortOrder: number;
  blocks: ContentBlock[];
  allBlockMeta?: Array<{ id?: number | string; page_id?: number | string; pageId?: number | string; block_key?: string; blockKey?: string; type: string; status: ContentStatus | string; sort_order?: number; sortOrder?: number }>;
};

const detailRoute = (section: 'megoldasaink' | 'kinek-szol', item: PublicContentItem) => `/${section}/${item.slug}/`;
const staticSolutionId = (index: number) => 100 + index + 1;
const staticAudienceId = (index: number) => 200 + index + 1;
const relatedItems = (ids: number[]) => ids.map((target_page_id) => ({ target_type: 'page', target_page_id, title_override: '' }));
const detailPage = (section: 'megoldasaink' | 'kinek-szol', type: SitePageType, item: PublicContentItem, id: number, relatedTargetIds: number[]): SitePage => ({
  id,
  route: detailRoute(section, item),
  slug: item.slug,
  type,
  title: item.title,
  seoTitle: item.seoTitle,
  seoDescription: item.seoDescription,
  heroEyebrow: section === 'megoldasaink' ? 'Megoldásaink' : 'Kinek szól?',
  heroTitle: item.heroTitle,
  heroDescription: item.heroDescription,
  heroAsset: item.media.path,
  status: item.status,
  sortOrder: item.order,
  presentation: { heroVariant: 'detail' },
  blocks: [
    ...item.blocks,
    { type: 'related-links', title: 'Kapcsolódó oldalak', items: relatedItems(relatedTargetIds) },
  ],
});

export const staticPages: SitePage[] = [
  {
    route: '/', slug: 'home', type: 'home', title: 'Easylink', seoTitle: 'Easylink | Ügyviteli rendszer KKV-knak', seoDescription: 'Modern Easylink public site ügyviteli, integrációs és AI asszisztens iránnyal.', heroEyebrow: 'Easylink ügyvitel + AI', heroTitle: 'easyLink ERP', heroDescription: 'Felejtsd el a táblázatokat! Olyan ügyviteli rendszert adunk a kezedbe, amivel egyetlen, átlátható felületen irányíthatod a számlázást, az adminisztrációt és az ügyfélnyilvántartást.', heroAsset: '/assets/nati/hero-bg-flow-03.webp', status: 'published', sortOrder: 0,
    blocks: [],
    allBlockMeta: [],
  },
  { route: '/megoldasaink/', slug: 'megoldasaink', type: 'solutions_index', title: 'Megoldásaink', seoTitle: 'Megoldásaink | Easylink', seoDescription: 'Easylink ügyviteli megoldások.', heroEyebrow: 'Megoldásaink', heroTitle: 'Egy rendszer a napi működés kulcspontjaira.', heroDescription: 'Válaszd ki, melyik működési területet szeretnéd átláthatóbbá tenni: pénzügy, HR, CRM, dokumentumkezelés, kontrolling vagy AI támogatás.', heroAsset: '/assets/nati/hero-bg-flow-01.webp', status: 'published', sortOrder: 10, presentation: { heroVariant: 'listing' }, blocks: [{ type: 'cards', title: 'Megoldásaink', body: 'Válaszd ki, melyik működési területet szeretnéd átláthatóbbá tenni.', presentation: { sectionGroupKey: 'static-solutions-listing-main', sectionTheme: 'light', layout: 'grid', columnPosition: 1 }, items: publishedSolutions.map((item) => ({ target_type: 'legacy', title: item.title, text: item.shortDescription, href: detailRoute('megoldasaink', item) })) }] },
  ...solutions.map((item, index) => detailPage('megoldasaink', 'solution_detail', item, staticSolutionId(index), solutions.map((_, targetIndex) => staticSolutionId(targetIndex)).filter((targetId) => targetId !== staticSolutionId(index)).slice(0, 3))),
  { route: '/kinek-szol/', slug: 'kinek-szol', type: 'audiences_index', title: 'Kinek szól?', seoTitle: 'Kinek szól? | Easylink', seoDescription: 'Easylink célcsoportok.', heroEyebrow: 'Kinek szól?', heroTitle: 'Ügyvitel a vállalkozásod működéséhez igazítva.', heroDescription: 'Az Easylink különböző működési modellekhez igazítható: szálláshelyeknek, vendéglátóhelyeknek és szolgáltató vállalkozásoknak.', heroAsset: '/assets/nati/hero-bg-flow-02.webp', status: 'published', sortOrder: 20, presentation: { heroVariant: 'listing' }, blocks: [{ type: 'cards', title: 'Kinek szól?', body: 'Válaszd ki a vállalkozásodhoz legközelebb álló működési modellt.', presentation: { sectionGroupKey: 'static-audiences-listing-main', sectionTheme: 'light', layout: 'grid', columnPosition: 1 }, items: publishedAudiences.map((item) => ({ target_type: 'legacy', title: item.title, text: item.shortDescription, href: detailRoute('kinek-szol', item) })) }] },
  ...audiences.map((item, index) => detailPage('kinek-szol', 'audience_detail', item, staticAudienceId(index), audiences.map((_, targetIndex) => staticAudienceId(targetIndex)).filter((targetId) => targetId !== staticAudienceId(index)))),
  { route: '/integraciok/', slug: 'integraciok', type: 'integrations', title: 'Integrációk', seoTitle: 'Integrációk | Easylink', seoDescription: 'Integrációs irányok és adatkapcsolatok.', heroEyebrow: 'Integrációk', heroTitle: 'Kapcsolódások, adatáramlás, tisztább működés.', heroDescription: 'Az Easylink célja, hogy a fontos üzleti adatok összekapcsolhatók legyenek.', heroAsset: '/assets/nati/hero-bg-flow-01.webp', status: 'published', sortOrder: 30, blocks: [
    { type: 'text', title: 'Integrációs irányok', body: 'Kapcsolódások, adatáramlás, tisztább működés.', presentation: { sectionGroupKey: 'static-integrations-main', sectionTheme: 'gradient-light', layout: 'stack', columnPosition: 1, contentLayout: 'lead', headingScale: 'display' } },
    { type: 'cards', title: 'Integrációs irányok', body: 'Előkészített kapcsolódási irányok: nem kész runtime integrációs állítások.', presentation: { sectionGroupKey: 'static-integrations-main', sectionTheme: 'gradient-light', layout: 'stack', columnPosition: 2 }, items: integrations.map((item) => ({ target_type: 'legacy', title: item.title, text: item.shortDescription, href: `/integraciok/#${item.slug}` })) },
  ] },
  { route: '/arak/', slug: 'arak', type: 'pricing', title: 'Árak', seoTitle: 'Árak | Easylink', seoDescription: 'Easylink árazási irányok.', heroEyebrow: 'Árak', heroTitle: 'Árazás, ami a működésedhez igazodik.', heroDescription: 'Az Easylink bevezetés modulokra, integrációs igényre és ügyviteli folyamatokra szabható.', heroAsset: '/assets/nati/hero-bg-flow-02.webp', status: 'published', sortOrder: 40, blocks: [
    { type: 'feature-list', title: 'Mitől függhet az ár?', presentation: { sectionGroupKey: 'static-pricing-main', layout: 'grid', gridColumns: 2, columnRatio: '1:1', columnPosition: 1, surface: 'polished', headingScale: 'section' }, items: ['Választott moduloktól: pénzügy, CRM, dokumentumkezelés, kontrolling vagy AI irány.', 'Cégmérettől, felhasználói köröktől és adminisztrációs összetettségtől.', 'Előkészített vagy később bizonyított integrációktól.', 'Bevezetési, adat-előkészítési és támogatási igényektől.'] },
    { type: 'text', title: 'Demó alapján pontosítunk', presentation: { sectionGroupKey: 'static-pricing-main', layout: 'grid', gridColumns: 2, columnRatio: '1:1', columnPosition: 2, surface: 'polished', headingScale: 'section', surfaceVariant: 'gradient' }, body: 'A public oldalon nem közlünk konkrét díjat. Demó során a modulokat, a cégméretet és az integrációs előkészítést együtt mérjük fel.' },
    { type: 'cta', title: 'Kérj demót, és beszéljük át a modulokat.', body: 'A pontos ajánlat a választott funkcióktól, cégmérettől és integrációs igényektől függ.', items: [{ label: 'Demót kérek', url: '/kapcsolat/', presentationRole: 'cta-section' }] },
  ] },
  { route: '/kapcsolat/', slug: 'kapcsolat', type: 'contact', title: 'Kapcsolat', seoTitle: 'Kapcsolat | Easylink', seoDescription: 'Kapcsolatfelvétel Easylink bevezetéshez.', heroEyebrow: 'Kapcsolat', heroTitle: 'Kapcsolódjunk össze.', heroDescription: 'Kérj bemutatót vagy egyeztetést az Easylink bevezetési lehetőségeiről.', heroAsset: '/assets/nati/hero-bg-flow-03.webp', status: 'published', sortOrder: 50, blocks: [{ type: 'text', title: 'Kapcsolat', body: 'Írj nekünk, vagy kérj demót az alábbi kapcsolati adatokon.', presentation: { sectionGroupKey: 'static-contact-main', layout: 'grid', gridColumns: 2, columnRatio: '0.85:1.15', columnPosition: 1, surface: 'polished', headingScale: 'prominent', bodyWhitespace: 'preserve-lines' } }, { type: 'feature-list', title: 'Miben tudunk segíteni?', presentation: { sectionGroupKey: 'static-contact-main', layout: 'grid', gridColumns: 2, columnRatio: '0.85:1.15', columnPosition: 2, surface: 'polished', headingScale: 'prominent' }, items: ['Megnézzük, mely modulok illenek a jelenlegi működésedhez.', 'Átbeszéljük a hotel/szálláshely, vendéglátó vagy szolgáltatói fókuszt.', 'Összegyűjtjük, milyen integrációs irányokat érdemes előkészíteni.'] }] },
];

export const staticNavigationItems = siteNavigation.map((item, index) => ({ ...item, sortOrder: index + 1, status: 'published' as ContentStatus }));
export const getStaticPageByRoute = (route: string) => staticPages.find((page) => page.route === route && page.status === 'published');
export const getStaticPageBySlug = (type: string, slug: string) => staticPages.find((page) => page.type === type && page.slug === slug && page.status === 'published');
