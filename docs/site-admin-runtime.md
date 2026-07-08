# PR #16 site admin + DB MVP runtime

## Architecture boundary

This PR keeps the existing Attempt 2 architecture: the public Astro site remains static-build compatible and DB-free by default, while the site-admin/API runs as a separate Node process. Full Astro SSR and nginx/systemd/proxy changes are intentionally not part of this PR.

## Public content behavior

- `SITE_CONTENT_SOURCE=static` means no public DB connection is attempted.
- `SITE_CONTENT_SOURCE=auto` must not break static builds; when DB is unavailable the provider falls back to static content.
- Admin saves write content to MariaDB, but the currently deployed static public site will not show those DB edits immediately.
- DB content can reach public pages only after a rebuild/seed-to-static workflow or a later approved SSR/proxy/runtime deployment decision.
- This PR therefore provides the DB/content foundation and admin editing runtime, not immediate live public DB rendering on the static nginx webroot.

## Runtime pieces

- MariaDB schema: `src/lib/db/schema.sql`.
- Static seed data: `src/lib/content/static-seed-data.mjs` / `src/lib/content/static-data.mjs`.
- DB migration/seed/check scripts: `scripts/db-migrate.mjs`, `scripts/db-seed.mjs`, `scripts/db-check.mjs`.
- Admin user bootstrap: `scripts/admin-init.mjs`.
- Admin server bootstrap: `scripts/admin-server.mjs`.
- Testable admin server factory: `src/lib/admin/server.mjs`.
- Admin repository adapter: `src/lib/admin/repository.mjs`.

## Dependencies

The DB client imports the real upstream `mysql2/promise` package. No fake `mysql2` shim or CLI wrapper is kept in the repository. The package manager must be able to install `mysql2` from the approved registry before DB/admin commands can run against MariaDB.

In this execution environment, `npm install --package-lock-only --ignore-scripts` failed with `403 Forbidden - GET https://registry.npmjs.org/mysql2`, so dependency provisioning remains an environment blocker until the registry/policy is fixed.

## Environment variables

- `SITE_CONTENT_SOURCE=static|auto|db`
- `DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `SITE_ADMIN_SESSION_SECRET`
- `SITE_ADMIN_PORT`
- `SITE_ADMIN_BOOTSTRAP_EMAIL` or `SITE_ADMIN_BOOTSTRAP_USER`
- `SITE_ADMIN_BOOTSTRAP_PASSWORD`

## Commands

```bash
npm run db:migrate -- --dry-run
npm run db:migrate
npm run db:seed -- --dry-run
npm run db:seed
npm run admin:init
npm run db:check
npm run admin:server
npm run smoke:admin
```

`db:*`, `admin:init` and `admin:server` require MariaDB connection env for real runtime use. No staging or production credentials are committed.

## Admin UI MVP

- `/admin/login` renders a browser form and accepts normal form POST as well as JSON login.
- Successful login sets an HttpOnly SameSite=Lax cookie and redirects to `/admin/dashboard` for browser form submits.
- `/admin/pages` lists route, type, title, status and sort order.
- `/admin/pages/:id` provides editable page-level fields and block add/update/inactivate forms.
- `/admin/menu` edits title, href, sort order and status.
- Invalid block `items` JSON is blocked in the browser and validated again in the API.
- `/api/admin/logout` clears the cookie and redirects to login.

## Staging deploy notes

1. Provision a MariaDB database/user/password for `web172` separately.
2. Ensure the approved npm registry or package mirror can install real `mysql2`.
3. Put env values in the Node runtime environment, not in git.
4. Run migration and seed from the staging source checkout after dependencies are installed.
5. Run `npm run admin:init` with bootstrap email/password env to create the first admin.
6. Start `npm run admin:server` under systemd or another process manager.
7. Add nginx proxy rules for `/admin` and `/api/admin/*` only after the server-side decision is approved.
8. Keep the existing static webroot deployment as fallback until the runtime proxy is verified.

## Known deferred work

- Media upload UI and storage.
- Rich WYSIWYG editor; MVP uses JSON textarea/API validation.
- Draft/published version history.
- Production-grade CSRF tokens, rate limiting and audit log.
- Server config changes for nginx/systemd.
