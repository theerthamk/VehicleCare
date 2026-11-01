# VehicleCare

A Progressive Web App for looking after vehicles that are **parked or unused for long periods** and coordinating their maintenance between **vehicle owners** and **caretakers / service providers**.

- **Frontend:** HTML, CSS, vanilla JavaScript (installable PWA)
- **Backend:** Node.js + Express REST API
- **Database:** MySQL 8.0 or newer
- **Security:** bcrypt password hashing, session cookies (httpOnly, SameSite), role checks on every API route, per-owner data isolation, input validation, login rate limiting

---

## 1. Architecture

```
 Browser (PWA)                       Node.js / Express                     MySQL
 ─────────────                       ─────────────────                     ─────
 index.html (login/register)   ──►   /api/auth          auth.js      ──►   users
 owner.html / caretaker.html   ──►   /api/dashboard     dashboard.js       vehicles
 vehicles.html                 ──►   /api/vehicles      vehicles.js        maintenance_tasks
 maintenance.html              ──►   /api/maintenance   maintenance.js     maintenance_records
 services.html                 ──►   /api/services      services.js        service_requests
 history.html                  ──►   /api/reports       reports.js         notifications
 notifications.html            ──►   /api/notifications notifications.js
 profile.html                         reminderService.js (hourly "due soon" reminders)
 sw.js (caches static files only, never /api)
```

**How the roles work together**

1. An **owner** adds vehicles and plans maintenance tasks (due date, priority).
2. A task can be **assigned to a caretaker** directly, or the owner can send a **service request** to a provider from the directory.
3. When a provider **accepts** a request, a maintenance task is created and assigned to them automatically.
4. The caretaker **starts** the task, records **inspections**, and **completes** it with notes and cost.
5. Completing a task that came from a request marks the request **completed** with the recorded cost.
6. Both sides get **notifications** at each step, plus automatic reminders when work is due within 3 days (`REMINDER_DAYS_AHEAD`).
7. Every record goes into the **history & expenses** report.

**Who can see what** (enforced in SQL on the server, not just hidden in the UI)

| Data | Owner | Caretaker |
|---|---|---|
| Vehicles | Only their own (create / edit / delete) | Read-only, only vehicles with a task assigned to them |
| Maintenance tasks | Tasks on their own vehicles (create, edit, assign, cancel, delete, complete) | Only tasks assigned to them (start, inspect, complete) |
| Service requests | Requests they sent (create, cancel) | Requests sent to them (accept, decline) |
| History & expenses | Records on their own vehicles | Records they performed |
| Notifications | Their own | Their own |

Anything outside a user's scope returns **404**, so one owner cannot even discover another owner's vehicle IDs. Actions a role may never perform return **403**.

## 2. Folder structure

```
vehiclecare/
├── server.js                  Express app: security headers, sessions, routes, errors
├── package.json
├── .env.example               Copy to .env and fill in
├── config/db.js               MySQL pool, transactions, friendly DB error messages
├── database/schema.sql        Creates the database, tables, keys and indexes
├── middleware/
│   ├── auth.js                requireAuth (must be logged in)
│   └── roles.js               requireRole('owner') etc.
├── routes/
│   ├── auth.js                register, login, logout, me, profile
│   ├── dashboard.js           role-specific summary
│   ├── vehicles.js
│   ├── maintenance.js         tasks + inspection/completion records
│   ├── services.js            provider directory + service requests
│   ├── notifications.js
│   └── reports.js             history + expenses
├── services/
│   ├── notificationService.js
│   └── reminderService.js     hourly due-soon / overdue reminders
├── utils/
│   ├── http.js                HttpError, asyncHandler, parseId
│   └── validate.js            whitelist input validation
├── scripts/
│   ├── init-db.js             npm run db:init   (imports schema.sql)
│   ├── seed.js                npm run db:seed   (demo data)
│   ├── check.js               npm run check     (frontend URLs vs backend routes)
│   └── lib.js
├── tests/smoke.js             npm run test:smoke (80 end-to-end API checks)
├── TESTING.md                 Manual test checklist for the demo
└── public/
    ├── index.html             Login / register with role selection
    ├── manifest.json, sw.js, offline.html, 404.html
    ├── icons/                 PWA icons (192, 512, maskable 512)
    ├── css/styles.css         Blue-and-white design system
    ├── js/
    │   ├── api.js             fetch wrapper with readable errors
    │   ├── app.js             shell, navigation, dialogs, forms, formatting
    │   ├── auth.js  dashboard.js  vehicles.js  maintenance.js
    │   └── services.js  history.js  notifications.js  profile.js
    └── pages/
        ├── owner.html  caretaker.html  vehicles.html  maintenance.html
        └── services.html  history.html  notifications.html  profile.html
```

## 3. Setup on Windows (PowerShell)

### Requirements

- **Node.js 18 or newer** — check with `node -v`. Download the LTS version from nodejs.org.
- **MySQL Server 8.0 or newer** — installed with MySQL Installer, running as a Windows service. You need the root password you chose during installation (or another MySQL user that can create databases).

### Steps

Open PowerShell in the project folder (the one containing `package.json`):

```powershell
# 1. Install dependencies
npm install

# 2. Create your .env file from the example
Copy-Item .env.example .env

# 3. Generate a session secret and copy the output
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Edit .env: set DB_PASSWORD and paste the secret into SESSION_SECRET
notepad .env
```

In `.env`, if your MySQL password contains `#` or spaces, wrap it in double quotes, e.g. `DB_PASSWORD="my#pass"`. Otherwise everything after `#` is ignored.

```powershell
# 5. Create the database and tables (asks you to type "yes")
npm run db:init

# 6. Optional: load demo data (asks you to type "yes")
npm run db:seed

# 7. Start the server
npm start
```

Open **http://localhost:3000**.

**Alternative to step 5 using the MySQL command-line client** (PowerShell does not support `<` redirection):

```powershell
Get-Content database\schema.sql | mysql -u root -p
```

If `mysql` is not recognised, use the full path, e.g. `& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p`. The schema always creates a database named `vehiclecare`; `npm run db:init` uses `DB_NAME` from `.env` instead.

### Demo accounts (after `npm run db:seed`)

Password for all: `Demo@1234`

| Role | Email | Name |
|---|---|---|
| Owner | owner@demo.com | Arun Nair |
| Owner | owner2@demo.com | Meera Pillai |
| Caretaker | caretaker@demo.com | Rahul Menon |
| Caretaker | caretaker2@demo.com | Sneha Kurian |
| Caretaker | caretaker3@demo.com | Vishnu Das |

Seed dates are relative to the day you run it, so there are always overdue, upcoming and completed tasks to show. Run `npm run db:seed` again before your presentation to reset the data.

### Useful commands

| Command | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start and restart automatically when files change |
| `npm run db:init` | Re-create all tables (**deletes all data**). Add `-- --yes` to skip the prompt |
| `npm run db:seed` | Replace all data with demo data. Add `-- --yes` to skip the prompt |
| `npm run check` | Check every frontend API call matches a backend route (no DB needed) |
| `npm run test:smoke` | With the server running, run 80 end-to-end API checks using new random users |
| `GET /api/health` | Shows whether the database is connected |

## 4. Troubleshooting

| Message | Fix |
|---|---|
| `SESSION_SECRET is missing or too short` | Do steps 3–4 above |
| `Cannot reach MySQL at localhost:3306` | Start MySQL: Win + R → `services.msc` → start **MySQL80**. Check `DB_PORT` |
| `MySQL rejected the username or password` | Fix `DB_USER` / `DB_PASSWORD` in `.env` (quote it if it has `#`) |
| `The database "vehiclecare" does not exist yet` | Run `npm run db:init` |
| `Port 3000 is already in use` | Close the other server or set `PORT=3001` in `.env` |
| Page shows old JavaScript after you edit files | The service worker cached it. Reload twice, or DevTools → Application → Service workers → Unregister. Change `CACHE_VERSION` in `public/sw.js` when you ship changes |
| `Too many attempts` on login | After 20 failed login/register attempts from one IP in 15 minutes, further attempts are blocked. Wait, or restart the server |

The server still starts when the database is down, so `/api/health` can tell you what is wrong; API calls return `503` with a clear message until it is fixed.

## 5. API reference

All responses are JSON. Errors look like `{ "error": "Message", "details": { "field": "Message" } }`. Write requests must send `Content-Type: application/json`.

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | Server + database status |
| POST | `/api/auth/register` | public | `{ full_name, email, password, role }` |
| POST | `/api/auth/login` | public | `{ email, password }` |
| POST | `/api/auth/logout` | any | End session |
| GET | `/api/auth/me` | any | Current user |
| PUT | `/api/auth/profile` | any | Name, phone, city (+ specialization, bio for caretakers) |
| GET | `/api/dashboard` | any | Role-specific stats and upcoming work |
| GET | `/api/vehicles?status=` | any | Owner: own vehicles. Caretaker: assigned vehicles |
| GET | `/api/vehicles/:id` | any | One vehicle (same scope) |
| POST | `/api/vehicles` | owner | Create |
| PUT | `/api/vehicles/:id` | owner | Update |
| DELETE | `/api/vehicles/:id` | owner | Delete (also its tasks, records, requests) |
| GET | `/api/maintenance?status=open\|overdue\|pending\|in_progress\|completed\|cancelled\|all&vehicle_id=` | any | List tasks in scope |
| GET | `/api/maintenance/:id` | any | Task + its records |
| POST | `/api/maintenance` | owner | Create task (optional `assigned_to` caretaker) |
| PUT | `/api/maintenance/:id` | owner | Edit open task |
| PATCH | `/api/maintenance/:id/status` | owner, caretaker | Owner: pending / in_progress / cancelled. Caretaker: pending / in_progress |
| POST | `/api/maintenance/:id/records` | owner, caretaker | `{ record_type, service_date, notes, cost, mark_complete }` |
| DELETE | `/api/maintenance/:id` | owner | Delete a task that is not completed |
| GET | `/api/services/providers?q=` | any | Caretaker directory |
| GET | `/api/services/requests?status=` | any | Owner: sent. Caretaker: received |
| POST | `/api/services/requests` | owner | `{ vehicle_id, provider_id, service_type, details, preferred_date }` |
| PATCH | `/api/services/requests/:id/status` | owner, caretaker | Owner: cancelled. Provider: accepted / declined (+ `provider_note`) |
| GET | `/api/notifications?unread=1` | any | Latest 100 + unread count |
| PATCH | `/api/notifications/:id/read` | any | Mark one read |
| PATCH | `/api/notifications/read-all` | any | Mark all read |
| GET | `/api/reports/history?vehicle_id=&from=&to=` | any | Maintenance records |
| GET | `/api/reports/expenses?vehicle_id=&from=&to=` | any | Totals by vehicle and month |

## 6. Database design

- **users** — owners and caretakers; `role` is `owner` or `caretaker`; caretakers also have `phone`, `city`, `specialization`, `bio`. `email` is unique; only a bcrypt `password_hash` is stored.
- **vehicles** — `owner_id → users`. Registration number is unique per owner. `status` is `active`, `parked`, `in_service` or `stored`, with `parked_since`.
- **maintenance_tasks** — `vehicle_id → vehicles`, optional `assigned_to → users`. Status `pending → in_progress → completed` (or `cancelled`). `reminder_sent_at` stops duplicate reminders.
- **service_requests** — `vehicle_id`, `owner_id`, `provider_id`, and `task_id` (the task created when accepted).
- **maintenance_records** — inspections and completed work with `cost`; this is the service history.
- **notifications** — per-user messages with `read_at`.

Deleting a vehicle removes its tasks, requests and records (`ON DELETE CASCADE`). Deleting a caretaker un-assigns their tasks (`ON DELETE SET NULL`). Indexes cover every foreign key and the main filters (status, due date, unread notifications).

## 7. PWA notes

- `manifest.json` + icons make the app installable (Chrome: install icon in the address bar; Android: "Add to Home screen").
- `sw.js` pre-caches HTML, CSS, JS and icons. **It never caches `/api/` responses**, and the server sends `Cache-Control: no-store` on all API responses, so private data is never stored offline.
- Offline, cached pages still open but show a "cannot reach the server" message; `offline.html` is shown for pages that were never visited.
- Service workers need `localhost` or HTTPS. On another device in your network over plain `http://192.168…`, the app works but cannot be installed.

## 8. Production notes

This project is set up for a local college demo. Before deploying publicly:

- Set `NODE_ENV=production` and serve over **HTTPS** (session cookies are then marked `Secure`).
- Replace the default in-memory session store (sessions are lost on restart and it is not meant for multiple servers) with a persistent store such as `express-mysql-session`.
- Use a dedicated MySQL user with rights only on the `vehiclecare` database instead of `root`.
