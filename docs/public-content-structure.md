# Public content structure

## Route lista

- `/`
- `/megoldasaink/`
- `/megoldasaink/penzugy-szamlazas/`
- `/megoldasaink/hr-munkaugy/`
- `/megoldasaink/crm-ugyfelkezeles/`
- `/megoldasaink/dokumentumkezeles-adminisztracio/`
- `/megoldasaink/kontrolling/`
- `/megoldasaink/ai-asszisztens/`
- `/kinek-szol/`
- `/kinek-szol/hotelek-szallashelyek/`
- `/kinek-szol/vendeglatohelyek/`
- `/kinek-szol/szolgaltato-vallalkozasok/`
- `/integraciok/`
- `/arak/`
- `/kapcsolat/`

## Content registry mezők

A public tartalom TypeScript registrykben él:

- `src/content/siteNavigation.ts`
- `src/content/solutions.ts`
- `src/content/audiences.ts`
- `src/content/integrations.ts`
- `src/content/types.ts`

Admin-kompatibilis mezők:

- `title`
- `slug`
- `shortDescription`
- `order`
- `seoTitle`
- `seoDescription`
- `heroTitle`
- `heroDescription`
- `blocks[]`
- `media.path`, `media.alt`, `media.todo`
- `status`

A public site csak `status: 'published'` elemeket listáz.

## Későbbi site admin szerkesztés

A későbbi site admin ugyanennek a modellnek megfelelő rekordokat szerkeszthet majd. A mostani Astro oldalak már route-alapúak, és közös komponensekből renderelik a registryk adatait, ezért később a TypeScript registry cserélhető API/DB alapú read modellre anélkül, hogy a public komponensstruktúrát újra kellene tervezni.

Most szándékosan nincs implementálva login, DB, SSR, API, media upload vagy árajánlat funkció.

## Nati grafikák asset/TODO helye

A Nati-féle futurisztikus AI/adatáramlás, kapcsolódások, neon zöld pontok/vonalak vizuálok placeholder pathjai a content registryk `media.path` mezőiben szerepelnek, javasolt gyökérrel:

- `public/assets/nati/solutions/`
- `public/assets/nati/audiences/`
- `public/assets/nati/integrations/`

## Deploy logó asset/TODO helye

A deploy alatt látható Easylink logó Deploy felirat nélküli változata ide kerüljön:

- `public/assets/brand/easylink-logo.svg`

Részletek: `public/assets/brand/README.md`.
