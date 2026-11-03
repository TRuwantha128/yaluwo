# Yaluwo

Group travel across Sri Lanka. People plan a route, fill the seats with verified travellers, book a driver, and each person pays their own share. Yaluwo holds the money and pays the driver after the trip.

This is **Phase 1** of the workflow document (v3): accounts and ID checks, trips, joining, drivers and vehicles, offers and bookings, payments (PayHere and bank slips), payouts, chat, reviews, disputes, reports and the admin console.

```
yaluwo/
  backend/    Node.js + Express API, PostgreSQL (Knex), Socket.IO for live updates
  frontend/   React 19 + Vite + Tailwind 4 website (motion, Lenis, React Three Fiber)
```

---

## 1. What you need

| | Version | Notes |
|---|---|---|
| Node.js | **22 LTS** or newer | https://nodejs.org |
| PostgreSQL | 14 or newer | The server that **pgAdmin** connects to. Tested on PostgreSQL 16 |

## 2. Create the databases (once) in pgAdmin

1. Open **pgAdmin** and connect to your server (it asks for the `postgres` password you chose when installing PostgreSQL).
2. Right-click **Databases** → **Create** → **Database…** → name it `yaluwo` → **Save**.
3. Do the same again for `yaluwo_test` (only used by `npm test`).

Or in the terminal (Windows, PostgreSQL 16; change `16` to your version):

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE yaluwo" -c "CREATE DATABASE yaluwo_test"
```

## 3. Start the API

```bash
cd backend
npm install
npm run make-env      # asks for your PostgreSQL password, creates backend/.env with fresh secrets
npm run migrate       # creates the 53 tables and the starting settings
npm run setup-admin   # creates the ONE owner admin (asks for email, phone, password; scan the QR with Google Authenticator)
npm run dev           # http://localhost:8080/api/v1
```

`setup-admin` runs only once. Nobody can sign up as an admin on the website. If the owner loses the phone and backup codes: `npm run setup-admin -- --recover` on the server.

## 4. Start the website

In a second terminal:

```bash
cd frontend
npm install
npm run dev           # http://localhost:5173
```

The website talks to the API through `/api` (Vite forwards it to port 8080, including live updates).

- Website: http://localhost:5173
- Admin console: http://localhost:5173/admin/login

## 5. Local mode (no real money, no real SMS)

With the `.env` defaults everything works offline:

| Thing | Local behaviour | For real use |
|---|---|---|
| Email and SMS codes | Printed in the API terminal and shown in **Admin → Dev outbox** | `SMTP_*` and an SMS gateway (Dialog / Mobitel / Notify.lk) |
| Card payments | `PAYHERE_MODE=simulate`: an in-site test page sends a correctly signed notice | `PAYHERE_MODE=sandbox` with your sandbox merchant ID and secret, then `live` |
| Distances | Estimated from straight-line distance × road factor | `GOOGLE_MAPS_SERVER_KEY` (Routes API) |
| Map and place search | Free preview + Yaluwo's 89 places | `frontend/.env.local` → `VITE_GOOGLE_MAPS_API_KEY` |
| Bank slips | Admin uploads the bank statement CSV and approves matched slips | Same |

**Demo clock:** in local mode, *Admin → Dev outbox and clock* moves the server's clock forward (+1, +7, +14 days) and runs the daily jobs, so you can show a whole trip (trip day, completion, reviews, payouts) in one sitting. Restart the API to go back to real time.

**Before taking payments:** set Yaluwo's bank account in *Admin → Settings → Money safety → bank.transfer_account*, and have a lawyer review the legal pages (*Admin → Settings → Legal pages*).

## 6. Try the Gate 1 flow

1. Sign up as the organiser → verify the NIC (photos + selfie).
2. Admin → Verifications → Approve.
3. Organiser → Create a trip (Kandy → Nuwara Eliya → Ella, 4 people) → Publish.
4. Three more people sign up, get verified, and *Ask to join*. The organiser accepts them and locks the group.
5. A driver signs up (*Driver with my own vehicle*), sends NIC and licence, adds a van with 6 photos and documents; admin approves.
6. Driver → *Find trips* → *Send offer*. Organiser → *Accept offer* → *Ask everyone to pay*.
7. Three pay by card (test page), one by bank transfer slip. Admin → Payments → Slips to check → upload a CSV with the reference (e.g. `YLW-2610-0001-M4`) and amount → Approve. The trip is **Confirmed**.
8. Driver turns on two-step login, adds a bank account; admin approves it.
9. Admin → Dev outbox and clock: +7 days until the trip starts → everyone *Checks in*. Move on until it is Completed → rate the driver.
10. One more day → Admin → Payments → Ready → *Release* → *Bank file* (CEFT CSV) → *Mark sent* → *Paid*.

Statement CSV format (any bank export with these columns works):

```
Date,Description,Amount,Reference
2026-10-23,CEFT CR YLW-2610-0001-M4 R JAYASINGHE,19060.91,YLW-2610-0001-M4
```

## 7. Tests

```bash
cd backend
npm test      # 19 tests: the whole Gate 1 flow and the cancellation, refund, dispute and settings rules
```

Tests use the `yaluwo_test` database and never touch your real data.

## 8. Money rules (from the workflow)

- Fixed route: `max(km × rate, days × day minimum) + nights × driver allowance + return km × empty % × rate`
- Flexible: `days × daily rate + extra km × rate + nights × allowance`
- Drivers can ask 70–130 % of the suggested price. Shares are split evenly.
- Travellers pay a 5 % booking fee; partners pay 10 % commission.
- Every price, fee, deadline and list lives in *Admin → Settings and rates* (versioned, with notice periods), never in code.

## 9. Not in Phase 1 yet

Hotels and food suppliers, guides, activities, ads, Sinhala and Tamil, web push and WhatsApp, staff accounts (invite-only), automatic face matching.

## 10. Security notes

- Access tokens live 15 minutes in memory; refresh tokens rotate in an httpOnly cookie.
- NIC, licence and bank numbers and two-step secrets are encrypted (AES-256-GCM) with `DATA_KEY`. **Back up `DATA_KEY`**: without it they cannot be read.
- Private files (IDs, slips) are served only through signed links that expire after 5 minutes.
- Sensitive actions (bank accounts, payouts over the limit, fee changes) ask for the password and code again.
- The audit log cannot be edited or deleted (database triggers).
- Phone numbers and links are hidden in chat until the trip is confirmed.

---

## Hosting (tharinduruwantha.dev)

| Part | Where | Address |
|---|---|---|
| Website (`frontend/`) | Vercel | https://tharinduruwantha.dev |
| API (`backend/`) | Render (web service, Singapore) | https://api.tharinduruwantha.dev |
| Database | Neon (Singapore), **direct** connection string, not the pooled one | — |

**Vercel** – Root directory `frontend`, framework Vite. Environment variables:
`VITE_API_URL=https://api.tharinduruwantha.dev` and `VITE_GOOGLE_MAPS_API_KEY=...`

**Render** – Root directory `backend`, build `npm ci`, start `npm start`. Environment variables:

```
NODE_ENV=production
APP_URL=https://tharinduruwantha.dev
API_URL=https://api.tharinduruwantha.dev
DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
JWT_SECRET=  REFRESH_SECRET=  DATA_KEY=  FILE_SECRET=   (new random values, 64 hex characters each)
PAYHERE_MODE=sandbox   (simulate is refused in production)
PAYHERE_MERCHANT_ID=  PAYHERE_MERCHANT_SECRET=
SMTP_HOST=  SMTP_PORT=587  SMTP_USER=  SMTP_PASSWORD=  MAIL_FROM=
STORAGE_DIR=/var/data/private   (only with a Render disk mounted at /var/data)
```

Make the secrets: `node -e "for (const k of ['JWT_SECRET','REFRESH_SECRET','DATA_KEY','FILE_SECRET']) console.log(k+'='+require('crypto').randomBytes(32).toString('hex'))"`

**Owner admin on the hosted database** – put the same values in `backend/.env.production` (never committed), then in PowerShell:

```powershell
cd backend
$env:DOTENV_CONFIG_PATH=".env.production"; npm run setup-admin; Remove-Item Env:DOTENV_CONFIG_PATH
```

The API creates its tables by itself when it starts.
