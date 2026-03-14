# Falak Frontend

React + Vite + Tailwind + shadcn-style UI (from vid-wise-owl). Wired to the Falak backend API.

## Run locally

1. **Backend** (from repo root, in one terminal):
   ```bash
   cd .. && npm run dev
   ```
   Backend runs on port 3000 by default. Set `.env` with `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, etc.

2. **Frontend** (in this folder):
   ```bash
   npm run dev
   ```
   Frontend runs on **http://localhost:5173**. API requests to `/api/*` are proxied to the backend (see `vite.config.ts`).

3. **CORS**: For cookie-based auth, set `APP_URL=http://localhost:5173` in the backend `.env` so the server allows credentials from the dev server.

## Build

```bash
npm run build
```

Output is in `dist/`. The Falak server serves this when running in production.
