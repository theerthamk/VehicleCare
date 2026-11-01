# VehicleCare — Test Checklist

Run through this before your presentation. Start from fresh demo data:

```powershell
npm run db:seed
npm start
```

Use two different browsers (or one normal + one private window) so you can be logged in as an owner and a caretaker at the same time. Demo password: `Demo@1234`.

## 0. Automated checks (optional, 1 minute)

| # | Step | Expected | ✓ |
|---|---|---|---|
| 0.1 | `npm run check` | "All frontend API calls match backend routes." | |
| 0.2 | With the server running, in a second PowerShell window: `npm run test:smoke` | "80 passed, 0 failed" | |
| 0.3 | Open http://localhost:3000/api/health | `"database": "connected"` | |

## 1. Registration

| # | Step | Expected | ✓ |
|---|---|---|---|
| 1.1 | Open http://localhost:3000 → **Create account**, leave everything blank, submit | Red messages under the required fields | |
| 1.2 | Choose **Vehicle owner**, fill the form with password `abc` | Error under Password asking for at least 8 characters | |
| 1.3 | Enter different values in Password and Confirm password | "Passwords do not match" | |
| 1.4 | Register an owner with a new email and password `Test1234` | Lands on the owner dashboard, empty state cards | |
| 1.5 | Log out, register again with the **same email** | "An account with this email already exists." | |
| 1.6 | Register a **Caretaker** with a new email | Lands on Provider Profile with a welcome message | |
| 1.7 | Fill phone `abc` and save | "Invalid phone number" | |
| 1.8 | Fill phone, city, services offered, about you → Save | "Profile saved." | |

## 2. Login and sessions

| # | Step | Expected | ✓ |
|---|---|---|---|
| 2.1 | Log in with `owner@demo.com` and a wrong password | "Incorrect email or password." | |
| 2.2 | Log in with `owner@demo.com` / `Demo@1234` | Owner dashboard with stats, upcoming tasks, longest-parked vehicles | |
| 2.3 | Refresh the page | Still logged in | |
| 2.4 | Open http://localhost:3000/index.html while logged in | Redirects to the dashboard | |
| 2.5 | Click **Log out**, then open http://localhost:3000/pages/vehicles.html | Redirects to login; after logging in you return to Vehicles | |

## 3. Role permissions

| # | Step | Expected | ✓ |
|---|---|---|---|
| 3.1 | As owner, open `/pages/caretaker.html` | Redirected to the owner dashboard | |
| 3.2 | As caretaker, open `/pages/owner.html` | Redirected to the caretaker dashboard | |
| 3.3 | As caretaker, go to **Assigned Vehicles** | No Add / Edit / Delete buttons; only vehicles with tasks assigned to you; owner name shown | |
| 3.4 | As caretaker, in the browser console run `fetch('/api/vehicles',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.status)` | `403` (blocked by the server, not just the UI) | |
| 3.5 | Log in as `owner2@demo.com` → My Vehicles | Only Meera's 2 vehicles, none of Arun's | |
| 3.6 | As owner2, run `fetch('/api/vehicles/1').then(r=>r.status)` in the console (vehicle 1 is Arun's Swift in fresh demo data) | `404` (cannot see another owner's vehicle) | |
| 3.7 | As `caretaker2@demo.com` → My Tasks | Only Sneha's tasks (Creta), none of Rahul's | |

## 4. Vehicle CRUD (owner)

| # | Step | Expected | ✓ |
|---|---|---|---|
| 4.1 | My Vehicles → **Add vehicle**, submit empty | Field errors for make, model, registration | |
| 4.2 | Year `1800` | Error under Year (must be 1900 or later) | |
| 4.3 | Add Toyota Innova `kl-01-zz-4321`, Van, Parked, location "Shed" | Toast "Vehicle added"; registration shows as `KL-01-ZZ-4321`; Parked since = today | |
| 4.4 | Add another vehicle with the same registration | "Already used for another of your vehicles." | |
| 4.5 | **Edit** the Innova, change location → Save | Table shows the new location | |
| 4.6 | Click the **Parked / Stored / Active** tabs and type in the search box | List filters correctly | |
| 4.7 | **Delete** the Innova → Cancel | Nothing deleted | |
| 4.8 | **Delete** → Delete | Toast "Vehicle deleted"; row gone | |

## 5. Maintenance tasks

| # | Step | Expected | ✓ |
|---|---|---|---|
| 5.1 | Owner → Maintenance | Open tasks sorted by due date; overdue task has a red bar and "Overdue" badge | |
| 5.2 | **New task** for the Swift, title "Wash car", priority High, assign **Rahul Menon** | Toast "Task created and caretaker notified" | |
| 5.3 | **Edit** it, change due date and priority | Changes shown | |
| 5.4 | On "Renew insurance" (not assigned) → **Complete**, cost 1850, notes → Save | Disappears from Open; appears under **Completed** with ₹1,850.00 | |
| 5.5 | **Details** of a completed task | Shows the work record; no Edit/Complete buttons | |
| 5.6 | Create a task, then Details → **Cancel task**, then **Delete** | Moves to Cancelled, then removed | |
| 5.7 | Caretaker (`caretaker@demo.com`) → My Tasks | "Wash car" is listed with owner name | |
| 5.8 | Caretaker → **Start** on a pending task | Status becomes In progress; owner gets a "Work started" notification | |
| 5.9 | Caretaker → **Inspection** → notes, cost 0 → Save | Record saved; task stays open | |
| 5.10 | Caretaker → **Complete** with a future date | Error under Date; nothing saved | |
| 5.11 | Caretaker → **Complete** with today, cost 300, notes | Task completed; owner gets "Maintenance completed" with the total cost | |

## 6. Service requests

| # | Step | Expected | ✓ |
|---|---|---|---|
| 6.1 | Owner → Service Providers | Cards for 3 caretakers with city, phone, jobs done | |
| 6.2 | Search "Kochi" | Only Sneha Kurian | |
| 6.3 | **Request service** from Rahul for the Enfield, "Battery charging", preferred date in the past | Error under Preferred date; nothing sent | |
| 6.4 | Same with a future date | Request appears as **Pending** | |
| 6.5 | Caretaker → Service Requests (Pending tab) → **Accept** with a note | Toast; request moves to Accepted; a new task appears in My Tasks | |
| 6.6 | Owner → Service Providers | Request shows **Accepted** with the provider's note; owner has a notification | |
| 6.7 | Caretaker completes that task with a cost | Owner's request shows **Completed** with the cost | |
| 6.8 | Owner sends another request; caretaker **Declines** with a note | Owner sees Declined + note | |
| 6.9 | Owner sends another request, caretaker accepts, owner **Cancels** it | Request Cancelled and the caretaker's task Cancelled; caretaker notified | |

## 7. Notifications and reminders

| # | Step | Expected | ✓ |
|---|---|---|---|
| 7.1 | Bell icon shows a red count when there are unread notifications | Count matches the Notifications page | |
| 7.2 | Notifications → **View** on one | Marked read and opens the linked page | |
| 7.3 | **Mark all as read** | Count disappears | |
| 7.4 | Create a task due tomorrow, then restart the server (`Ctrl+C`, `npm start`) | Server log "Sent reminders for 1 task(s)"; owner (and caretaker, if assigned) get "Maintenance due soon" | |

## 8. History and expenses

| # | Step | Expected | ✓ |
|---|---|---|---|
| 8.1 | Owner → History & Expenses | Total spent, cost by vehicle, 12-month bars, all records | |
| 8.2 | Filter by one vehicle and a date range → Apply | Totals and records update; Reset clears | |
| 8.3 | Caretaker → Completed Work | Only work recorded by this caretaker, "Total billed" | |

## 9. PWA and responsive design

| # | Step | Expected | ✓ |
|---|---|---|---|
| 9.1 | Chrome DevTools → Application → Manifest | Name, icons and theme colour load with no errors | |
| 9.2 | Application → Service workers | `sw.js` is activated | |
| 9.3 | Application → Cache storage | Contains HTML/CSS/JS/icons, **no `/api/` URLs** | |
| 9.4 | Install the app from the address-bar install icon | Opens in its own window | |
| 9.5 | DevTools → Network → Offline, reload | Page opens with a "cannot reach the server" message (no crash) | |
| 9.6 | DevTools device toolbar at 390 px width | Menu button opens the sidebar; tables become cards; no sideways scrolling | |

## 10. Error handling

| # | Step | Expected | ✓ |
|---|---|---|---|
| 10.1 | Stop the MySQL service, open `/api/health` | `503` with "Cannot reach MySQL… Is the MySQL service running?" | |
| 10.2 | With MySQL stopped, try to log in | Clear "database is not available" message, no crash | |
| 10.3 | Start MySQL again and reload | Works again without restarting Node | |
