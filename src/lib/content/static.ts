import { publishedAudiences, audiences } from '@/content/audiences';
import { integrations } from '@/content/integrations';
import { publishedSolutions, solutions } from '@/content/solutions';
import { siteNavigation } from '@/content/siteNavigation';
import type { ContentBlock, ContentStatus, PublicContentItem } from '@/content/types';
import type { VideoConfig } from '@/content/types';

export type SitePageType = 'home' | 'solutions_index' | 'solution_detail' | 'audiences_index' | 'audience_detail' | 'integrations' | 'pricing' | 'contact';

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
  status: ContentStatus;
  sortOrder: number;
  blocks: ContentBlock[];
  allBlockMeta?: Array<{ id?: number | string; page_id?: number | string; pageId?: number | string; block_key?: string; blockKey?: string; type: string; status: ContentStatus | string; sort_order?: number; sortOrder?: number }>;
};

const detailPage = (section: 'megoldasaink' | 'kinek-szol', type: SitePageType, item: PublicContentItem): SitePage => ({
  route: `/${section}/${item.slug}/`,
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
  blocks: item.blocks,
});

export const staticPages: SitePage[] = [
  {
    route: '/', slug: 'home', type: 'home', title: 'Easylink', seoTitle: 'Easylink | Ügyviteli rendszer KKV-knak', seoDescription: 'Modern Easylink public site ügyviteli, integrációs és AI asszisztens iránnyal.', heroEyebrow: 'Easylink ügyvitel + AI', heroTitle: 'easyLink ERP', heroDescription: 'Felejtsd el a táblázatokat! Olyan ügyviteli rendszert adunk a kezedbe, amivel egyetlen, átlátható felületen irányíthatod a számlázást, az adminisztrációt és az ügyfélnyilvántartást.', heroAsset: '/assets/nati/hero-bg-flow-03.webp', status: 'published', sortOrder: 0,
    blocks: [],
    allBlockMeta: [],
  },
  { route: '/megoldasaink/', slug: 'megoldasaink', type: 'solutions_index', title: 'Megoldásaink', seoTitle: 'Megoldásaink | Easylink', seoDescription: 'Easylink ügyviteli megoldások.', heroEyebrow: 'Megoldásaink', heroTitle: 'Egy rendszer a napi működés kulcspontjaira.', heroDescription: 'Válaszd ki, melyik működési területet szeretnéd átláthatóbbá tenni: pénzügy, HR, CRM, dokumentumkezelés, kontrolling vagy AI támogatás.', heroAsset: '/assets/nati/hero-bg-flow-01.webp', status: 'published', sortOrder: 10, blocks: publishedSolutions.map((item) => ({ type: 'feature-list', title: item.title, body: item.shortDescription, items: [item.slug] })) },
  ...solutions.map((item) => detailPage('megoldasaink', 'solution_detail', item)),
  { route: '/kinek-szol/', slug: 'kinek-szol', type: 'audiences_index', title: 'Kinek szól?', seoTitle: 'Kinek szól? | Easylink', seoDescription: 'Easylink célcsoportok.', heroEyebrow: 'Kinek szól?', heroTitle: 'Ügyvitel a vállalkozásod működéséhez igazítva.', heroDescription: 'Az Easylink különböző működési modellekhez igazítható: szálláshelyeknek, vendéglátóhelyeknek és szolgáltató vállalkozásoknak.', heroAsset: '/assets/nati/hero-bg-flow-02.webp', status: 'published', sortOrder: 20, blocks: publishedAudiences.map((item) => ({ type: 'feature-list', title: item.title, body: item.shortDescription, items: [item.slug] })) },
  ...audiences.map((item) => detailPage('kinek-szol', 'audience_detail', item)),
  { route: '/integraciok/', slug: 'integraciok', type: 'integrations', title: 'Integrációk', seoTitle: 'Integrációk | Easylink', seoDescription: 'Integrációs irányok és adatkapcsolatok.', heroEyebrow: 'Integrációk', heroTitle: 'Kapcsolódások, adatáramlás, tisztább működés.', heroDescription: 'Az Easylink célja, hogy a fontos üzleti adatok összekapcsolhatók legyenek.', heroAsset: '/assets/nati/hero-bg-flow-01.webp', status: 'published', sortOrder: 30, blocks: [{ type: 'feature-list', title: 'Integrációs irányok', items: integrations.map((item) => `${item.title}: ${item.shortDescription}`) }] },
  { route: '/arak/', slug: 'arak', type: 'pricing', title: 'Árak', seoTitle: 'Árak | Easylink', seoDescription: 'Easylink árazási irányok.', heroEyebrow: 'Árak', heroTitle: 'Árazás, ami a működésedhez igazodik.', heroDescription: 'Az Easylink bevezetés modulokra, integrációs igényre és ügyviteli folyamatokra szabható.', heroAsset: '/assets/nati/hero-bg-flow-02.webp', status: 'published', sortOrder: 40, blocks: [
    { type: 'feature-list', title: 'Mitől függhet az ár?', items: ['Választott moduloktól: pénzügy, CRM, dokumentumkezelés, kontrolling vagy AI irány.', 'Cégmérettől, felhasználói köröktől és adminisztrációs összetettségtől.', 'Előkészített vagy később bizonyított integrációktól.', 'Bevezetési, adat-előkészítési és támogatási igényektől.'] },
    { type: 'text', title: 'Demó alapján pontosítunk', body: 'A public oldalon nem közlünk konkrét díjat. Demó során a modulokat, a cégméretet és az integrációs előkészítést együtt mérjük fel.' },
    { type: 'cta', title: 'Kérj demót, és beszéljük át a modulokat.', body: 'A pontos ajánlat a választott funkcióktól, cégmérettől és integrációs igényektől függ.', items: [{ label: 'Demót kérek', url: '/kapcsolat/' }] },
  ] },
  { route: '/kapcsolat/', slug: 'kapcsolat', type: 'contact', title: 'Kapcsolat', seoTitle: 'Kapcsolat | Easylink', seoDescription: 'Kapcsolatfelvétel Easylink bevezetéshez.', heroEyebrow: 'Kapcsolat', heroTitle: 'Kapcsolódjunk össze.', heroDescription: 'Kérj bemutatót vagy egyeztetést az Easylink bevezetési lehetőségeiről.', heroAsset: '/assets/nati/hero-bg-flow-03.webp', status: 'published', sortOrder: 50, blocks: [{ type: 'text', title: 'Kapcsolat', body: 'Írj nekünk, vagy kérj demót az alábbi kapcsolati adatokon.' }, { type: 'feature-list', title: 'Miben tudunk segíteni?', items: ['Megnézzük, mely modulok illenek a jelenlegi működésedhez.', 'Átbeszéljük a hotel/szálláshely, vendéglátó vagy szolgáltatói fókuszt.', 'Összegyűjtjük, milyen integrációs irányokat érdemes előkészíteni.'] }] },
];

export const staticNavigationItems = siteNavigation.map((item, index) => ({ ...item, sortOrder: index + 1, status: 'published' as ContentStatus }));
export const getStaticPageByRoute = (route: string) => staticPages.find((page) => page.route === route && page.status === 'published');
export const getStaticPageBySlug = (type: string, slug: string) => staticPages.find((page) => page.type === type && page.slug === slug && page.status === 'published');
