# Falak — Testing checklist and tweaks

Use this to test the app and see what’s wired to the API vs still mock.

---

## 1. Login and auth

- [ ] Open the app → you should be redirected to **Login** if not logged in.
- [ ] Click **Continue with Google** → redirects to Google, then back to the app with you logged in.
- [ ] If your email is not allowed, you should see **“Your account is not allowed”** (and `OWNER_EMAIL` in Railway must match for first user).
- [ ] After login, sidebar shows your name at the bottom.

**Tweaks done:** Login uses real Google OAuth; errors from URL (`?error=...`) are shown; already-logged-in users are redirected to `/`.

---

## 2. Channels (real API)

- [ ] **Channels** page loads and shows the list from the DB (or “Loading…” then empty if none).
- [ ] **Add channel:** choose Ours/Competition, enter a YouTube handle or URL, click Add → channel appears after backend fetches it.
- [ ] **Delete one:** hover a row, click the X → confirm in modal → channel is removed.
- [ ] **Click a channel name** → opens **Channel detail** for that channel (real data).

**Tweaks done:** Channels list, add, and delete use `/api/channels`; Channel detail uses `/api/channels/:id` and `/api/channels/:id/videos`.

---

## 3. Channel detail (real API)

- [ ] From Channels, click a channel → detail page shows that channel’s info and **Recent Videos** from the DB.
- [ ] Filters (All, Videos, Shorts, Analyzing, Done, Failed) filter the list.
- [ ] Click a video row → goes to **Video detail** (video detail may still be mock).
- [ ] **Channel not found:** open `/channel/fake-id` → “Channel not found” and link back to Channels.

**Tweaks done:** Channel detail and videos table are wired to the API.

---

## 4. Admin — Danger zone

- [ ] Go to **Admin** → scroll to **Danger zone**.
- [ ] Click **Delete all channels** → confirm in the dialog → all channels are removed from the DB; message shows how many were deleted.

**Tweaks done:** Button calls `DELETE /api/channels/all`; no terminal needed.

---

## 5. Pages still on mock data

These work in the UI but use **mock data** (no real API yet):

- **Pipeline** — mock pipeline items.
- **Monitor** — mock health.
- **Analytics** — mock stats.
- **Stories** — mock stories.
- **Brain** — mock data.
- **Settings** — mock/placeholder.
- **Admin** (user list) — mock allowed users; only “Delete all channels” is real.
- **Video detail** (`/video/:id`) — mock; can be wired to real API later.

---

## 6. Quick tweaks we can do next

- **Video detail:** Wire to `GET /api/videos/:id` (or your video API) so clicking a video shows real data.
- **Pipeline:** Wire to your pipeline API so the board shows real jobs.
- **Logout:** Add a logout button (e.g. in sidebar) that calls `POST /api/auth/logout` and redirects to Login.
- **Admin user list:** Replace mock with `GET /api/admin/users` (or your users API) when available.

---

## 7. If something breaks

- **“Continue with Google” does nothing or doesn’t open Google:**  
  - You should now see an error message on the login page (e.g. from the server).  
  - In **Railway → Variables**, set **APP_URL** to your live URL with no trailing slash (e.g. `https://falak-production.up.railway.app`).  
  - Set **GOOGLE_CLIENT_ID** and **GOOGLE_CLIENT_SECRET** (from Google Cloud Console). In Google Cloud, add this **Authorized redirect URI**: `https://YOUR-APP-URL/api/auth/google/callback` (same as APP_URL + `/api/auth/google/callback`).  
  - The app and API must be on the **same origin** (one Railway service that serves both the frontend and `/api`). If the frontend is hosted elsewhere, the login request may be going to the wrong place.
- **Login redirect loop:** Ensure `APP_URL` in Railway matches the app URL (e.g. `https://falak-production.up.railway.app`).
- **401 on every request:** Cookies must be sent; same origin or correct CORS + credentials. Production uses same domain so cookies work.
- **Channel add fails:** Check Railway logs; often YouTube API quota or invalid handle/URL.
- **Empty channels list:** Normal if DB has no channels; add one from the Channels page.

Say what you tested and what failed or felt wrong, and we can tweak those next.
