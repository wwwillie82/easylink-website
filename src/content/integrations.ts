export type Integration = {
  title: string;
  slug: string;
  shortDescription: string;
  detail: string;
  order: number;
  status: 'published' | 'draft';
  media: { path: string; alt: string; todo: string };
};

const integrationItems = [
  { title: 'NAV Online Számla', shortDescription: 'Számlaadatok és pénzügyi státuszok későbbi összekapcsolásának fontos iránya.', detail: 'Előkészített kapcsolódási irány a számlázási és pénzügyi áttekintéshez; a public site nem állít kész runtime NAV kapcsolatot.' },
  { title: 'Magyar bankok / PSD2 / Aggreg8', shortDescription: 'Banki státuszok és pénzmozgások vezetői áttekintésének támogatott iránya.', detail: 'Tervezett / támogatott irány banki információk óvatos, jogosultságkezelt felhasználásához; konkrét éles kapcsolatot csak bizonyított implementáció után kommunikálunk.' },
  { title: 'Hostware', shortDescription: 'Szálláshelyi működéshez kapcsolódó integrációs irány / előkészítés.', detail: 'Hotel és szálláshely fókusz miatt fontos kapcsolódási lehetőség, jelenleg integrációs irányként szerepel, nem kész integrációként.' },
  { title: 'Számlázz.hu', shortDescription: 'Számlázási folyamatok és ügyviteli adatok összerendezésének lehetséges iránya.', detail: 'Előkészített számlázó kapcsolódási irány, amely később a pénzügyi modul és kontrolling nézet része lehet.' },
  { title: 'Billingo', shortDescription: 'Számlázási adatok és pénzügyi teendők összekötésének lehetséges iránya.', detail: 'Tervezett / támogatott irány számlázási státuszok átláthatóbb megjelenítéséhez, kész éles integráció állítása nélkül.' },
  { title: 'Cégjelző', shortDescription: 'Céginformációk és kockázati jelzések későbbi adatkapcsolati iránya.', detail: 'Előkészített kapcsolódási irány ügyfél- és partneradatok ellenőrzéséhez, vezetői figyelmeztetésekhez és kontrolling nézetekhez.' },
];

const slugify = (title: string) => title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s*\/\s*/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const integrations: Integration[] = integrationItems.map((item, index) => ({
  ...item,
  slug: slugify(item.title),
  order: index + 1,
  status: 'published',
  media: { path: `/assets/nati/integrations/${index + 1}.webp`, alt: `${item.title} placeholder`, todo: 'Későbbi integrációs vizuál/logó helye.' },
}));

export const publishedIntegrations = integrations.filter((item) => item.status === 'published').sort((a, b) => a.order - b.order);
