-- CarePoint: Smart Hospital Queue System
-- Relational schema (SQLite). Normalised to 3NF.
-- Loaded automatically by db.js on first run.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- reference data
CREATE TABLE IF NOT EXISTS hospitals (
  hospital_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL UNIQUE,
  distance_km  REAL    NOT NULL CHECK (distance_km >= 0),
  rating       REAL    CHECK (rating BETWEEN 0 AND 5)
);

CREATE TABLE IF NOT EXISTS departments (
  department_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE
);

-- M:N between hospitals and departments (which department a hospital offers)
CREATE TABLE IF NOT EXISTS hospital_departments (
  hospital_id   INTEGER NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments(department_id),
  PRIMARY KEY (hospital_id, department_id)
);

-- ---------------------------------------------------------------- people
CREATE TABLE IF NOT EXISTS admins (
  admin_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

-- A doctor works in one hospital and one department. The composite foreign key
-- guarantees that department is actually offered by that hospital.
CREATE TABLE IF NOT EXISTS doctors (
  doctor_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id         INTEGER NOT NULL,
  department_id       INTEGER NOT NULL,
  name                TEXT    NOT NULL,
  username            TEXT    NOT NULL UNIQUE,
  password_hash       TEXT    NOT NULL,
  status              TEXT    NOT NULL DEFAULT 'available'
                      CHECK (status IN ('available', 'busy', 'leave')),
  avg_consult_minutes INTEGER NOT NULL DEFAULT 8 CHECK (avg_consult_minutes > 0),
  FOREIGN KEY (hospital_id, department_id)
    REFERENCES hospital_departments (hospital_id, department_id)
);

CREATE TABLE IF NOT EXISTS patients (
  patient_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  mobile         TEXT    NOT NULL UNIQUE CHECK (length(mobile) = 10),
  no_show_count  INTEGER NOT NULL DEFAULT 0,
  is_blocked     INTEGER NOT NULL DEFAULT 0 CHECK (is_blocked IN (0, 1)),
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS otps (
  mobile      TEXT    PRIMARY KEY,
  code        TEXT    NOT NULL,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------- queue
-- One row per visit. Name/age/gender are stored per visit on purpose: the
-- person booking may be a relative, and the doctor needs what was entered then.
CREATE TABLE IF NOT EXISTS tokens (
  token_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  token_no      INTEGER NOT NULL CHECK (token_no > 0),
  token_date    TEXT    NOT NULL,                       -- YYYY-MM-DD, numbering restarts daily
  patient_id    INTEGER NOT NULL REFERENCES patients(patient_id),
  doctor_id     INTEGER NOT NULL REFERENCES doctors(doctor_id),
  patient_name  TEXT    NOT NULL,
  age           INTEGER NOT NULL CHECK (age BETWEEN 0 AND 120),
  gender        TEXT    NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
  reason        TEXT,
  visit_type    TEXT    NOT NULL DEFAULT 'New patient'
                CHECK (visit_type IN ('New patient', 'Follow-up')),
  status        TEXT    NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting', 'in_progress', 'completed', 'no_show', 'cancelled')),
  created_at    INTEGER NOT NULL,
  called_at     INTEGER,
  completed_at  INTEGER,
  UNIQUE (doctor_id, token_date, token_no)              -- no duplicate numbers for a doctor on a day
);

-- Anti-spam enforced by the database itself: a patient can hold only one live token.
CREATE UNIQUE INDEX IF NOT EXISTS ux_one_live_token_per_patient
  ON tokens (patient_id) WHERE status IN ('waiting', 'in_progress');

-- Serves the hot queries: "who is waiting for this doctor today, in order".
CREATE INDEX IF NOT EXISTS ix_tokens_queue
  ON tokens (doctor_id, token_date, status, token_no);

CREATE TABLE IF NOT EXISTS feedback (
  token_id    INTEGER PRIMARY KEY REFERENCES tokens(token_id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  INTEGER NOT NULL
);

-- ---------------------------------------------------------------- triggers
-- Count no-shows and block a patient after three.
CREATE TRIGGER IF NOT EXISTS trg_no_show_count
AFTER UPDATE OF status ON tokens
WHEN NEW.status = 'no_show' AND OLD.status <> 'no_show'
BEGIN
  UPDATE patients
     SET no_show_count = no_show_count + 1,
         is_blocked    = CASE WHEN no_show_count + 1 >= 3 THEN 1 ELSE is_blocked END
   WHERE patient_id = NEW.patient_id;
END;

-- Timestamp when a token is called / finished (used for consultation-time analytics).
CREATE TRIGGER IF NOT EXISTS trg_token_called
AFTER UPDATE OF status ON tokens
WHEN NEW.status = 'in_progress' AND OLD.status <> 'in_progress'
BEGIN
  UPDATE tokens SET called_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
   WHERE token_id = NEW.token_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_token_finished
AFTER UPDATE OF status ON tokens
WHEN NEW.status IN ('completed', 'no_show') AND OLD.status = 'in_progress'
BEGIN
  UPDATE tokens SET completed_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
   WHERE token_id = NEW.token_id;
END;

-- ---------------------------------------------------------------- views
-- Live board: one row per doctor with today's waiting count.
CREATE VIEW IF NOT EXISTS v_doctor_board AS
SELECT d.doctor_id,
       d.name        AS doctor_name,
       dep.name      AS department,
       h.hospital_id,
       h.name        AS hospital_name,
       d.status,
       (SELECT COUNT(*) FROM tokens t
         WHERE t.doctor_id = d.doctor_id
           AND t.token_date = date('now', 'localtime')
           AND t.status = 'waiting') AS waiting
  FROM doctors d
  JOIN hospitals   h   ON h.hospital_id     = d.hospital_id
  JOIN departments dep ON dep.department_id = d.department_id;
