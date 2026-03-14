# Deploy troubleshooting (e.g. Railway — "nothing loading")

## 1. Blank or stuck screen

- **Browser DevTools → Console**: Look for red errors (e.g. failed to load script, CORS, or React errors). If you see "Something went wrong" in the UI, the app hit an error boundary — refresh and check the console.
- **Browser DevTools → Network**: Reload and check:
  - Does `index.html` return **200**?
  - Do `/assets/*.js` and `/assets/*.css` return **200**? If they are **404** or **500**, the frontend build may not be present or the server may be serving the wrong folder.
  - After login, do `/api/auth/me` and `/api/projects` return **200**? If they return **401**, the session cookie may not be set or sent (domain/path/SameSite).

## 2. Railway: build and env

- **Build**: The start command expects a built frontend. In Railway, the build step should run `npm run build`, which runs `prisma generate` and `(cd frontend && npm install && npm run build)`. That creates `frontend/dist`. In the **deploy logs**, after the server starts you should see a log line like:  
  `Serving frontend from` with `useViteBuild: true` and a path containing `frontend/dist`.  
  If you see `useViteBuild: false`, the server is serving from `public/` and the React app may not load (wrong or missing assets).

- **Env**:
  - `APP_URL` must be exactly your app URL with no trailing slash, e.g. `https://falak-production.up.railway.app`. Used for auth redirects and CORS.
  - `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` must be set.

## 3. Always seeing the Login page

- The app requires sign-in. If you are not logged in, you will see the Login page. Use "Continue with Google" and complete sign-in.
- If you just logged in but still see Login or a spinner:
  - Check **Application → Cookies** for your Railway domain: is there a `token` cookie after login?
  - If there is no cookie, the backend may be setting it on a different domain/path or the response may be cached. Ensure `APP_URL` matches the URL you use in the browser (same scheme and host).

## 4. After login, redirect to the right page

- If you opened a deep link (e.g. `/p/PROJECT_ID/stories`) and were sent to Login, after signing in you should be redirected back to that URL. If not, ensure the latest deploy includes the "returnTo" auth changes (query param and OAuth state).
