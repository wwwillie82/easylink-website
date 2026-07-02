# Easylink Website

Tiszta Astro + TypeScript statikus marketing scaffold az `easylink.hu` új weboldalához. Nincs WordPress, PHP backend, adatbázis vagy Node szerver igény éles környezetben.

## Vizuális attemptök

- **Attempt 1:** prémium SaaS / ERP irány sötétkék, fehér és neon zöld arculattal. Ez adja az oldal fő hero és szekció rendszerét.
- **Attempt 2:** futurisztikusabb AI / adatáramlás irány, finom hálózat és kapcsolódási pont vizuállal a főoldal külön szekciójában.

## Lokális indítás

```bash
npm install
npm run dev
```

## Deploy / CI telepítés

A staging deploy reprodukálható telepítéshez lockfile-ból fusson:

```bash
npm ci
npm run check
npm run build
```

## Ellenőrzés és build lokálisan

```bash
npm run check
npm run build
```

A build statikus kimenete a `dist/` könyvtárba készül. A `dist/` nem commitolható és szerepel a `.gitignore` fájlban.

## Statikus deploy cél

A statikus build tartalma ide másolható:

```text
/var/www/clients/client1/web172/web
```

Staging domain:

```text
https://site-dev.easylink.hu
```

## Publikus Deploy / demo URL config

A CTA-k a publikus környezeti változót használják:

```bash
PUBLIC_DEPLOY_URL=https://deploy.easylink.hu
```

Lásd: `.env.example`. Secretet, tokent, SSH adatot vagy privát API kulcsot nem tartalmaz a projekt.

## SEO staging alap

A staging alapértelmezés `noindex,nofollow`: `public/robots.txt` tiltja a crawlert, a layout pedig robots meta taget is ad.

## Betűtípus

A projekt Google Fonts importtal tölti a Sora betűtípust. Éles, teljesen self-hostolt működéshez a `src/styles/global.css` importja cserélhető helyi `@font-face` definíciókra.

## Rögzített dependency verziók

- Astro: `7.0.5`
- TypeScript: `6.0.3`
- A `package-lock.json` commitolva van, staging/CI környezetben `npm ci` használandó.
