# Setup guide

How to stand up the IT Operations Asset Platform from a clean checkout.

- [Prerequisites](#prerequisites)
- [1. Configure](#1-configure)
- [2. Start the stack](#2-start-the-stack)
- [3. Create the first admin](#3-create-the-first-admin)
- [4. Import the n8n workflows](#4-import-the-n8n-workflows)
- [5. Set up Metabase](#5-set-up-metabase)
- [6. Running on a real host (TLS / production)](#6-running-on-a-real-host-tls--production)
- [Resetting](#resetting)

---

## Prerequisites

- Docker and the Docker Compose plugin (`docker compose`, v2)
- ~2 GB free RAM for the container stack
- Ports free on the host: `8082`, `8000`, `5678`, `3000`, `8081`, `5432`
  (all overridable — see `.env`)

---

## 1. Configure

```bash
git clone https://github.com/Serversupport9/it-ops-asset-platform.git
cd it-ops-asset-platform
cp .env.example .env
```

Edit `.env`. Every key is documented in the file; the minimum to boot locally:

| Key | Value |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | any |
| `POSTGRES_DB` | `itops` |
| `N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD` | any |
| `N8N_ENCRYPTION_KEY` | long random string |
| `WEBAPP_JWT_SECRET`, `WEBAPP_DB_ENC_KEY`, `WEBAPP_METABASE_EMBED_SECRET` | random strings |
| `GENERIC_TIMEZONE` | e.g. `Asia/Kolkata` |

Leave `WEBHOOK_URL`, `WHATSAPP_*`, and `PUBLIC_*` blank for a local run.

Generate a secret: `openssl rand -hex 32`

---

## 2. Start the stack

```bash
docker compose up -d
docker compose ps          # all services "running"/"healthy"
```

On the **first** start with an empty database volume, Postgres runs the files in
`db/` in order:

1. `00-init-databases.sql` — creates the `n8n` and `metabase` databases
2. `schema.sql` — full schema: tables, views, functions, triggers
3. `seed_device_types.sql` — the device-type lookup rows

| Service | URL | Notes |
|---|---|---|
| Portal (React) | http://localhost:8082 | main UI |
| API (FastAPI) | http://localhost:8000/docs | OpenAPI docs; health at `/healthz` |
| n8n | http://localhost:5678 | basic-auth from `.env` |
| Metabase | http://localhost:3000 | first-run wizard |
| Adminer | http://localhost:8081 | DB browser (server `postgres`, db `itops`) |
| Postgres | localhost:5432 | |

Check the schema loaded:

```bash
docker exec itops_postgres psql -U "$POSTGRES_USER" -d itops -c "\dt"
```

---

## 3. Create the first admin

No user exists yet, and the admin API needs an existing `super_admin` to create
users — so bootstrap one directly in the database.

**a. Hash a password** (argon2, using the API container):

```bash
docker exec itops_webapp_api python -c \
  "from app.core.security import hash_password; print(hash_password('change-this-password'))"
```

**b. Insert the employee + user rows:**

```bash
docker exec -it itops_postgres psql -U "$POSTGRES_USER" -d itops
```

```sql
-- app_users.employee_id references employees(employee_id), so the employee comes first
INSERT INTO employees (employee_id, name, email, employment_status)
VALUES ('ADMIN001', 'Platform Admin', 'admin@example.com', 'active');

INSERT INTO app_users (employee_id, role, password_hash)
VALUES ('ADMIN001', 'super_admin', 'PASTE_THE_HASH_FROM_STEP_A');
```

**c. Log in** at http://localhost:8082 with employee ID `ADMIN001` and your
password. From there use the portal's **Add Employee** and **Roles** pages to
create everyone else — roles are `employee`, `it`, `management`, `super_admin`.

---

## 4. Import the n8n workflows

The workflow JSON is mounted into the container at `/data/workflows`:

```bash
docker exec itops_n8n n8n import:workflow --separate --input=/data/workflows
```

Then open n8n (http://localhost:5678) and create the credentials the workflows
reference (the exports contain only names, never secrets):

- **Postgres** — host `postgres`, database `itops`, your `POSTGRES_USER` / `POSTGRES_PASSWORD`
- **Gmail (OAuth2)** — for digest and password-reset emails *(optional)*
- **WhatsApp / Meta** — for the WhatsApp notification and inbound workflows *(optional)*

Open each workflow, map its credential, and activate the ones you want.
`docs/N8N_WORKFLOWS.md` describes every workflow node by node.

Local-run caveats:

- Native Telegram/WhatsApp **trigger** workflows can't activate without a public
  HTTPS `WEBHOOK_URL` — leave them inactive locally.
- Schedule-triggered digests only fire while the stack is running; n8n does not
  back-fill missed runs.

---

## 5. Set up Metabase

1. Open http://localhost:3000 and complete the first-run wizard (creates the
   Metabase admin account — stored in the separate `metabase` database).
2. **Admin → Databases → Add database**: type PostgreSQL, host `postgres`,
   port `5432`, database `itops`, your credentials.
3. Build questions and dashboards against the reporting views:
   `v_daily_it_summary`, `v_weekly_it_summary`, `v_rental_risk`,
   `v_offboarding_risk`, `v_team_custodians`, `v_persons`.

To embed a dashboard in the portal: enable static embedding in Metabase, set its
embedding secret equal to `WEBAPP_METABASE_EMBED_SECRET`, and set
`PUBLIC_METABASE_URL` so the browser can reach Metabase directly (the portal
builds a signed iframe URL — it does not proxy Metabase).

---

## 6. Running on a real host (TLS / production)

For any host other than `localhost`:

1. In `.env`, set real HTTPS URLs: `PUBLIC_APP_URL`, `PUBLIC_METABASE_URL`,
   `WEBHOOK_URL` (and the `WHATSAPP_*` values if you use WhatsApp). Metabase
   needs its **own** hostname — the portal iframe loads it directly.
2. Put TLS in front. `caddy/Caddyfile` is a starting point — replace `example.com`
   with your domains and set a real ACME email.
3. Start with the hardening overlay, which removes all host port publishes so only
   the reverse proxy can reach the services:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d \
     postgres n8n metabase webapp-api webapp-web
   ```

4. Keep Postgres, n8n and Adminer private; expose only the portal and Metabase.
   Administer the database with `docker exec -it itops_postgres psql ...` over SSH.

---

## Resetting

```bash
docker compose down -v     # removes ALL volumes: database, n8n, Metabase
docker compose up -d       # re-runs db/*.sql from scratch
```
