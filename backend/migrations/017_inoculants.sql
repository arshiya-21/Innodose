-- Inoculant master: the inoculants the plant uses, with how and in what grain size they are applied.
CREATE TABLE IF NOT EXISTS inoculants (
  id               INT           NOT NULL AUTO_INCREMENT,
  name             VARCHAR(100)  NOT NULL,
  category         VARCHAR(100)  NOT NULL,
  application      VARCHAR(100)  NOT NULL,
  inoculation_type VARCHAR(100)  NOT NULL,
  size_mm          VARCHAR(50)   NOT NULL,
  updated_at       TIMESTAMP     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  updated_by       VARCHAR(100)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inoculants_name (name)
) ENGINE=InnoDB;

INSERT IGNORE INTO inoculants (name, category, application, inoculation_type, size_mm) VALUES
  ('FeSi–Ca',             'FeSi-based',     'Gray Iron',    'Ladle',           '0.2 – 0.7'),
  ('FeSi–Ba',             'FeSi-based',     'Gray Iron',    'Stream',          '0.5 – 1.5'),
  ('FeSi–Zr',             'Preconditioner', 'Ductile Iron', 'Ladle',           '1 – 3'),
  ('FeSi–Sr',             'FeSi-based',     'Gray Iron',    'Late Stream',     '0.2 – 0.7'),
  ('FeSi–Ca–Ba–Zr',       'Complex FeSi',   'Ductile Iron', 'In-Mold',         '0.2 – 0.6'),
  ('SiC Preconditioner',  'Preconditioner', 'Gray Iron',    'Furnace / Ladle', '3 – 10'),
  ('FeSi–Ce', 'FeSi-based', 'Gray Iron', 'Ladle', '0.2 – 0.7'),
  ('FeSi–RE', 'FeSi-based', 'Ductile Iron', 'Stream', '0.5 – 1.5'),
  ('FeSi–Al', 'FeSi-based', 'Gray Iron', 'Ladle', '1 – 3'),
  ('FeSi–Ca–Al', 'Complex FeSi', 'Gray Iron', 'Stream', '0.2 – 0.7'),
  ('FeSi–Mn–Zr', 'Complex FeSi', 'Gray Iron', 'In-Mold', '0.2 – 0.6'),
  ('Graphite Inoculant', 'Carbon-based', 'Gray Iron', 'Ladle', '0.5 – 2'),
  ('Mg–FeSi Nodulizer', 'Nodulizer', 'Ductile Iron', 'Sandwich', '5 – 25'),
  ('Bi–Sulphide Blend', 'Specialty', 'Ductile Iron', 'Late Stream', '0.2 – 0.5');
