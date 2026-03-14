# What we need from you for seamless work

So we can change layout and DB **without asking you to use the terminal**, here’s what you need to do once (or when something changes).

---

## 1. Deploy from GitHub

- Keep **Railway** connected to **[github.com/aldhubaib/falak](https://github.com/aldhubaib/falak)**.
- When we change code and push to `main`, Railway will redeploy. You don’t need to run any commands.

---

## 2. Railway Variables

- In Railway → **falak** service → **Variables**, keep these set (you already have them):
  - `APP_URL` = your live URL, e.g. `https://falak-production.up.railway.app`
  - `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, etc.
- If we ever need a **new** variable, we’ll tell you the **exact name and value**; you add it in the Variables tab.

---

## 3. Clearing the DB (channels)

- You **don’t need the terminal**.
- In the app: go to **Admin** (sidebar) → scroll to **Danger zone** → click **Delete all channels** → confirm.
- That removes every channel (and related data) from the database.

---

## 4. What you can ignore

- You don’t need to run `npm install`, `npm run build`, or any scripts locally.
- You don’t need to run Prisma or database commands yourself; we’ll do it via the app or migrations that run on deploy.

---

## 5. If something breaks

- Tell us: **what you did** (e.g. “clicked Delete all channels”) and **what you see** (e.g. error message, blank page, wrong layout).
- If Railway shows a **failed deployment**, a screenshot of the error or the **View logs** output helps.

---

**Summary:** You keep Railway connected to GitHub and Variables set. We change code and push; you use the app (and Admin when you need to clear channels). No terminal needed on your side.
