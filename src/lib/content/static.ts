import { publishedAudiences, audiences } from '@/content/audiences';
import { integrations } from '@/content/integrations';
import { publishedSolutions, solutions } from '@/content/solutions';
import { siteNavigation } from '@/content/siteNavigation';
import type { ContentBlock, ContentStatus, PublicContentItem } from '@/content/types';

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
  status: ContentStatus;
  sortOrder: number;
  blocks: ContentBlock[];
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
    blocks: [
      { type: 'text', title: 'Public site előkészítés', body: 'Nem még egy táblázat, hanem egy átlátható vezetői felület.' },
      { type: 'feature-list', title: 'Megoldásaink', items: publishedSolutions.slice(0, 3).map((item) => item.title) },
      { type: 'feature-list', title: 'Kinek szól?', items: publishedAudiences.map((item) => item.title) },
    ],
  },
  { route: '/megoldasaink/', slug: 'megoldasaink', type: 'solutions_index', title: 'Megoldásaink', seoTitle: 'Megoldásaink | Easylink', seoDescription: 'Easylink ügyviteli megoldások.', heroEyebrow: 'Megoldásaink', heroTitle: 'Egy rendszer a napi működés kulcspontjaira.', heroDescription: 'Moduláris ügyviteli irányok pénzügyre, CRM-re, dokumentumokra, kontrollingra és AI-ra.', heroAsset: '/assets/nati/hero-bg-flow-01.webp', status: 'published', sortOrder: 10, blocks: publishedSolutions.map((item) => ({ type: 'feature-list', title: item.title, body: item.shortDescription, items: [item.slug] })) },
  ...solutions.map((item) => detailPage('megoldasaink', 'solution_detail', item)),
  { route: '/kinek-szol/', slug: 'kinek-szol', type: 'audiences_index', title: 'Kinek szól?', seoTitle: 'Kinek szól? | Easylink', seoDescription: 'Easylink célcsoportok.', heroEyebrow: 'Kinek szól?', heroTitle: 'Iparági fókusz, admin-kompatibilis tartalommal.', heroDescription: 'Iparági fókuszú ügyviteli struktúrák.', heroAsset: '/assets/nati/hero-bg-flow-02.webp', status: 'published', sortOrder: 20, blocks: publishedAudiences.map((item) => ({ type: 'feature-list', title: item.title, body: item.shortDescription, items: [item.slug] })) },
  ...audiences.map((item) => detailPage('kinek-szol', 'audience_detail', item)),
  { route: '/integraciok/', slug: 'integraciok', type: 'integrations', title: 'Integrációk', seoTitle: 'Integrációk | Easylink', seoDescription: 'Integrációs irányok és adatkapcsolatok.', heroEyebrow: 'Integrációk', heroTitle: 'Kapcsolódások, adatáramlás, tisztább működés.', heroDescription: 'Az Easylink célja, hogy a fontos üzleti adatok összekapcsolhatók legyenek.', heroAsset: '/assets/nati/hero-bg-flow-01.webp', status: 'published', sortOrder: 30, blocks: [{ type: 'feature-list', title: 'Integrációs irányok', items: integrations.map((item) => `${item.title}: ${item.shortDescription}`) }] },
  { route: '/arak/', slug: 'arak', type: 'pricing', title: 'Árak', seoTitle: 'Árak | Easylink', seoDescription: 'Easylink árazási irányok.', heroEyebrow: 'Árak', heroTitle: 'Árazás, ami a működésedhez igazodik.', heroDescription: 'Az Easylink bevezetés modulokra, integrációs igényre és ügyviteli folyamatokra szabható.', heroAsset: '/assets/nati/hero-bg-flow-02.webp', status: 'published', sortOrder: 40, blocks: [{ type: 'text', title: 'Egyedi ajánlat', body: 'A pontos ár a kiválasztott moduloktól és integrációs előfeltételektől függ.' }] },
  { route: '/kapcsolat/', slug: 'kapcsolat', type: 'contact', title: 'Kapcsolat', seoTitle: 'Kapcsolat | Easylink', seoDescription: 'Kapcsolatfelvétel Easylink bevezetéshez.', heroEyebrow: 'Kapcsolat', heroTitle: 'Kapcsolódjunk össze.', heroDescription: 'Kérj bemutatót vagy egyeztetést az Easylink bevezetési lehetőségeiről.', heroAsset: '/assets/nati/hero-bg-flow-03.webp', status: 'published', sortOrder: 50, blocks: [{ type: 'text', title: 'Kapcsolatfelvétel', body: 'A deploy/ügyfél felület és a site admin felhasználókezelése külön marad.' }] },
];

export const staticNavigationItems = siteNavigation.map((item, index) => ({ ...item, sortOrder: index + 1, status: 'published' as ContentStatus }));
export const getStaticPageByRoute = (route: string) => staticPages.find((page) => page.route === route && page.status === 'published');
export const getStaticPageBySlug = (type: string, slug: string) => staticPages.find((page) => page.type === type && page.slug === slug && page.status === 'published');
