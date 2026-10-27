-- CarePoint: example SQL, one query per DBMS idea.
-- Run them against backend/carepoint.db, for example with any SQLite viewer.
-- "today" below means date('now','localtime'), which matches token_date.

-- Q1  JOIN (3 tables): doctors with their department and hospital
SELECT d.name AS doctor, dep.name AS department, h.name AS hospital
  FROM doctors d
  JOIN departments dep ON dep.department_id = d.department_id
  JOIN hospitals   h   ON h.hospital_id     = d.hospital_id
 ORDER BY h.name, dep.name;

-- Q2  M:N relationship: departments offered by each hospital (GROUP BY + GROUP_CONCAT)
SELECT h.name AS hospital, GROUP_CONCAT(dep.name, ', ') AS departments
  FROM hospitals h
  JOIN hospital_departments hd ON hd.hospital_id = h.hospital_id
  JOIN departments dep         ON dep.department_id = hd.department_id
 GROUP BY h.hospital_id;

-- Q3  People ahead of a patient (the queue formula as SQL)
SELECT COUNT(*) AS people_ahead
  FROM tokens
 WHERE doctor_id = 1 AND token_date = date('now','localtime')
   AND status = 'waiting' AND token_no < 5;

-- Q4  "Now serving": the highest token already called today
SELECT COALESCE(MAX(token_no), 0) AS now_serving
  FROM tokens
 WHERE doctor_id = 1 AND token_date = date('now','localtime')
   AND status IN ('in_progress', 'completed', 'no_show');

-- Q5  Window function: position of every waiting patient in a doctor's queue
SELECT token_no, patient_name,
       ROW_NUMBER() OVER (ORDER BY token_no) AS position_in_queue
  FROM tokens
 WHERE doctor_id = 1 AND token_date = date('now','localtime') AND status = 'waiting';

-- Q6  Aggregates with LEFT JOIN: tokens per hospital today (hospitals with none still appear)
SELECT h.name AS hospital, COUNT(t.token_id) AS tokens_today
  FROM hospitals h
  LEFT JOIN doctors d ON d.hospital_id = h.hospital_id
  LEFT JOIN tokens  t ON t.doctor_id = d.doctor_id AND t.token_date = date('now','localtime')
 GROUP BY h.hospital_id
 ORDER BY tokens_today DESC;

-- Q7  HAVING: doctors who have seen more than 2 patients today
SELECT d.name, COUNT(*) AS seen
  FROM tokens t JOIN doctors d ON d.doctor_id = t.doctor_id
 WHERE t.token_date = date('now','localtime') AND t.status = 'completed'
 GROUP BY d.doctor_id
HAVING COUNT(*) > 2;

-- Q8  Subquery: patients who have given a rating below the overall average
SELECT t.patient_name, f.rating
  FROM feedback f JOIN tokens t ON t.token_id = f.token_id
 WHERE f.rating < (SELECT AVG(rating) FROM feedback);

-- Q9  Average consultation time per doctor (timestamps are filled in by triggers)
SELECT d.name, ROUND(AVG((t.completed_at - t.called_at) / 60000.0), 1) AS avg_minutes
  FROM tokens t JOIN doctors d ON d.doctor_id = t.doctor_id
 WHERE t.status = 'completed' AND t.called_at IS NOT NULL
 GROUP BY d.doctor_id;

-- Q10 Busiest hours today
SELECT strftime('%H:00', created_at / 1000, 'unixepoch', 'localtime') AS hour, COUNT(*) AS tokens
  FROM tokens WHERE token_date = date('now','localtime')
 GROUP BY hour ORDER BY tokens DESC;

-- Q11 View: the live board query is stored as a view
SELECT * FROM v_doctor_board;

-- Q12 Index: the queue lookup uses ix_tokens_queue (check with EXPLAIN QUERY PLAN)
EXPLAIN QUERY PLAN
SELECT token_no FROM tokens
 WHERE doctor_id = 1 AND token_date = date('now','localtime') AND status = 'waiting'
 ORDER BY token_no LIMIT 1;

-- Q13 Normalisation check: a department is stored once and referenced by id
SELECT dep.name, COUNT(*) AS doctors_in_department
  FROM doctors d JOIN departments dep ON dep.department_id = d.department_id
 GROUP BY dep.department_id;

-- ---------------------------------------------------------------- integrity demos
-- D1  Constraint: one live token per patient (partial unique index).
--     Run twice for the same patient and the second insert fails:
-- INSERT INTO tokens (token_no, token_date, patient_id, doctor_id, patient_name, age, gender, created_at)
-- VALUES (99, date('now','localtime'), 1, 1, 'Test', 30, 'Male', 0);

-- D2  Trigger: marking a token no_show increments the patient's counter and blocks at 3.
-- UPDATE tokens SET status = 'no_show' WHERE token_id = 1 AND status = 'in_progress';
-- SELECT patient_id, no_show_count, is_blocked FROM patients;

-- D3  Foreign key: a doctor cannot be placed in a department the hospital does not offer.
-- INSERT INTO doctors (hospital_id, department_id, name, username, password_hash)
-- VALUES (3, 1, 'Dr. Test', 'test', 'x');   -- hospital 3 has no Orthopedics: rejected

-- D4  Transaction: the next token number is computed and inserted atomically (see createToken in db.js).
-- BEGIN IMMEDIATE;
--   INSERT INTO tokens (token_no, ...) VALUES ((SELECT COALESCE(MAX(token_no),0)+1 FROM tokens WHERE doctor_id = 1 AND token_date = date('now','localtime')), ...);
-- COMMIT;
