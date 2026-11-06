-- Default plant shifts: A = 07:00-15:00, B = the rest of the day (15:00-07:00, runs past midnight).
-- INSERT IGNORE: `name` is unique, so re-running or an existing A/B is left untouched.
INSERT IGNORE INTO shifts (name, start_time, end_time) VALUES
  ('A', '07:00:00', '15:00:00'),
  ('B', '15:00:00', '07:00:00');
