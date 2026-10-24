# SeatLock: Event Ticket Booking

A full-stack ticket booking app. The Flask API handles events, shows and
seat maps, 10-minute seat holds with auto-expiry, transactional booking that
cannot double-book a seat, idempotent mock payments, cancellation, waitlist
and admin endpoints. A React single-page app (in `frontend/`) provides the
customer and admin screens.

## Stack

- Frontend: React 18, React Router 6, Vite (in `frontend/`)
- Python 3.12, Flask, Flask-SQLAlchemy, python-dotenv
- SQLite by default (file under `instance/` when run), PostgreSQL via
  `DATABASE_URL` — see below
- Password hashing with Werkzeug, JWT auth with PyJWT
- Seat holds stored in the database, with a background cleanup thread
  plus lazy expiry on seat requests — **no Redis, Docker or paid
  service is required to run the default version**

## Quick start

### 1. Backend

```bash
cd seatlock
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # then edit the secrets (see "Environment variables")
python seed.py                # demo data; --reset drops and re-seeds
python app.py                 # API on http://127.0.0.1:5000
```

`python app.py` also seeds demo data on first run if the database is empty.

### 2. Frontend

Development, with hot reload (API requests are proxied to Flask):

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

Production-style, served by Flask itself (one server, one port):

```bash
cd frontend && npm install && npm run build
cd .. && python app.py        # app + API on http://127.0.0.1:5000
```

Flask serves `frontend/dist` and falls back to `index.html` for client-side
routes, so deep links such as `/tickets/3` work after a refresh.

### App routes

| Route | Page | Access |
|---|---|---|
| `/` | Event listing with search and category filter | public |
| `/events/:eventId` | Event details, shows and seat availability | public |
| `/shows/:showId` | Seat map, selection, hold | public to view, sign-in to hold |
| `/checkout/:showId` | Held seats, countdown, test payment | signed in |
| `/tickets` | Your bookings | signed in |
| `/tickets/:bookingId` | Printable ticket, cancel and refund | signed in (owner) |
| `/waitlist` | Your waitlist entries | signed in |
| `/login`, `/register` | Account | public |
| `/manage` | Create and edit your events, shows, passes and cover images | event creators only |

### PostgreSQL (optional)

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/seatlock"
pip install -r requirements.txt   # includes psycopg2-binary
python seed.py
python app.py
```

### Environment variables

Backend settings are read from the environment, or from `.env` in the project
root (real environment variables win). Copy `.env.example` to get started.

| Variable | Default | Meaning |
|---|---|---|
| `SEATLOCK_SECRET_KEY` | `dev-secret-change-me` | Flask secret. Set a long random value outside local dev. |
| `SEATLOCK_JWT_SECRET` | same as secret key | Signs login tokens |
| `SEATLOCK_JWT_EXPIRY_HOURS` | `24` | Login token lifetime |
| `DATABASE_URL` | `sqlite:///seatlock.db` | SQLAlchemy URL (PostgreSQL override) |
| `SEATLOCK_HOLD_MINUTES` | `10` | Seat-hold duration (`SEATLOCK_HOLD_SECONDS` for tests) |
| `SEATLOCK_MAX_SEATS_PER_HOLD` | `8` | Most seats one hold request may include |
| `SEATLOCK_CLEANUP_SECONDS` | `30` | Background hold-cleanup interval |
| `HOST`, `PORT` | `127.0.0.1`, `5000` | Where `python app.py` listens |
| `FLASK_DEBUG` | `false` | Flask debug mode |
| `FRONTEND_DIST` | `frontend/dist` | Built frontend that Flask serves |
| `CORS_ORIGINS` | empty | Comma-separated origins allowed to call `/api` cross-origin |

Generate a secret with `python -c "import secrets; print(secrets.token_hex(32))"`.

Frontend settings live in `frontend/.env` (only `VITE_*` names reach the browser):

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_URL` | `/api` | API base URL. Use a full URL if the API is on another origin (and set `CORS_ORIGINS`). |
| `VITE_PROXY_TARGET` | `http://127.0.0.1:5000` | Dev server proxy target for `/api` |
| `VITE_APP_NAME` | `SeatLock` | Name in the header and page titles |
| `VITE_SHOW_DEMO_LOGIN` | `true` | Shows "fill demo account" shortcuts on the sign-in page. Set to `false` in production. |

Both `.env` files are git-ignored. Never commit real secrets.

## Seeded demo data

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Event creator | `admin@seatlock.local` | `Admin123!` |
| Demo user | `demo@seatlock.local` | `Demo123!` |

### Demo events (each with 2 shows, 100 seats per show)

| Event | Venue | Shows |
|---|---|---|
| Indie Music Night - Live in Kolkata | Nazrul Mancha, Kolkata | 2026-12-05 19:00, 2026-12-06 19:00 |
| Tech Summit 2026 - Build & Scale | Biswa Bangla Convention Centre, Kolkata | 2026-12-12 10:00, 2026-12-13 10:00 |

Seat layout per show: rows A–J × 10 seats.
Prices (INR): Premium (A–C) ₹799, Standard (D–H) ₹499, VIP (I–J) ₹1199.
So show 1 seats 1–10 are A1–A10 (Premium, ₹799), etc.

## How the booking flow works

1. `POST /api/auth/login` → get a JWT token.
2. `GET /api/events` → pick an event and a show id.
3. `GET /api/shows/<show_id>/seats?status=available` → pick seat ids.
4. `POST /api/shows/<show_id>/holds` with `{"seat_ids": [1, 2]}` → seats are
   held for 10 minutes. The hold response includes `expires_at`.
5. `POST /api/shows/<show_id>/bookings` with the same `seat_ids` and an
   `Idempotency-Key` header (or `idempotency_key` in the body) → the
   mock payment succeeds and seats become `booked`.
6. Re-sending step 5 with the same key returns the original booking
   with `"replayed": true` and does **not** create a second booking.
7. `POST /api/bookings/<id>/cancel` → seats are released, mock payment
   becomes `refunded`, and the earliest waitlist entry is notified.

Holds expire automatically: a background thread runs every
`SEATLOCK_CLEANUP_SECONDS`, and seat/hold/booking requests also expire
stale holds first, so an expired seat becomes `available` again.

## API reference

All responses are JSON. Authenticated requests use:

```
Authorization: Bearer <JWT>
```

Errors look like `{"error": "..."}` with HTTP 400 (validation),
401 (auth), 403 (forbidden / admin only), 404 (not found),
409 (conflict, e.g. seat already held/booked) or 429 (rate limit).

### Health

#### `GET /api/config`

Public settings for the UI: `{"hold_seconds": 600, "max_seats_per_hold": 8}`.

#### `GET /api/health`

Response:

```json
{"status": "ok", "service": "seatlock"}
```

### Auth

#### `POST /api/auth/register` — rate-limited (20/min/IP)

Request:

```bash
curl -X POST http://127.0.0.1:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Asha","email":"asha@example.com","password":"secret123"}'
```

Response `201`:

```json
{"user": {"id": 3, "name": "Asha", "email": "asha@example.com", "is_admin": false},
 "token": "<JWT>"}
```

Validation: name required, valid email, password ≥ 6 characters.
Duplicate email → `409`.

#### `POST /api/auth/login` — rate-limited (20/min/IP)

Request:

```bash
curl -X POST http://127.0.0.1:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@seatlock.local","password":"Demo123!"}'
```

Response `200`: same shape as register. Wrong credentials → `401`.

#### `GET /api/auth/me` — auth required

```bash
curl http://127.0.0.1:5000/api/auth/me -H "Authorization: Bearer <TOKEN>"
```

Response `200`: `{"user": {...}}`.

### Events, shows, seats (public)

#### `GET /api/events`

```bash
curl http://127.0.0.1:5000/api/events
```

Response `200`: `{"events": [{"id": 1, "title": "...", "venue": "...",
"category": "Music", "shows": [{"id": 1, "event_id": 1,
"start_time": "2026-12-05T19:00:00"}]}]}`

#### `GET /api/events/<event_id>`

Same as above, but for one event, with a `seat_summary`
(`total` / `available` / `held` / `booked`) per show.

#### `GET /api/shows/<show_id>`

Response `200`: `{"show": {"id": 1, "event_id": 1,
"event_title": "...", "start_time": "2026-12-05T19:00:00",
"seat_summary": {"total": 100, "available": 100, "held": 0, "booked": 0}}}`

#### `GET /api/shows/<show_id>/seats?status=available|held|booked`

```bash
curl "http://127.0.0.1:5000/api/shows/1/seats?status=available"
```

Response `200`: `{"show_id": 1, "seats": [{"id": 1, "show_id": 1,
"row": "A", "seat_number": 1, "label": "A1", "category": "Premium",
"price": 799, "status": "available"}]}`. Omit `status` for all seats.

### Holds and bookings (auth required, rate-limited 30/min/IP)

#### `POST /api/shows/<show_id>/holds`

```bash
curl -X POST http://127.0.0.1:5000/api/shows/1/holds \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"seat_ids": [1, 2]}'
```

Response `201`:

```json
{"holds": [{"id": 1, "user_id": 2, "show_id": 1, "seat_id": 1,
            "status": "active", "expires_at": "2026-10-24T15:36:15"}],
 "expires_in_seconds": 600}
```

Seat not available → `409`. More than `SEATLOCK_MAX_SEATS_PER_HOLD` seats → `400`.
Hold objects include `expires_at` (UTC, with offset) and `seconds_left`.
Bookings and waitlist entries include a `show` summary (event title, venue, start time).

#### `DELETE /api/shows/<show_id>/holds`

Releases all of the caller's active holds on that show. Response:
`{"released": 2}`. The earliest waitlist entry is notified.

#### `GET /api/holds/me?show_id=<id>` — auth required

The caller's active holds grouped by show, each hold with its seat, plus
`seconds_left` and `total`. The checkout page uses this so a refresh does not
lose the countdown.

#### `POST /api/shows/<show_id>/bookings`

```bash
curl -X POST http://127.0.0.1:5000/api/shows/1/bookings \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -H "Idempotency-Key: pay-demo-1" \
  -d '{"seat_ids": [1, 2]}'
```

Response `201` (new booking) or `200` with `"replayed": true`
(same user + same key sent again):

```json
{"booking": {"id": 1, "user_id": 2, "show_id": 1, "status": "confirmed",
             "total": 1598, "idempotency_key": "pay-demo-1",
             "seats": [{"seat_id": 1, "label": "A1", "price": 799},
                       {"seat_id": 2, "label": "A2", "price": 799}],
             "payment": {"id": 1, "booking_id": 1, "amount": 1598,
                         "status": "succeeded", "provider": "mock"}},
 "replayed": false}
```

Booking a seat you do not hold, or that is already booked → `409`.
The `Idempotency-Key` header wins; `idempotency_key` in the body is
the fallback. Keys are unique per user.

#### `GET /api/bookings/me` — auth required

```bash
curl http://127.0.0.1:5000/api/bookings/me -H "Authorization: Bearer <TOKEN>"
```

Response `200`: `{"bookings": [<booking objects, newest first>]}`.

#### `GET /api/bookings/<booking_id>` — owner or admin only

Response `200`: `{"booking": {...}}`. Other users → `403`.

#### `POST /api/bookings/<booking_id>/cancel` — owner or admin, rate-limited

```bash
curl -X POST http://127.0.0.1:5000/api/bookings/1/cancel \
  -H "Authorization: Bearer <TOKEN>"
```

Response `200`: booking with `"status": "cancelled"` and payment
`"status": "refunded"`. Seats return to `available`, and the earliest
waiting waitlist entry for that show becomes `notified`.
Cancelling an already-cancelled booking → `400`.

### Waitlist (auth required)

#### `POST /api/shows/<show_id>/waitlist`

```bash
curl -X POST http://127.0.0.1:5000/api/shows/1/waitlist \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"seats_requested": 2}'
```

Response `201`: `{"waitlist_entry": {"id": 1, "user_id": 2, "show_id": 1,
"seats_requested": 2, "status": "waiting"}}`. Joining a show you are already waiting for → `409`.

#### `GET /api/waitlist/me`

Response `200`: `{"waitlist": [...]}`.

#### `DELETE /api/waitlist/<entry_id>` — owner only

Response `200`: entry with `"status": "cancelled"`.

### Admin (admin token only)

#### `POST /api/admin/events`

```bash
curl -X POST http://127.0.0.1:5000/api/admin/events \
  -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"title":"Comedy Night","venue":"Academy of Fine Arts, Kolkata","category":"Comedy"}'
```

Response `201`: `{"event": {...}}`. Non-admin → `403`.

#### `POST /api/admin/events/<event_id>/shows`

```bash
curl -X POST http://127.0.0.1:5000/api/admin/events/1/shows \
  -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"start_time":"2027-01-15T19:00:00",
       "seat_layout":{"rows":["A","B"],"seats_per_row":10,
                      "prices":{"Premium":799,"Standard":499,"VIP":1199}}}'
```

Response `201`: `{"show": {...with seat_summary...}, "seats_created": 20}`.
Omit `seat_layout` for the default A–J × 10 layout. Bad
`start_time` → `400`.

## Postman collection

Import `postman_collection.json` into Postman. Set `base_url` to
`http://127.0.0.1:5000` and `token` to the JWT from the login request.
It covers health, register, login, events, seats, hold, booking,
my bookings, cancel and waitlist.

## Tests

```bash
cd seatlock
source .venv/bin/activate   # after installing requirements
python -m pytest -q
```

Tests cover, at minimum:

- register / login / list events
- seat hold (held seats leave the available list)
- double-booking prevention (second user hold and booking both fail)
- hold expiry (a past-due hold releases the seat)
- idempotent payment/booking (same key replay returns the original booking)
- cancel and re-book (seat freed, payment refunded, seat re-bookable)
- waitlist and admin event/show creation

## Project layout

```
seatlock/
  app.py              # Flask factory, SPA serving, cleanup thread, entry point
  config.py           # Env-driven settings (loads .env)
  models.py           # User, Event, Show, Seat, SeatHold, Booking,
                      #   BookingSeat, Payment, WaitlistEntry
  services.py         # Hold expiry, hold/release/booking/cancel logic, seat generation
  routes.py           # API routes, validation, error responses
  auth.py             # JWT, password hashing, in-memory rate limiter
  seed.py             # Demo accounts/events/shows/seats (also a CLI)
  tests/test_seatlock.py
  postman_collection.json
  requirements.txt
  .env.example        # backend settings template
  frontend/
    index.html, vite.config.js, .env.example
    src/
      main.jsx, App.jsx        # providers and route table
      styles.css               # design tokens and all styles
      lib/                     # api client, formatting, hooks
      context/                 # auth and toast providers
      components/              # Layout, SeatMap, Countdown, RequireAuth, Ui
      pages/                   # one file per route
```

## Design notes for interviews

- **Why holds, not direct booking?** A hold gives the user time to pay
  without blocking others forever, and expiry returns the seat.
- **Why a transaction + lock?** Hold/confirm/cancel check seat status
  and update it in one transaction under a lock, so two concurrent
  requests cannot both see a seat as available.
- **Why idempotency keys?** Network retries are normal. The key
  (unique per user, enforced in the DB) makes a retry return the
  original booking instead of charging twice.
- **Why mock payment?** No gateway account is needed to demonstrate
  the booking/payment flow; the `Payment` row still models amount,
  status and refund.

## Limitations (honest)

- **Mock payment only.** No real payment gateway, no real refunds.
- **Single-process concurrency.** The lock in `services.py` plus DB
  transactions prevent double-booking in one server process (the
  default Flask dev server and the test suite). For a multi-worker
  PostgreSQL deployment, use `SELECT ... FOR UPDATE` on seat rows or
  a Postgres advisory lock instead of the in-process lock.
- **Waitlist is notification-only.** A notified user is not
  auto-booked; auto-booking would need their payment consent.
- **SQLite default.** SQLite serialises writers, which helps the
  double-booking guarantee here but is not a production choice for
  high write concurrency — use `DATABASE_URL` for PostgreSQL.
- **Dev server only.** `python app.py` uses Flask's development
  server. For production, run behind Gunicorn/Waitress with a real
  secret key and HTTPS.
- **No email/SMS sending.** Confirmation notifications are modelled
  (waitlist `notified`) but not actually sent.
```



## Roles

| Role | Can do |
|---|---|
| Customer | Browse events, hold seats, pay, see tickets (QR), join waitlists |
| Event creator | Create events and shows, upload a cover image, name their own passes and prices, edit or delete their own events and shows (only if nothing is booked). Cannot book seats. |

Pick the role when registering (`role`: `customer` or `creator`). Each event is owned by its creator;
creators only see and change their own. Uploaded images are stored in `instance/uploads/`.
Older databases are upgraded automatically on start (adds `events.image_url` and `events.creator_id`).
