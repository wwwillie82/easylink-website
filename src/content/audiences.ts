import type { PublicContentItem } from './types';

export const audiences: PublicContentItem[] = [
  {
    title: 'Hoteleknek és szálláshelyeknek',
    slug: 'hotelek-szallashelyek',
    shortDescription: 'Vendég-, pénzügyi és adminisztrációs folyamatok átláthatóbb működéséhez.',
    order: 1,
    seoTitle: 'Hoteleknek és szálláshelyeknek | Easylink',
    seoDescription: 'Easylink hoteleknek és szálláshelyeknek.',
    heroTitle: 'Hoteleknek és szálláshelyeknek',
    heroDescription: 'Kapcsold össze a napi működést, pénzügyi státuszokat és vendégadatokhoz kapcsolódó adminisztrációt.',
    blocks: [
      { type: 'text', title: 'Mire jó egy szálláshelynek?', body: 'A hotel és szálláshely fókusz célja, hogy a vezető a napi adminisztráció, pénzügy és vendégkapcsolati feladatok állapotát egy könnyen áttekinthető rendszerben lássa.' },
      { type: 'feature-list', title: 'Iparági példák', items: ['Foglalásokhoz és vendégadatokhoz kapcsolódó adminisztratív teendők követése', 'Számlázási és fizetési státuszok vezetői áttekintése', 'Műszakokhoz, dokumentumokhoz és belső feladatokhoz kötődő jelzések', 'Hostware integrációs irány / előkészítés, kész integráció állítása nélkül'] },
      { type: 'text', title: 'Vezetői haszon', body: 'A szálláshely vezetése gyorsabban észreveheti, hol van elmaradt adminisztráció, pénzügyi kockázat vagy következő vendégkezelési lépés.' },
      { type: 'text', title: 'AI és adatkapcsolat', body: 'A későbbi AI/adatáramlás irány segíthet napi összefoglalókat, prioritáslistákat és egyszerű vezetői válaszokat adni a szálláshelyi működésből.' },
    ],
    media: { path: '/assets/nati/audiences/hotelek.webp', alt: 'Hotel adatáramlás placeholder', todo: 'Nati hotel/szálláshely kép kerül ide.' },
    status: 'published',
  },
  {
    title: 'Vendéglátóhelyeknek',
    slug: 'vendeglatohelyek',
    shortDescription: 'Gyors napi adminisztráció és tisztább működési áttekintés vendéglátásban.',
    order: 2,
    seoTitle: 'Vendéglátóhelyeknek | Easylink',
    seoDescription: 'Easylink vendéglátóhelyeknek.',
    heroTitle: 'Vendéglátóhelyeknek',
    heroDescription: 'Egyszerűsítsd a háttéradminisztrációt és a vezetői kontrollt.',
    blocks: [
      { type: 'text', title: 'Mire jó egy vendéglátóhelynek?', body: 'A vendéglátásban sok apró napi teendőből áll össze a vezetői kép. Az Easylink public iránya ezek rendezését, státuszkövetését és későbbi integrációs előkészítését támogatja.' },
      { type: 'feature-list', title: 'Iparági példák', items: ['Napi adminisztratív feladatok és felelősök követése', 'Beszállítói, számlázási és dokumentumteendők átláthatóbb kezelése', 'Pénzügyi státuszok és vezetői kontrollpontok kiemelése', 'CRM jellegű vendég- vagy partnerkapcsolati jegyzetek rendezése'] },
      { type: 'text', title: 'Vezetői haszon', body: 'Kevesebb elvesző információ, gyorsabb rálátás a napi működésre és egyszerűbb utánkövetés.' },
      { type: 'text', title: 'Adatkapcsolati irány', body: 'A későbbi integrációk és AI összefoglalók csak bizonyított kapcsolatokra épülhetnek; a mostani oldal óvatosan előkészíti ezt a tartalmi struktúrát.' },
    ],
    media: { path: '/assets/nati/audiences/vendeglatohelyek.webp', alt: 'Vendéglátóhely placeholder', todo: 'Nati vendéglátós kép kerül ide.' },
    status: 'published',
  },
  {
    title: 'Szolgáltató vállalkozásoknak',
    slug: 'szolgaltato-vallalkozasok',
    shortDescription: 'Ügyfélkezelés, dokumentumok és számlázási folyamatok egy helyen.',
    order: 3,
    seoTitle: 'Szolgáltató vállalkozásoknak | Easylink',
    seoDescription: 'Easylink szolgáltató vállalkozásoknak.',
    heroTitle: 'Szolgáltató vállalkozásoknak',
    heroDescription: 'Kevesebb táblázat, több átláthatóság a szolgáltatói működésben.',
    blocks: [
      { type: 'text', title: 'Mire jó egy szolgáltató cégnek?', body: 'Szolgáltató vállalkozásoknál az ügyfélkezelés, számlázás, dokumentumok és feladatok szorosan összetartoznak. Az Easylink ezeket egy közös üzleti nézetbe rendezi.' },
      { type: 'feature-list', title: 'Iparági példák', items: ['Ajánlatok, szerződések és számlázási teendők összekapcsolása', 'Ügyfél-előzmények és következő lépések követése', 'Dokumentumhiányok és adminisztratív határidők jelzése', 'Kontrolling nézet előkészítése cégméret és modulhasználat alapján'] },
      { type: 'text', title: 'Vezetői haszon', body: 'Tisztább ügyfélkép, kevesebb manuális egyeztetés és gyorsabb döntés arról, melyik ügy vagy ügyfél igényel figyelmet.' },
      { type: 'text', title: 'AI és integrációs irány', body: 'Az AI asszisztens később a CRM, pénzügyi és dokumentum adatokból tudhat összefoglalókat adni, ha ezek a kapcsolatok rendelkezésre állnak.' },
    ],
    media: { path: '/assets/nati/audiences/szolgaltatok.webp', alt: 'Szolgáltatói adatkapcsolatok placeholder', todo: 'Nati szolgáltatói kép kerül ide.' },
    status: 'published',
  },
];

export const publishedAudiences = audiences.filter((item) => item.status === 'published').sort((a, b) => a.order - b.order);
