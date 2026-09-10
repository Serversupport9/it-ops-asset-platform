# IT Operations Asset Platform

A self-hosted platform for tracking and managing office IT hardware — laptops,
desktops, monitors, phones, printers, network gear — across their full lifecycle:
requests, approvals, fulfilment, returns, offboarding reclaim, and reporting.
Built to replace manual spreadsheet-based asset tracking.

## What's in the box

| Layer | Tech |
|---|---|
| Database / source of truth | PostgreSQL |
| Automation & workflows | n8n |
| Dashboards | Metabase (self-hosted) |
| Web portal — API | FastAPI |
| Web portal — frontend | React + Vite + Tailwind |
| Reverse proxy / TLS | Caddy |
| Runtime | Docker Compose |
| Notifications | Telegram, Gmail, WhatsApp Cloud API |

Everything runs in containers; no paid SaaS is required.

## Repository layout

```
db/               schema.sql (full consolidated schema), 00-init-databases.sql, seed_device_types.sql
n8n-workflows/    the automation workflows, as exported n8n JSON
webapp/           FastAPI backend + React frontend
caddy/            reverse-proxy config for a TLS deployment
docker-compose.yml            local / single-host stack
docker-compose.prod.yml       hardening overlay for a public host
docs/SETUP.md                 full setup guide
docs/N8N_WORKFLOWS.md         node-by-node reference for every workflow
USER_GUIDE.md                 how the portal works, per role
```

## Quick start

```bash
cp .env.example .env      # fill in real values — every key is documented in the file
docker compose up -d
```

On the first start with an empty database volume, Postgres runs everything in
`db/` in order (`00-init-databases.sql` → `schema.sql` → `seed_device_types.sql`),
so the schema is ready automatically. Then create the first admin user, import the
n8n workflows, and point Metabase at the `itops` database.

**Full step-by-step instructions — including the first admin, n8n credentials,
Metabase, and running behind TLS — are in [`docs/SETUP.md`](docs/SETUP.md).**

The platform ships with no seed/business data — populate `employees`, `offices`,
`assets`, etc. from your own source.

## Configuration notes

- Config and workflow files use placeholders — replace them for your environment:
  `example.com`, `YOUR_TELEGRAM_CHAT_ID`, `YOUR_WHATSAPP_PHONE_NUMBER_ID`,
  `YOUR_SUPER_ADMIN_ID`, `[Your Organization]`.
- `webapp/frontend/public/logo.png` is a placeholder — drop in your own.
- `webapp/frontend/public/privacy-policy.html` is a template — fill in every
  `[Your Organization]` / `[…]` and have it reviewed before relying on it.
- `.github/workflows/ci.yml` runs lint + typecheck + build. The original private
  setup's deploy/migration pipelines are not included.

## License

MIT — see [`LICENSE`](LICENSE).
