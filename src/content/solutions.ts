import type { PublicContentItem } from './types';

export const solutions: PublicContentItem[] = [
  {
    title: 'Pénzügy és számlázás',
    slug: 'penzugy-szamlazas',
    shortDescription: 'Számlák, fizetési státuszok és pénzügyi teendők egy átlátható vezetői nézetben.',
    order: 1,
    seoTitle: 'Pénzügy és számlázás | Easylink',
    seoDescription: 'Pénzügyi és számlázási folyamatok egy átlátható Easylink felületen.',
    heroTitle: 'Pénzügy és számlázás',
    heroDescription: 'Kövesd a számlázási folyamatokat, fizetési státuszokat és pénzügyi prioritásokat egy helyen.',
    blocks: [
      { type: 'text', title: 'Mire jó?', body: 'A pénzügyi modul célja, hogy a vezető ne külön táblázatokból, e-mailekből és számlázó felületekből rakja össze a napi képet, hanem egy helyen lássa a fontos státuszokat.' },
      { type: 'feature-list', title: 'Konkrét fókuszok', items: ['Kimenő és bejövő számlák áttekinthető státuszkövetése', 'Lejárt, közelgő és rendezett tételek gyors megkülönböztetése', 'Pénzügyi teendők és felelősök láthatóvá tétele', 'NAV Online Számla és számlázó rendszerek integrációs irányának előkészítése'] },
      { type: 'text', title: 'Vezetői haszon', body: 'Kevesebb manuális egyeztetés, gyorsabb pénzügyi döntések és tisztább kép arról, hol kell beavatkozni.' },
      { type: 'text', title: 'AI és adatkapcsolat', body: 'A későbbi AI asszisztens pénzügyi kérdésekre is adhat összefoglalót, ha a szükséges számlázási és banki kapcsolatok előkészítése megtörtént.' },
    ],
    media: { path: '/assets/nati/solutions/penzugy-szamlazas.webp', alt: 'Pénzügyi adatáramlás placeholder', todo: 'Nati végleges pénzügyi vizuálja kerül ide.' },
    status: 'published',
  },
  {
    title: 'HR és Munkaügy', slug: 'hr-munkaugy', shortDescription: 'Csapatadatok, munkaügyi dokumentumok és adminisztratív teendők rendezettebb kezelése.', order: 2, seoTitle: 'HR és Munkaügy | Easylink', seoDescription: 'HR és munkaügyi adminisztráció Easylink struktúrában.', heroTitle: 'HR és Munkaügy', heroDescription: 'Készíts elő átlátható munkaügyi folyamatokat és kevesebb manuális adminisztrációt.',
    blocks: [
      { type: 'text', title: 'Mire jó?', body: 'A HR és munkaügyi terület azokat az adatokat és dokumentumokat rendezi, amelyek a napi működéshez és a vezetői kontrollhoz szükségesek.' },
      { type: 'feature-list', title: 'Konkrét fókuszok', items: ['Munkatársi alapadatok és kapcsolódó dokumentumok rendezése', 'Belépési, kilépési és változáskezelési teendők követése', 'Szabadságok, munkaügyi határidők és adminisztratív feladatok áttekintése', 'Jogosultsági és felelősségi pontok későbbi modellezésének előkészítése'] },
      { type: 'text', title: 'Vezetői haszon', body: 'A vezető gyorsabban látja, hol van hiányzó dokumentum, közelgő határidő vagy csapatot érintő adminisztratív kockázat.' },
      { type: 'text', title: 'Adatkapcsolati irány', body: 'A HR adatok később összekapcsolhatók lehetnek dokumentumkezelési és riport nézetekkel, de ez a public site még nem állít kész runtime integrációt.' },
    ], media: { path: '/assets/nati/solutions/hr-munkaugy.webp', alt: 'HR adatkapcsolatok placeholder', todo: 'Nati HR vizuálja kerül ide.' }, status: 'published'
  },
  {
    title: 'CRM és ügyfélkezelés', slug: 'crm-ugyfelkezeles', shortDescription: 'Ügyfelek, előzmények, dokumentumok és következő lépések tiszta üzleti nézetben.', order: 3, seoTitle: 'CRM és ügyfélkezelés | Easylink', seoDescription: 'CRM és ügyfélkezelés egy modern ügyviteli rendszerben.', heroTitle: 'CRM és ügyfélkezelés', heroDescription: 'Lásd egyben az ügyfeleket, előzményeket, feladatokat és döntési pontokat.',
    blocks: [
      { type: 'text', title: 'Mire jó?', body: 'A CRM nézet abban segít, hogy az ügyfélkapcsolatok ne szétszórt jegyzetekben éljenek, hanem minden fontos információ egy üzleti folyamat részeként legyen látható.' },
      { type: 'feature-list', title: 'Konkrét fókuszok', items: ['Ügyféladatok és kapcsolattartási előzmények rendezése', 'Ajánlatok, szerződések és számlázási teendők összekapcsolása', 'Következő lépések és felelősök kijelölése', 'Kockázatos vagy elakadt ügyek gyorsabb észrevétele'] },
      { type: 'text', title: 'Vezetői haszon', body: 'Jobb ügyfélkép, kevesebb elvesző információ és pontosabb utánkövetés az értékesítési vagy szolgáltatási folyamatokban.' },
      { type: 'text', title: 'AI és adatkapcsolat', body: 'Az AI irány itt ügyfélösszefoglalókban, prioritásjavaslatokban és következő teendők megfogalmazásában lehet hasznos.' },
    ], media: { path: '/assets/nati/solutions/crm-ugyfelkezeles.webp', alt: 'CRM hálózat placeholder', todo: 'Nati CRM vizuálja kerül ide.' }, status: 'published'
  },
  {
    title: 'Dokumentumkezelés és adminisztráció', slug: 'dokumentumkezeles-adminisztracio', shortDescription: 'Kevesebb manuális adminisztráció, rendezettebb dokumentumok és átláthatóbb jóváhagyások.', order: 4, seoTitle: 'Dokumentumkezelés és adminisztráció | Easylink', seoDescription: 'Dokumentumkezelési és adminisztrációs Easylink megoldások.', heroTitle: 'Dokumentumkezelés és adminisztráció', heroDescription: 'Tedd átláthatóvá az adminisztrációt, dokumentumokat és jóváhagyási pontokat.',
    blocks: [
      { type: 'text', title: 'Mire jó?', body: 'A dokumentumkezelés célja, hogy a szerződések, igazolások, számlák és belső anyagok ne külön mappákban és üzenetekben kallódjanak.' },
      { type: 'feature-list', title: 'Konkrét fókuszok', items: ['Dokumentumstátuszok és hiányzó anyagok követése', 'Jóváhagyási pontok és felelősök átláthatóvá tétele', 'Adminisztratív teendők egy közös listában', 'Kereshető, modulokhoz kapcsolható dokumentumstruktúra'] },
      { type: 'text', title: 'Vezetői haszon', body: 'Gyorsabb visszakeresés, kevesebb adminisztratív bizonytalanság és tisztább felelősségi pontok.' },
      { type: 'text', title: 'Adatkapcsolati irány', body: 'A dokumentumok később ügyfelekhez, számlákhoz, munkatársakhoz vagy szálláshelyi folyamatokhoz kapcsolhatók.' },
    ], media: { path: '/assets/nati/solutions/dokumentumkezeles.webp', alt: 'Dokumentum adatáramlás placeholder', todo: 'Nati dokumentumkezelési vizuálja kerül ide.' }, status: 'published'
  },
  {
    title: 'Kontrolling', slug: 'kontrolling', shortDescription: 'Vezetői riportok, üzleti pulzus és kontrollpontok a fontos döntésekhez.', order: 5, seoTitle: 'Kontrolling | Easylink', seoDescription: 'Kontrolling és vezetői áttekintés Easylinkben.', heroTitle: 'Kontrolling', heroDescription: 'Kapj gyorsabb rálátást a működésre, kockázatokra és prioritásokra.',
    blocks: [
      { type: 'text', title: 'Mire jó?', body: 'A kontrolling oldal a napi operatív adatokból vezetői szintű összképet készít elő: mi halad jól, hol van csúszás, hol kell dönteni.' },
      { type: 'feature-list', title: 'Konkrét fókuszok', items: ['Pénzügyi, ügyfél- és adminisztrációs jelzések egy helyen', 'Kockázati és prioritási listák előkészítése', 'Egyszerű riportstruktúrák későbbi bővítéshez', 'Cégmérethez és modulhasználathoz igazítható nézetek'] },
      { type: 'text', title: 'Vezetői haszon', body: 'Kevesebb idő megy adatgyűjtésre, több marad döntésre és utánkövetésre.' },
      { type: 'text', title: 'AI és adatkapcsolat', body: 'A kontrolling irány természetes kapcsolódási pontja az AI asszisztensnek: kérdések, összefoglalók és eltérésjelzések készülhetnek belőle.' },
    ], media: { path: '/assets/nati/solutions/kontrolling.webp', alt: 'Kontrolling dashboard placeholder', todo: 'Nati kontrolling vizuálja kerül ide.' }, status: 'published'
  },
  {
    title: 'EasyLink AI Asszisztens', slug: 'ai-asszisztens', shortDescription: 'Kérdezz, és a rendszered válaszol az üzleti adataid alapján.', order: 6, seoTitle: 'EasyLink AI Asszisztens | Easylink', seoDescription: 'AI asszisztens vezetői kérdésekhez és adatkapcsolatokhoz.', heroTitle: 'Kérdezz, és a rendszered válaszol!', heroDescription: 'Az EasyLink AI Asszisztens a számlázási, CRM és adminisztrációs adatokból segít gyors, érthető válaszokat adni.',
    blocks: [
      { type: 'text', title: 'Mire jó?', body: 'Az AI asszisztens víziója, hogy a vezető természetes nyelven kérdezhessen rá a saját működésére, és érthető, ellenőrizhető válaszokat kapjon.' },
      { type: 'feature-list', title: 'Konkrét kérdéspéldák', items: ['Mely számlák igényelnek utánkövetést ezen a héten?', 'Mely ügyfeleknél van elakadt következő lépés?', 'Hol hiányzik dokumentum vagy jóváhagyás?', 'Mely folyamatok jelentenek vezetői prioritást ma?'] },
      { type: 'ai-preview', title: 'EasyLink AI Asszisztens üzenet', body: '3 ügyfélnél magas a késedelmes fizetési kockázat. Javasolt következő lépés: automatikus emlékeztető és pénteki utánkövetés.' },
      { type: 'text', title: 'Fontos keret', body: 'Ez a public oldal az AI/adatáramlás irányt mutatja be; nem tartalmaz runtime AI endpointot, belépést vagy adatbázis-kapcsolatot.' },
    ], media: { path: '/assets/nati/solutions/ai-asszisztens.webp', alt: 'AI adatáramlás placeholder', todo: 'Nati futurisztikus AI/adatáramlás képe kerül ide.' }, status: 'published'
  },
];

export const publishedSolutions = solutions.filter((item) => item.status === 'published').sort((a, b) => a.order - b.order);
