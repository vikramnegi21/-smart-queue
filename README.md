# CarePoint: Smart Hospital Queue Management System

Patients in a hospital usually do not know which token is being served, how many people are ahead of
them, or how long they will wait. CarePoint lets a patient book a token from a phone, watch the queue
move live, and get a reminder when their turn is close. Doctors run their own queue, and a hospital
administrator manages doctor accounts and sees analytics.

Built for a DBMS course: the data model, constraints, triggers, views, transactions and SQL are the core
of the project (see "DBMS content" below).
# 🏥 CarePoint - Smart Hospital Queue Management System

![Live Demo](https://img.shields.io/badge/Status-Live-brightgreen)
[![Live App](https://img.shields.io/badge/Live--Demo-Click%20Here-blue?style=for-the-badge&logo=render)](https://smart-queue-zjez.onrender.com)

> 🔗 **Live URL:** [https://smart-queue-zjez.onrender.com](https://smart-queue-zjez.onrender.com)

## Run it

Requires **Node.js 22.13 or newer** (`node -v`). No compiler, no database server and no Redis needed.

```bash
cd backend
npm install
npm start
```



| Command              | What it does                                                          |
|----------------------|-----------------------------------------------------------------------|
| `npm start`          | Starts the server. The database file `carepoint.db` is created on first run. |
| `npm run demo-data`  | Optional. Adds 31 sample patients so dashboards and queues are not empty. |
| `npm run reset`      | Deletes the database (stop the server first). Next start is a clean seed. |
| `npm test`           | Runs 56 end-to-end API checks on a temporary database.                |

Redis is optional. If it is running on port 6379 the "now serving" number is cached in it; if not,
the app reads from the database and works the same.

## Accounts

| Role            | Sign in with                | Password     |
|-----------------|-----------------------------|--------------|
| Patient         | any 10-digit mobile number  | one-time code shown on the page (demo mode) |
| Doctor          | `sharma` `mehta` `rao` `verma` `bisht` `joshi` | user ID + `123`, for example `sharma123` |
| Administrator   | `admin`                     | `admin123`   |

There is one sign-in box for everyone. The server decides from what you type whether it is a
patient (mobile number), a doctor or an administrator.

## Five-minute demo

1. **Patient.** Sign in with a mobile number, enter the code shown, then choose hospital, department and
   doctor, fill the details and get a token. Try the search box and the EN / हिंदी switch.
2. **Doctor.** In another browser window sign in as the same doctor (the token screen shows the name).
   The waiting list shows the patient's name, age, reason for visit and visit type. Press *Call next patient*.
3. Back on the patient screen the status changes to "It is your turn" without a refresh.
4. Press *Complete and call next*. The patient screen becomes a thank-you page with a rating form.
5. **Administrator.** Sign in as `admin`: totals, tokens by hour, per-hospital and per-doctor figures,
   average rating. Add a doctor; that doctor can sign in immediately.
6. Open `/display.html`: the waiting-room board that a hospital would show on a TV.

## DBMS content

| Concept | Where |
|---|---|
| ER diagram | `docs/ER_diagram.svg` (open in a browser) or `docs/ER_diagram.png` for the report |
| Schema (DDL) | `backend/sql/schema.sql` |
| Normalisation to 3NF | Departments are their own table; which department a hospital offers is the many-to-many table `hospital_departments`; doctors reference it with a **composite foreign key**, so a doctor can never belong to a department the hospital does not offer. |
| Keys and constraints | Primary keys, foreign keys, `UNIQUE`, `NOT NULL`, `DEFAULT`, `CHECK` (status values, age range, rating 1 to 5, valid mobile length). |
| Integrity rule enforced by the database | `ux_one_live_token_per_patient`: a *partial unique index* so a patient cannot hold two waiting/in-progress tokens, whatever the application does. |
| Daily numbering | `UNIQUE (doctor_id, token_date, token_no)`: numbers restart each day and are never duplicated. |
| Index | `ix_tokens_queue` on `(doctor_id, token_date, status, token_no)` serves the "next waiting token" query. |
| Triggers | `trg_no_show_count` (counts missed appointments and blocks a patient after three), `trg_token_called` and `trg_token_finished` (timestamps used for consultation-time analytics). |
| View | `v_doctor_board` powers the waiting-room display. |
| Transactions | `createToken` computes the next number and inserts in one `BEGIN IMMEDIATE` transaction, so two patients booking together cannot get the same number. `callNext` finishes one patient and calls the next in one transaction. |
| Queries | `docs/queries.sql`: 13 queries (joins, GROUP BY / HAVING, subquery, window function, LEFT JOIN, `EXPLAIN QUERY PLAN`) plus integrity demos. All 13 run against the generated database. |
| No redundancy | "Now serving" is *derived* from the tokens table, not stored as a second copy that could drift. |
| NoSQL | Redis stores the cached "now serving" number (key-value, cache-aside). It is cleared on server start because the database is the source of truth. |
| One data layer | Every SQL statement lives in `backend/db.js`. |

### Queue logic

- Token numbers restart every day for each doctor.
- **Now serving** = the highest token already called today.
- **People ahead** = waiting tokens with a smaller number. With no cancellations or no-shows this equals
  `token_no - now_serving - 1`.
- **Estimated wait** = people ahead x the doctor's average minutes per patient.
- Tokens left from a previous day are closed automatically so they cannot block a patient.

## Security notes

- Doctors and administrators sign in with bcrypt-hashed passwords. Doctor actions take no doctor ID from
  the browser: the server uses the signed-in session, so one doctor cannot touch another doctor's queue.
- Only the administrator can create doctor accounts. Nobody can self-register as a doctor.
- A patient can read only their own token. Booking, cancelling and feedback all check the session.
- OTP and password attempts are rate limited; text from patients is escaped before it is shown to doctors.
- Set `SESSION_SECRET` before any real deployment.

## Not included, and why

- **SMS.** There is no SMS gateway. In demo mode the code is shown on the page; start with `DEMO_OTP=off`
  to hide it (then you need to connect a gateway such as MSG91 or Twilio).
- **Google Maps and travel time.** Needs your own Google Cloud API key.
- **Machine-learning wait prediction.** Needs real consultation data; the app now records
  `called_at` / `completed_at`, which is the data such a model would train on.
- Sessions are kept in memory, so everyone is signed out when the server restarts.

## Questions a teacher may ask

- *Is this normalised?* Yes, 3NF. The one deliberate repeat is name/age/gender on `tokens`: a relative
  may book for someone else, so the details belong to the visit, not the account.
- *What happens if two patients book at the same moment?* The number is computed inside the insert
  transaction and `UNIQUE (doctor_id, token_date, token_no)` rejects any duplicate.
- *How is the one-token-per-patient rule enforced?* By a partial unique index in the database, not only in code.
- *Why Redis if you already have a database?* "Now serving" is read by every patient screen every few
  seconds; the cache removes that load. The app still works without it.
- *Where is the formula?* `docs/queries.sql` Q3 and Q4.

## Project structure

```
backend/
  server.js            routes, sessions, realtime (Socket.io)
  db.js                all SQL and transactions
  cache.js             Redis cache-aside with database fallback
  sql/schema.sql       tables, constraints, index, triggers, view
  scripts/             demo-data.js, reset.js
  test/smoke.js        end-to-end API test
  public/              index (sign in), patient, doctor, admin, display pages
docs/
  ER_diagram.svg
  queries.sql
```
