# eTricks Hub

Internal management system for eTricks: departments, teams, attendance, leave, tasks, finance and performance, with a Team Leader portal, a Team Member portal for every department, and an Admin portal.

No installation of packages is needed. You only need **Node.js 22.13 or newer** (checked with 24).

## Start

```
start.bat            (Windows: double-click)
npm start            (any system)
```

Open http://127.0.0.1:3000. For other computers in the office set `HOST=0.0.0.0` first (and put it behind HTTPS, see Security).

On the **first start** the system creates the 6 departments (eBay, TikTok Shop, Etsy, Walmart, Shopify, Amazon) with random passwords and saves them in `data/initial-credentials.txt`. Note them down, change them from the Admin portal, then delete that file.

To try every screen with sample people first: `npm run demo` (only works on an empty system; sample PIN is 123456). Delete the `data` folder afterwards to start clean.

`npm test` runs an end-to-end check of the whole API on a throw-away database.

## Who sees what

| Portal | Password | Can do |
| --- | --- | --- |
| Admin | one admin password | everything, all departments, **Company Finance (departments + bills + salaries = net profit)**, **team leader salaries**, settings, custom fields, backups, activity log |
| Team Leader (per department) | department leader password | own department only: employees and joining history, teams, attendance approval, leave approval, tasks, work-log ratings, finance (investment / orders / profit), reports, **salary payments to members**, member orders and reports, complaints, notifications (check-in/out, leave, finished tasks) |
| Team Member (per department) | department member password **plus a personal 6-digit PIN** | own attendance (check in, breaks, check out), leave requests, own tasks and daily work log, own profile, **own salary: confirm "received" or "not received"**, report own orders / investment / sales, see and reply to complaints, own report, notifications (new tasks, approvals) |

The personal PIN stops one member marking attendance for another. A PIN is shown once when the employee is created and can be reset from the profile.

## Add a new feature later (payroll, CRM, recruitment, commission...)

Everything is a module. To add one, create `modules/<name>/index.js` (database tables via `migrations`, API via `routes`) and `public/modules/<name>.js` (screens via `E.page(...)`). Nothing else needs editing: the module is loaded, migrated, shown in the sidebar and listed under Settings → Modules where the admin can switch it off. Copy `modules/leave` and `public/modules/leave.js` as a starting point.

Extra fields on employees, tasks and finance entries are added by the admin under **Custom Fields**, without code.

## Security and data safety

- Passwords and PINs are stored only as scrypt hashes. Sessions use random tokens (hashed in the database), HttpOnly + SameSite=Strict cookies, 12 hour expiry.
- 6 wrong passwords lock that portal for 10 minutes. Every sign-in, failed sign-in and change is written to the Activity Log, which cannot be edited from the app.
- Every API call checks the role and department on the server; a leader cannot reach another department even by editing requests.
- A consistent database backup is taken automatically every day (newest 30 kept in `data/backups`) and on demand from Settings. **Copy backups off this computer regularly.** To restore: stop the app, replace `data/etricks.db` with a backup file, start again.
- Use HTTPS when the app is reachable beyond one computer (for example behind Caddy or nginx), then set `SECURE_COOKIES=1` and, if the proxy forwards the client address, `TRUST_PROXY=1`.

## Pop-up notifications on phone and computer

Click the bell, then **Turn on** (a banner also offers it after sign-in). The browser asks once for permission; after that eTricks shows a system notification, like a messaging app, **even when the tab or browser is closed**: new task, leave decision, check-in of a team member, complaint, salary payment and so on. Tapping it opens the right page. **Send test** in the bell panel checks it works. Signing out removes that device, so a shared computer never shows someone else's alerts.

- It uses standard Web Push; the server talks to Google / Mozilla / Apple / Microsoft push services, so the server needs internet access. No account or extra software is needed.
- Browsers only allow it on **https://** (or http://localhost on the same computer). For phones, publish eTricks over HTTPS (for example behind Caddy, or a Cloudflare Tunnel) and set `SECURE_COOKIES=1`.
- iPhone / iPad (iOS 16.4+): open eTricks in Safari, tap Share, **Add to Home Screen**, open it from the new icon, then turn notifications on. Android: Chrome works directly (you can also "Install app").
- Without HTTPS the bell, the unread count and the in-page banner still work while eTricks is open.

## Settings you can change by environment variable

`PORT` (3000), `HOST` (127.0.0.1), `DATA_DIR`, `VAPID_SUBJECT` (contact for push services, default mailto:admin@etricks.local), `TZ` (Asia/Karachi, used for attendance dates and late marking), `SESSION_HOURS` (12), `BACKUP_KEEP` (30).

## Logo

Put your logo file at `public/img/logo.png`. It is picked up automatically (login page, sidebar). Until then a built-in shield mark in the same lime green is shown.
