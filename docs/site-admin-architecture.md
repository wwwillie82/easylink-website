# Easylink website site admin – discovery és implementációs terv

## 1. Jelenlegi állapot röviden

### Stack és build

- A projekt Astro + TypeScript alapú, minimális függőségekkel: `astro` és `typescript`.
- Az Astro konfiguráció jelenleg teljesen statikus kimenetet állít elő (`output: 'static'`) a `https://site-dev.easylink.hu` site URL-lel.
- A `package.json` fő parancsai: `dev`, `build`, `preview`, `check`.

### Deploy

- A `.github/workflows/deploy-site-dev.yml` workflow `main` pushra és kézi indításra fut.
- A workflow Node 22.12.0-val telepít, `npm run check`-et és `npm run build`-et futtat, majd a `dist/` tartalmát `rsync --delete` használatával másolja a `web172` webrootba.
- A jelenlegi smoke test a főoldal statikus HTML tartalmát, a noindex meta taget, a deploy URL-t és a robots tiltást ellenőrzi.

### Forrásstruktúra

- Jelenleg egyetlen publikus oldal van: `src/pages/index.astro`.
- A főoldal komponensekből áll össze: Header, Hero, FeatureCards, AiAssistantPreview, IntegrationsStrip, AudienceSection, CTASection, Footer.
- A navigáció jelenleg anchor-linkekre épül, nem valódi aloldalakra.
- A szerkeszthetőnek kért tartalom jelenleg hardcode-olt komponensekben él:
  - `Megoldásaink`: `Header.astro` nav és `FeatureCards.astro` kártyák.
  - `Kinek szól?`: `Header.astro` nav és `AudienceSection.astro` tartalom.

## 2. Ajánlott architektúra a legkisebb kockázattal

### Döntés: hybrid Astro SSR Node adapterrel

Az adminhoz szerveroldali runtime kell, mert szükséges lesz:

- bejelentkezés és session kezelés,
- jogosultság ellenőrzés,
- DB írás/olvasás,
- médiafeltöltés,
- draft/published workflow,
- admin API endpointok.

Ezért az MVP-hez az Astro projektet `output: 'hybrid'` módra érdemes átállítani `@astrojs/node` adapterrel.

Indoklás:

- A publikus, nagy forgalmú marketing oldalak továbbra is generálhatók statikusan, ahol lehet.
- Az admin útvonalak és az admin API-k SSR endpointok lehetnek.
- Nem kell külön admin repositoryt vagy külön alkalmazást bevezetni.
- A site admin elkülönül a deploy admintól, mert saját runtime-ot, saját adatbázist, saját felhasználói táblát és saját belépési útvonalat kap.

### Maradhat-e részben statikus build?

Igen. A javasolt minta:

- Publikus oldalak: alapértelmezetten prerenderelt Astro oldalak.
- Dinamikus publikus rész csak akkor kell, ha a későbbi tartalompublikálási modell azonnali DB-olvasást igényel.
- Admin oldalak: `export const prerender = false`.
- Admin API endpointok: szerveroldali endpointok, nem prerendereltek.

Az MVP-ben a legalacsonyabb kockázatú megközelítés:

1. Admin DB-ben szerkesztés.
2. Publikáláskor a publikus oldalak vagy:
   - SSR-ből olvassák a published tartalmat, vagy
   - később webhook/build triggerrel statikus HTML-be kerülnek.
3. Első körben stagingen elfogadható a published tartalom SSR kiszolgálása is, cache fejlécekkel.

### Admin runtime helye

Az admin runtime maradjon ugyanebben az Astro appban:

- `/admin/login`
- `/admin/dashboard`
- `/admin/users`
- `/admin/menu`
- `/admin/pages`
- `/admin/media`
- `/api/admin/*`

A deploy adminhoz nincs köze, annak felhasználókezelése és árajánlatkérése külön későbbi téma.

### Első DB/content store

Első körben PostgreSQL javasolt.

Indoklás:

- A menü, oldal, média, verzió/draft státusz relációs modellben természetes.
- Tranzakciók kellenek publikáláskor.
- A JSONB mezők jól használhatók rugalmas rich text/blokk tartalomhoz.
- Web172 stagingen reálisan üzemeltethető vagy külön kezelt Postgres szolgáltatásként csatlakoztatható.

ORM/migráció javaslat:

- Drizzle ORM + `drizzle-kit`, mert TypeScript-barát, egyszerű migrációs modell, kevés runtime overhead.
- Alternatíva: Prisma, ha a csapatnak az ismertebb, de több generált/runtime réteget hoz.

Média store első körben:

- web172 fájlrendszer: `/var/www/clients/client1/web172/private/uploads` vagy hasonló, nem közvetlenül publikus írható webroot.
- Publikus kiszolgálás kontrollált `/media/:id/:filename` endpointon vagy dedikált public symlink/alias alatt.
- Későbbi skálázási opció: S3-kompatibilis object storage.

## 3. Admin MVP útvonalak

### `/admin/login`

- Email + jelszó belépés.
- HttpOnly, Secure, SameSite=Lax session cookie.
- Sikertelen belépések rate limitje.
- Első admin seed felhasználó CLI vagy egyszeri migrációs seed alapján.

### `/admin/dashboard`

- Publikált/draft oldalak száma.
- Utolsó módosítások.
- Gyors linkek: menü szerkesztés, oldal létrehozás, média feltöltés.
- Figyelmeztetés, ha draft eltérés van a published tartalomhoz képest.

### `/admin/users`

- Csak `admin` role számára.
- Site admin felhasználók listája.
- Új felhasználó létrehozása.
- Role kezelés: `admin`, `editor`.
- Aktiválás/deaktiválás.
- Jelszó reset flow kezdetben admin által generált egyszeri tokennel vagy ideiglenes jelszóval.

### `/admin/menu`

- Főmenük listája és sorrendezése.
- Főmenü mezők:
  - cím,
  - slug,
  - rövid leírás,
  - sorrend,
  - státusz,
  - céloldal,
  - almenüpontok.
- Drag-and-drop sorrendezés későbbi UX javítás lehet; MVP-ben számozott `sort_order` is elég.

### `/admin/pages`

- Oldallista: cím, slug, státusz, módosító, módosítás dátuma.
- Oldal szerkesztő:
  - meta title,
  - meta description,
  - hero cím/leírás,
  - rich text/blokk tartalom,
  - kapcsolt média,
  - draft mentés,
  - publish.
- Valódi publikus aloldalak generálása:
  - `/megoldasaink/[slug]`
  - `/kinek-szol/[slug]`
  - vagy egységes `/[section]/[slug]` modell kontrollált route whitelisttel.

### `/admin/media`

- Kép feltöltés.
- Alt text megadása.
- Cím/leírás.
- Fájlméret és MIME validáció.
- Képhasználat megjelenítése oldalakon/almenüpontokon.
- Később automatikus optimalizálás és több méret generálása.

## 4. Content model

### `admin_users`

- `id` UUID PK
- `email` unique, lowercased
- `name`
- `password_hash`
- `role` enum: `admin`, `editor`
- `status` enum: `active`, `disabled`
- `last_login_at`
- `created_at`
- `updated_at`

### `admin_sessions`

- `id` UUID PK
- `user_id` FK
- `session_hash`
- `expires_at`
- `created_at`
- `revoked_at`

### `menu_items`

- `id` UUID PK
- `parent_id` nullable FK önmagára
- `section` enum: `main`, `solutions`, `audiences`, `other`
- `title`
- `slug`
- `short_description`
- `page_id` nullable FK
- `url` nullable külső/belső célhoz
- `sort_order`
- `status` enum: `draft`, `published`, `archived`
- `created_at`
- `updated_at`
- `published_at`

### `pages`

- `id` UUID PK
- `section` enum: `solutions`, `audiences`, `general`
- `title`
- `slug`
- `summary`
- `meta_title`
- `meta_description`
- `hero_title`
- `hero_description`
- `content_json` JSONB rich text/blokk tartalomhoz
- `status` enum: `draft`, `published`, `archived`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`
- `published_at`

### `page_versions`

- `id` UUID PK
- `page_id` FK
- `version_number`
- `content_snapshot` JSONB
- `created_by`
- `created_at`
- `published_at` nullable

### `media_assets`

- `id` UUID PK
- `filename`
- `original_filename`
- `mime_type`
- `size_bytes`
- `width`
- `height`
- `storage_path`
- `public_url` vagy kiszolgálási kulcs
- `alt_text`
- `caption`
- `created_by`
- `created_at`
- `updated_at`

### Draft/published modell

MVP-ben egyszerű modell javasolt:

- A `pages.status` és `menu_items.status` jelzi az aktuális állapotot.
- Publikáláskor mentés történik `page_versions` táblába snapshotként.
- A publikus site csak `published` rekordokat olvas.
- Ha később párhuzamos draft kell egy már published oldalhoz, akkor érdemes külön `published_content_json` és `draft_content_json`, vagy `content_items` + `content_versions` modellt bevezetni.

## 5. Szerkeszthető tartalmak terve

### Főmenük

Szerkeszthető mezők:

- cím,
- slug,
- rövid leírás,
- sorrend,
- státusz,
- kapcsolt aloldal vagy URL,
- almenüpontok.

A jelenlegi anchor navigációt valódi route-okra kell cserélni:

- `/megoldasaink`
- `/megoldasaink/penzugyek-es-szamlazas`
- `/megoldasaink/crm`
- `/kinek-szol`
- `/kinek-szol/kkv`

### Almenüpontok

Szerkeszthető mezők:

- cím,
- slug,
- rövid összefoglaló,
- rich text/blokk tartalom,
- kiemelt kép,
- opcionális galéria,
- opcionális animáció/embed.

Rich text/blokk tartalomhoz javasolt JSONB blokk modell:

```json
[
  { "type": "paragraph", "text": "..." },
  { "type": "heading", "level": 2, "text": "..." },
  { "type": "image", "mediaId": "...", "alt": "..." },
  { "type": "embed", "provider": "youtube", "url": "..." },
  { "type": "cta", "label": "Demót kérek", "href": "https://deploy.easylink.hu" }
]
```

Embed biztonsági szabályok:

- Csak whitelistelt provider engedélyezett.
- Raw HTML embed ne legyen MVP-ben.
- YouTube/Vimeo/Lottie URL validáció külön whitelist alapján.

## 6. Implementációban várható fájlmódosítások

### Konfiguráció és függőségek

- `package.json`
  - `@astrojs/node`, DB kliens, ORM, auth/jelszó hash, validációs csomagok.
  - Új script: migráció, seed, esetleg `start` Node runtime-hoz.
- `astro.config.mjs`
  - `output: 'hybrid'`.
  - Node adapter beállítása.
  - Path alias megtartása/ellenőrzése.
- `tsconfig.json` ha alias vagy strict beállítás szükséges.
- `.env.example`
  - `DATABASE_URL`, `SESSION_SECRET`, `UPLOAD_DIR`, `PUBLIC_SITE_URL`.

### DB és szerveroldali modulok

- `src/lib/db/schema.ts`
- `src/lib/db/client.ts`
- `src/lib/auth/password.ts`
- `src/lib/auth/session.ts`
- `src/lib/auth/guards.ts`
- `src/lib/content/pages.ts`
- `src/lib/content/menu.ts`
- `src/lib/media/storage.ts`
- `drizzle.config.ts`
- `drizzle/` migrációs könyvtár

### Admin oldalak

- `src/pages/admin/login.astro`
- `src/pages/admin/dashboard.astro`
- `src/pages/admin/users/index.astro`
- `src/pages/admin/menu/index.astro`
- `src/pages/admin/pages/index.astro`
- `src/pages/admin/pages/[id].astro`
- `src/pages/admin/media/index.astro`
- `src/layouts/AdminLayout.astro`
- `src/components/admin/*`

### Admin API endpointok

- `src/pages/api/admin/login.ts`
- `src/pages/api/admin/logout.ts`
- `src/pages/api/admin/users.ts`
- `src/pages/api/admin/menu.ts`
- `src/pages/api/admin/pages.ts`
- `src/pages/api/admin/pages/[id].ts`
- `src/pages/api/admin/media.ts`
- `src/pages/api/admin/publish.ts`

### Publikus site route-ok

- `src/pages/megoldasaink/index.astro`
- `src/pages/megoldasaink/[slug].astro`
- `src/pages/kinek-szol/index.astro`
- `src/pages/kinek-szol/[slug].astro`
- `src/pages/index.astro` átalakítása adatvezérelt komponensekre.
- `src/components/Header.astro` anchor navigáció helyett valódi linkekkel.
- `src/components/FeatureCards.astro` DB/content adatokból.
- `src/components/AudienceSection.astro` DB/content adatokból.

### Stílusok

- `src/styles/global.css`
- `src/styles/tokens.css`
- opcionálisan `src/styles/admin.css`

### Tesztek/ellenőrzések

- `src/**/*.test.ts` vagy későbbi Playwright smoke tesztek.
- Workflow smoke test frissítése valódi aloldalakra és admin login elérhetőségre.

## 7. Deploy/action változások

A jelenlegi statikus `dist/` rsync deploy nem lesz elég az admin runtime-hoz.

Szükséges változások:

1. Node SSR build artifact deployolása web172-re.
2. `npm ci --omit=dev` vagy előre csomagolt `node_modules`/artifact stratégia.
3. `.env` létrehozása web172-n szerveroldali secret értékekkel.
4. DB migráció futtatása deploy részeként vagy külön manuális jóváhagyással.
5. Node process kezelése systemd vagy PM2 alatt.
6. Reverse proxy beállítás Apache/Nginx felől a Node portra.
7. Upload könyvtár megőrzése deployok között, ne törölje az `rsync --delete`.
8. Smoke test bővítése:
   - `/`
   - `/megoldasaink`
   - `/kinek-szol`
   - `/admin/login` 200
   - robots/noindex stagingen továbbra is megvan.

## 8. Web172 staging runtime/DB előfeltételek

- Node.js 22 kompatibilis runtime a szerveren.
- Process manager: systemd service vagy PM2.
- Reverse proxy konfiguráció a site domainről a Node appra.
- PostgreSQL adatbázis vagy elérhető külső Postgres.
- DB user minimális jogosultságokkal.
- Secret/env értékek:
  - `DATABASE_URL`
  - `SESSION_SECRET`
  - `UPLOAD_DIR`
  - `PUBLIC_DEPLOY_URL`
  - `PUBLIC_SITE_URL`
- Írható upload könyvtár web172 userrel.
- Backup stratégia DB-re és feltöltött médiára.
- TLS már meglévő site-dev domainen.

## 9. Fő kockázatok

- A statikus hostingról SSR Node runtime-ra váltás üzemeltetési kockázatot hoz.
- A web172 környezet pontos Node/process manager/reverse proxy képességeit validálni kell.
- Médiafeltöltésnél fájltípus, méret és jogosultság ellenőrzés nélkül biztonsági kockázat lenne.
- Rich text/embed tartalom XSS kockázatot hoz, ezért whitelistelt blokkok és sanitization szükséges.
- Draft/published modell későbbi bővítése migrációt igényelhet, ha az MVP túl egyszerű modellből indul.
- Public site SEO/route struktúra változik, ezért slug stabilitás és redirect stratégia kell.
- Az admin authentikáció brute force és session lopás ellen külön védelemre szorul.

## 10. Javasolt implementációs sorrend

1. Web172 runtime validáció: Node process, reverse proxy, Postgres, upload könyvtár.
2. Astro `hybrid` + Node adapter minimális bevezetése üres SSR endpointtal.
3. DB séma, migrációk, seed admin user.
4. Auth/session alapok és `/admin/login`.
5. `AdminLayout` és `/admin/dashboard`.
6. Users CRUD minimális role/status kezeléssel.
7. Menu CRUD és sorrendezés.
8. Pages CRUD rich text/blokk JSON modellel.
9. Media upload és média választó.
10. Publikus route-ok létrehozása valódi aloldalakkal.
11. Jelenlegi hardcode tartalom migrálása seed/content rekordokba.
12. Workflow deploy átállítása Node SSR artifactra.
13. Smoke tesztek bővítése és staging validáció.
14. Biztonsági hardening: rate limit, audit log, file scanning/validáció, CSP finomítás.
