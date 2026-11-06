-- Components master. Numeric auto-increment id as requested.
DROP TABLE IF EXISTS components;
CREATE TABLE components (
  id                  INT           NOT NULL AUTO_INCREMENT,
  component_id        VARCHAR(20)   NOT NULL,
  name                VARCHAR(255)  NOT NULL,
  pouring_temp_min_c  SMALLINT      NOT NULL,
  pouring_temp_max_c  SMALLINT      NOT NULL,
  pouring_time_sec    SMALLINT      NOT NULL,
  flow_rate_gms_sec   DECIMAL(5,2)  NOT NULL,
  expected_dosage_gms SMALLINT      NOT NULL,
  grade               VARCHAR(20)   NOT NULL,
  bunch_weight_kg     SMALLINT      NOT NULL,
  active              BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_components_cid (component_id)
) ENGINE=InnoDB AUTO_INCREMENT=1;

INSERT INTO components
  (component_id, name, pouring_temp_min_c, pouring_temp_max_c, pouring_time_sec,
   flow_rate_gms_sec, expected_dosage_gms, grade, bunch_weight_kg)
VALUES
  ('C-100', 'C.I. ADAPTER 2" TOP',           1400, 1440, 20, 4.00,  80, 'FG220',    50),
  ('C-101', 'C.I. ADAPTER 1.5" BOTTOM',      1420, 1460, 22, 6.00, 132, 'FG400',    40),
  ('C-102', 'C.I. FLANGE 4" DN100',          1390, 1420, 18, 3.50,  70, 'FG200',    35),
  ('C-103', 'C.I. FLANGE 6" DN150',          1390, 1420, 25, 4.20,  95, 'FG200',    55),
  ('C-104', 'C.I. PUMP HOUSING 25 HP',       1410, 1450, 32, 5.00, 150, 'FG260',    85),
  ('C-105', 'C.I. PUMP IMPELLER 80 MM',      1400, 1430, 15, 3.00,  55, 'FG220',    22),
  ('C-106', 'C.I. VALVE BODY DN80',          1395, 1425, 20, 3.80,  75, 'FG250',    42),
  ('C-107', 'C.I. BRAKE DRUM 9"',            1380, 1410, 28, 4.50, 120, 'FG250',    68),
  ('C-108', 'C.I. BRAKE DISC 10"',           1380, 1410, 24, 4.20, 100, 'FG250',    52),
  ('C-109', 'C.I. CYLINDER BLOCK 4-CYL',     1430, 1470, 45, 6.50, 210, 'FG300',   118),
  ('C-110', 'C.I. CYLINDER HEAD 4-CYL',      1430, 1470, 38, 6.00, 180, 'FG300',    95),
  ('C-111', 'C.I. FLYWHEEL 14"',             1395, 1425, 35, 5.20, 165, 'FG260',    88),
  ('C-112', 'C.I. PULLEY 150 MM 2-GROOVE',   1390, 1420, 18, 3.20,  65, 'FG220',    28),
  ('C-113', 'C.I. GEAR BLANK 200 MM',        1400, 1430, 22, 4.00,  85, 'FG260',    45),
  ('C-114', 'C.I. BEARING HOUSING SN 509',   1395, 1425, 20, 3.80,  72, 'FG250',    38),
  ('C-115', 'C.I. MANHOLE COVER 600 MM',     1370, 1400, 30, 4.50, 110, 'FG200',    72),
  ('C-116', 'C.I. BRACKET MOTOR MOUNT',      1390, 1420, 16, 2.80,  50, 'FG200',    18),
  ('C-117', 'S.G. CRANKSHAFT 4-CYL',         1450, 1480, 40, 7.00, 195, 'SG500/7', 105),
  ('C-118', 'S.G. HUB FRONT AXLE',           1440, 1470, 26, 5.50, 130, 'SG500/7',  62),
  ('C-119', 'S.G. GEAR CASE',                1450, 1480, 34, 6.20, 170, 'SG600/3',  92),
  ('C-120', 'S.G. DIFFERENTIAL HOUSING',     1450, 1480, 38, 6.80, 185, 'SG500/7',  98),
  ('C-121', 'S.G. STEERING KNUCKLE',         1445, 1475, 24, 5.00, 115, 'SG500/7',  48),
  ('C-122', 'S.G. CONTROL ARM',              1445, 1475, 22, 4.80, 105, 'SG400/15', 42);
