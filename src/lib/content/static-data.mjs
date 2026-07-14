const detail = (section, slug, type, title, order) => ({ route: `/${section}/${slug}/`, slug, type, title, seoTitle: `${title} | Easylink`, seoDescription: `${title} Easylink tartalom.`, heroEyebrow: section === 'megoldasaink' ? 'Megoldásaink' : 'Kinek szól?', heroTitle: title, heroDescription: `${title} áttekintés és szerkeszthető public tartalom.`, heroAsset: '/assets/nati/hero-bg-flow-01.webp', status: 'published', sortOrder: order, blocks: [{ type: 'text', title: 'Mire jó?', body: `${title} rövid szerkeszthető összefoglalója.` }, { type: 'feature-list', title: 'Konkrét fókuszok', items: ['Átlátható működés', 'Kevesebb manuális adminisztráció', 'Vezetői kontrollpontok'] }] });
export const staticPagesData = [
  { route: '/', slug: 'home', type: 'home', title: 'Easylink', seoTitle: 'Easylink | Ügyviteli rendszer KKV-knak', seoDescription: 'Modern Easylink public site ügyviteli, integrációs és AI asszisztens iránnyal.', heroEyebrow: 'Easylink ügyvitel + AI', heroTitle: 'easyLink ERP', heroDescription: 'Felejtsd el a táblázatokat! Olyan ügyviteli rendszert adunk a kezedbe, amivel egyetlen, átlátható felületen irányíthatod a számlázást, az adminisztrációt és az ügyfélnyilvántartást.', heroAsset: '/assets/nati/hero-bg-flow-03.webp', status: 'published', sortOrder: 0, blocks: [
    { type: 'text', title: 'Public site előkészítés', body: 'Nem még egy táblázat, hanem egy átlátható vezetői felület. Az Easylink a pénzügy, adminisztráció, ügyfélkezelés és vezetői kontroll közös nyelvét készíti elő.' },
    { type: 'cards', title: 'Megoldásaink', body: 'Egy rendszer a napi működés kulcspontjaira.', items: [
      { title: 'Pénzügy és számlázás', text: 'Számlázási és pénzügyi státuszok átlátható követése.', url: '/megoldasaink/penzugy-szamlazas/' },
      { title: 'HR és Munkaügy', text: 'Munkavállalói és munkaügyi folyamatok tisztább szervezése.', url: '/megoldasaink/hr-munkaugy/' },
      { title: 'CRM és ügyfélkezelés', text: 'Ügyféladatok és következő lépések vezetői szintű áttekintése.', url: '/megoldasaink/crm-ugyfelkezeles/' },
    ] },
    { type: 'cards', title: 'Kinek szól?', body: 'Iparági fókuszú ügyviteli struktúrák.', items: [
      { title: 'Hoteleknek és szálláshelyeknek', text: 'Vendég-, pénzügyi és adminisztrációs folyamatok átláthatóbb működéséhez.', url: '/kinek-szol/hotelek-szallashelyek/' },
      { title: 'Vendéglátóhelyeknek', text: 'Napi adminisztráció és tisztább működési áttekintés vendéglátásban.', url: '/kinek-szol/vendeglatohelyek/' },
      { title: 'Szolgáltató vállalkozásoknak', text: 'Ügyfélkezelés, dokumentumok és pénzügyi státuszok egy helyen.', url: '/kinek-szol/szolgaltato-vallalkozasok/' },
    ] },
    { type: 'feature-list', title: 'Integrációs irányok', items: ['NAV Online Számla', 'Magyar bankok / PSD2 / Aggreg8', 'Hostware', 'Számlázz.hu', 'Billingo', 'Cégjelző'] },
    { type: 'cta', title: 'Kérj demót, és nézzük meg, hogyan illeszkedhet a működésedhez.', body: 'A pontos irány a moduloktól, integrációktól és a jelenlegi folyamataidtól függ.', items: [{ label: 'Demót kérek', url: '/kapcsolat/' }] },
  ] },
  { route: '/megoldasaink/', slug: 'megoldasaink', type: 'solutions_index', title: 'Megoldásaink', seoTitle: 'Megoldásaink | Easylink', seoDescription: 'Easylink ügyviteli megoldások.', heroEyebrow: 'Megoldásaink', heroTitle: 'Egy rendszer a napi működés kulcspontjaira.', heroDescription: 'Válaszd ki, melyik működési területet szeretnéd átláthatóbbá tenni: pénzügy, HR, CRM, dokumentumkezelés, kontrolling vagy AI támogatás.', heroAsset: '/assets/nati/hero-bg-flow-01.webp', status: 'published', sortOrder: 10, blocks: [
    { type: 'cards', title: 'Megoldás lista', body: 'Válaszd ki, melyik működési területet szeretnéd átláthatóbbá tenni: pénzügy, HR, CRM, dokumentumkezelés, kontrolling vagy AI támogatás.', items: [
      { title: 'Pénzügy és számlázás', text: 'Pénzügyi és számlázási folyamatok vezetői áttekintése.', url: '/megoldasaink/penzugy-szamlazas/' },
      { title: 'HR és Munkaügy', text: 'Munkaügyi feladatok és státuszok követhető rendszerezése.', url: '/megoldasaink/hr-munkaugy/' },
      { title: 'CRM és ügyfélkezelés', text: 'Ügyfélkapcsolati adatok és következő teendők rendezése.', url: '/megoldasaink/crm-ugyfelkezeles/' },
      { title: 'Dokumentumkezelés és adminisztráció', text: 'Dokumentumok és belső adminisztrációs pontok átlátható kezelése.', url: '/megoldasaink/dokumentumkezeles-adminisztracio/' },
      { title: 'Kontrolling', text: 'Vezetői kontrollpontok és riportálási igények előkészítése.', url: '/megoldasaink/kontrolling/' },
      { title: 'EasyLink AI Asszisztens', text: 'AI-alapú vezetői kérdések előkészítése összekapcsolt adatokból.', url: '/megoldasaink/ai-asszisztens/' },
    ] },
  ] },
  detail('megoldasaink', 'penzugy-szamlazas', 'solution_detail', 'Pénzügy és számlázás', 11),
  detail('megoldasaink', 'hr-munkaugy', 'solution_detail', 'HR és Munkaügy', 12),
  detail('megoldasaink', 'crm-ugyfelkezeles', 'solution_detail', 'CRM és ügyfélkezelés', 13),
  detail('megoldasaink', 'dokumentumkezeles-adminisztracio', 'solution_detail', 'Dokumentumkezelés és adminisztráció', 14),
  detail('megoldasaink', 'kontrolling', 'solution_detail', 'Kontrolling', 15),
  detail('megoldasaink', 'ai-asszisztens', 'solution_detail', 'EasyLink AI Asszisztens', 16),
  { route: '/kinek-szol/', slug: 'kinek-szol', type: 'audiences_index', title: 'Kinek szól?', seoTitle: 'Kinek szól? | Easylink', seoDescription: 'Easylink célcsoportok.', heroEyebrow: 'Kinek szól?', heroTitle: 'Ügyvitel a vállalkozásod működéséhez igazítva.', heroDescription: 'Az Easylink különböző működési modellekhez igazítható: szálláshelyeknek, vendéglátóhelyeknek és szolgáltató vállalkozásoknak.', heroAsset: '/assets/nati/hero-bg-flow-02.webp', status: 'published', sortOrder: 20, blocks: [
    { type: 'cards', title: 'Célcsoportok', body: 'Az Easylink különböző működési modellekhez igazítható: szálláshelyeknek, vendéglátóhelyeknek és szolgáltató vállalkozásoknak.', items: [
      { title: 'Hoteleknek és szálláshelyeknek', text: 'Vendég-, pénzügyi és adminisztrációs folyamatok átláthatóbb működéséhez.', url: '/kinek-szol/hotelek-szallashelyek/' },
      { title: 'Vendéglátóhelyeknek', text: 'Egyszerűbb háttéradminisztráció és vezetői kontroll vendéglátásban.', url: '/kinek-szol/vendeglatohelyek/' },
      { title: 'Szolgáltató vállalkozásoknak', text: 'Ügyfélkezelés, dokumentumok és pénzügyi státuszok összehangolása.', url: '/kinek-szol/szolgaltato-vallalkozasok/' },
    ] },
  ] },
  detail('kinek-szol', 'hotelek-szallashelyek', 'audience_detail', 'Hoteleknek és szálláshelyeknek', 21),
  detail('kinek-szol', 'vendeglatohelyek', 'audience_detail', 'Vendéglátóhelyeknek', 22),
  detail('kinek-szol', 'szolgaltato-vallalkozasok', 'audience_detail', 'Szolgáltató vállalkozásoknak', 23),
  { route: '/integraciok/', slug: 'integraciok', type: 'integrations', title: 'Integrációk', seoTitle: 'Integrációk | Easylink', seoDescription: 'Integrációs irányok és adatkapcsolatok.', heroEyebrow: 'Integrációk', heroTitle: 'Kapcsolódások, adatáramlás, tisztább működés.', heroDescription: 'Az Easylink célja, hogy a fontos üzleti adatok összekapcsolhatók legyenek.', heroAsset: '/assets/nati/hero-bg-flow-01.webp', status: 'published', sortOrder: 30, blocks: [
    { type: 'text', title: 'Csomópontok', body: 'Nem késznek állított ígéretek, hanem tisztán tagolt integrációs irányok.' },
    { type: 'cards', title: 'Integrációs irányok', items: [
      { title: 'NAV Online Számla', text: 'Számlázási adatok és pénzügyi események előkészített kapcsolódási iránya.' },
      { title: 'Magyar bankok / PSD2 / Aggreg8', text: 'Banki adatkapcsolatok vezetői pénzügyi áttekintésekhez.' },
      { title: 'Hostware', text: 'Szálláshelyi működéshez kapcsolódó integrációs irány.' },
      { title: 'Számlázz.hu', text: 'Számlázási folyamatok összekapcsolási lehetősége.' },
      { title: 'Billingo', text: 'Számlázási és pénzügyi státuszok előkészített kapcsolódása.' },
      { title: 'Cégjelző', text: 'Céges információk és kockázati jelzések integrációs iránya.' },
    ] },
  ] },
  { route: '/arak/', slug: 'arak', type: 'pricing', title: 'Árak', seoTitle: 'Árak | Easylink', seoDescription: 'Easylink árazási irányok.', heroEyebrow: 'Árak', heroTitle: 'Árazás, ami a működésedhez igazodik.', heroDescription: 'Az Easylink bevezetés modulokra, integrációs igényre és ügyviteli folyamatokra szabható.', heroAsset: '/assets/nati/hero-bg-flow-02.webp', status: 'published', sortOrder: 40, blocks: [
    { type: 'feature-list', title: 'Mitől függhet az ár?', items: ['Választott moduloktól: pénzügy, CRM, dokumentumkezelés, kontrolling vagy AI irány.', 'Cégmérettől, felhasználói köröktől és adminisztrációs összetettségtől.', 'Előkészített vagy később bizonyított integrációktól.', 'Bevezetési, adat-előkészítési és támogatási igényektől.'] },
    { type: 'cta', title: 'Demó alapján pontosítunk', body: 'A public oldalon nem közlünk csomagárat. Demó során a modulokat, a cégméretet és az integrációs előkészítést együtt mérjük fel.', items: [{ label: 'Demót kérek', url: '/kapcsolat/' }] },
  ] },
  { route: '/kapcsolat/', slug: 'kapcsolat', type: 'contact', title: 'Kapcsolat', seoTitle: 'Kapcsolat | Easylink', seoDescription: 'Kapcsolatfelvétel Easylink bevezetéshez.', heroEyebrow: 'Kapcsolat', heroTitle: 'Kapcsolódjunk össze.', heroDescription: 'Kérj bemutatót vagy egyeztetést az Easylink bevezetési lehetőségeiről.', heroAsset: '/assets/nati/hero-bg-flow-03.webp', status: 'published', sortOrder: 50, blocks: [
    { type: 'cta', title: 'Kapcsolat', body: 'Email: hello@easylink.hu', items: [{ label: 'Írj nekünk', url: 'mailto:hello@easylink.hu' }] },
    { type: 'feature-list', title: 'Miben tudunk segíteni?', items: ['Megnézzük, mely modulok illenek a jelenlegi működésedhez.', 'Átbeszéljük a hotel/szálláshely, vendéglátó vagy szolgáltatói fókuszt.', 'Összegyűjtjük, milyen integrációs irányokat érdemes előkészíteni.'] },
  ] },
];
export const staticNavigationData = [
  { title: 'Megoldásaink', href: '/megoldasaink/', sortOrder: 1, status: 'published' },
  { title: 'Kinek szól?', href: '/kinek-szol/', sortOrder: 2, status: 'published' },
  { title: 'Integrációk', href: '/integraciok/', sortOrder: 3, status: 'published' },
  { title: 'Áraink', href: '/arak/', sortOrder: 4, status: 'published' },
  { title: 'Kapcsolat', href: '/kapcsolat/', sortOrder: 5, status: 'published' },
];
