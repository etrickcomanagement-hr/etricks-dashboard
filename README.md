# eTricks Dashboard (website)

This repo is only the **website** (static files) of the eTricks Hub. It is hosted on **Vercel**. The server, database and logic live in the separate repo `etricks-dashboard-backend` (hosted on Railway).

There is nothing to build: Vercel serves the files in this repo as they are.

## Deploy on Vercel

1. In Vercel choose **Add New → Project** and import this repo.
2. Framework preset: **Other**. Leave Build Command and Output Directory empty. Deploy.
3. Deploy the backend on Railway first (see its README) and copy its public address, for example `https://etricks-backend-production.up.railway.app`.
4. Open `vercel.json` in this repo and replace `https://YOUR-BACKEND.up.railway.app` with that address (keep `/api/:path*` after it). Commit. Vercel redeploys.

## How the website talks to the backend

The browser only ever talks to your Vercel address. `vercel.json` forwards every `/api/...` request to the backend. Because of that:

- login cookies are first-party cookies (they work on iPhone / Safari and with strict browsers),
- no CORS setup is needed,
- the backend address is never typed into the website code.

## Notifications on phones

Pop-up notifications need HTTPS, which Vercel provides automatically. On iPhone use Share → **Add to Home Screen** first, then turn notifications on from the bell.

## Files

`index.html`, `css/`, `js/` (core and app), `modules/` (one file per feature screen), `sw.js` (notification service worker), `manifest.webmanifest`, `img/`.
To add a screen for a new backend module, add `modules/<module-id>.js`; it is loaded automatically when the backend lists that module.
