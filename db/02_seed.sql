-- Reference / dummy data for the Inodose dashboard.
-- Run AFTER 01_schema.sql and AFTER 03_load_casting_csv.sql (or the Python loader).
-- mysql -u root -p innodose < 02_seed.sql

USE innodose;

-- ---------------------------------------------------------------------------
-- component_properties — three components the dashboard groups by.
-- ---------------------------------------------------------------------------
INSERT INTO component_properties
  (component_id, component_name, pattern_id, grade,
   bunch_weight, net_casting_weight, cavity_per_box, core_weight, sand_weight,
   Pouring_Time_Min, Pouring_Time_Max, Pouring_Temp_Min, Pouring_Temp_Max,
   CE_Min, CE_Max, C_Min, C_Max, Si_Min, Si_Max, Mg_Min, Mg_Max,
   created_by, modified_by, created_on, modified_on)
VALUES
  ('456', 'C.I. ADAPTER 2” TOP',      'PQR', 'FG220',
   50, 12.5, 4, 2.3, 32,
   18, 22, 1400, 1440,
   4.2, 4.5, 3.2, 3.6, 2.0, 2.4, 0.04, 0.06,
   'seed', 'seed', NOW(), NOW()),
  ('457', 'C.I. ADAPTER 1.5” BOTTOM', 'PQR', 'FG400',
   40, 9.8,  3, 1.8, 28,
   18, 22, 1420, 1460,
   4.2, 4.5, 3.2, 3.6, 2.0, 2.4, 0.04, 0.06,
   'seed', 'seed', NOW(), NOW()),
  ('458', 'Component 3',              'ABC', 'FG100',
   70, 18.2, 6, 3.1, 48,
   20, 25, 1350, 1370,
   4.0, 4.3, 3.1, 3.5, 2.1, 2.5, 0.03, 0.05,
   'seed', 'seed', NOW(), NOW());

-- ---------------------------------------------------------------------------
-- alert_users
-- ---------------------------------------------------------------------------
INSERT INTO alert_users (alert_name, email, enabled) VALUES
  ('Flow Rate',     'srinivas@mpminfosoft.com', 1),
  ('Flow Rate',     'supervisor@gujaratmetalcast.example', 1),
  ('Dosage Alert',  'srinivas@mpminfosoft.com', 1),
  ('Dosage Alert',  'ops@gujaratmetalcast.example', 1),
  ('Pipe Choked',   'maintenance@gujaratmetalcast.example', 1),
  ('Dose Missed',   'ops@gujaratmetalcast.example', 1);

-- ---------------------------------------------------------------------------
-- alert_tolerances — units/semantics mirror alert.py `check_all_alerts`
-- ---------------------------------------------------------------------------
INSERT INTO alert_tolerances (alert_type, min_tolerance, max_tolerance) VALUES
  ('Flow Rate',    2.0, 3.0),   -- gms/sec window
  ('Dosage Alert', -3,  3),     -- % deviation window
  ('Pipe Choked',  80,  100),   -- % of expected (trigger if below min)
  ('Dose Missed',  50,  100);   -- % of expected (trigger if below min)

-- ---------------------------------------------------------------------------
-- plc_update_log — a few audit rows
-- ---------------------------------------------------------------------------
INSERT INTO plc_update_log (updated_on, component_id, content_of_inoculant, pouring_time, gms_per_second) VALUES
  (NOW() - INTERVAL 2 DAY, '456', 0.16, 20, 4.0),
  (NOW() - INTERVAL 1 DAY, '457', 0.18, 22, 4.5),
  (NOW(),                  '458', 0.14, 21, 3.8);

-- ---------------------------------------------------------------------------
-- dosage_calculations — a handful matching the live dashboard pattern.
-- (Volume rows come from the CSV via 03_load_casting_csv.sql.)
-- ---------------------------------------------------------------------------
INSERT INTO dosage_calculations (`datetime`, dosage_value, upper_tolerance1, lower_tolerance1, COMPONENT_ID, BOX_COUNT) VALUES
  (NOW() - INTERVAL 10 MINUTE, 2.49, 3.0, 2.0, '456', 30),
  (NOW() - INTERVAL  9 MINUTE, 2.52, 3.0, 2.0, '456', 31),
  (NOW() - INTERVAL  8 MINUTE, 2.48, 3.0, 2.0, '456', 32),
  (NOW() - INTERVAL  7 MINUTE, 3.15, 3.0, 2.0, '456', 33),  -- Flowrate High
  (NOW() - INTERVAL  6 MINUTE, 1.85, 3.0, 2.0, '457', 20),  -- Flowrate Low
  (NOW() - INTERVAL  5 MINUTE, 2.45, 3.0, 2.0, '457', 21),
  (NOW() - INTERVAL  4 MINUTE, 2.50, 3.0, 2.0, '458', 10),
  (NOW() - INTERVAL  3 MINUTE, 2.44, 3.0, 2.0, '458', 11),
  (NOW() - INTERVAL  2 MINUTE, 2.47, 3.0, 2.0, '458', 12),
  (NOW() - INTERVAL  1 MINUTE, 2.46, 3.0, 2.0, '458', 13);

-- ---------------------------------------------------------------------------
-- dosage_alerts — pre-generated examples for the Alerts tab
-- ---------------------------------------------------------------------------
INSERT INTO dosage_alerts (dosage_id, `datetime`, state, recipient_email, component_id, `value`, `Weight of Innoculant`, `Total Innoculant`, box_count) VALUES
  (NULL, NOW() - INTERVAL 7 MINUTE, 'Flowrate High', 'srinivas@mpminfosoft.com', '456', 3.15, NULL, NULL, 33),
  (NULL, NOW() - INTERVAL 6 MINUTE, 'Flowrate Low',  'srinivas@mpminfosoft.com', '457', 1.85, NULL, NULL, 20),
  (NULL, NOW() - INTERVAL 2 HOUR,   'Over Dose',     'ops@gujaratmetalcast.example', '456', NULL, 41, 46, 25),
  (NULL, NOW() - INTERVAL 3 HOUR,   'Under Dose',    'ops@gujaratmetalcast.example', '457', NULL, 41, 35, 18);

-- ---------------------------------------------------------------------------
-- modification_component_history — one example edit per component
-- ---------------------------------------------------------------------------
INSERT INTO modification_component_history (component_id, modified_by, modified_on, updated_fields) VALUES
  (1, 'admin', NOW() - INTERVAL 5 DAY, 'Pouring_Time_Min, Pouring_Time_Max'),
  (2, 'supervisor', NOW() - INTERVAL 2 DAY, 'bunch_weight'),
  (3, 'admin', NOW() - INTERVAL 1 DAY, 'Mg_Min, Mg_Max');
