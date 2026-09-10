# webapp

The web portal for the IT Operations Asset Platform.

- **backend/** — FastAPI service (`app/`): auth, dashboard, asset requests, admin,
  password reset. Talks to the same PostgreSQL database as the n8n workflows.
- **frontend/** — React + TypeScript + Vite + Tailwind single-page app, served by
  nginx in the container. Calls the backend at same-origin `/api`.

Both are built and run by the root `docker-compose.yml` (`webapp-api`, `webapp-web`).
See the repository `README.md` for setup, and `USER_GUIDE.md` for what the portal
does and how it fits together.
