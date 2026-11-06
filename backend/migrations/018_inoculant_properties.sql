-- Inoculant master: the "category" column holds the Type of inoculant (one of 8 fixed types; moved to its own table
-- in 019), plus specific gravity (g/cm3) and content (%). Size stays in size_mm.
ALTER TABLE inoculants
  ADD COLUMN specific_gravity DECIMAL(5,2) NULL AFTER size_mm,
  ADD COLUMN content_pct      DECIMAL(5,2) NULL AFTER specific_gravity;

UPDATE inoculants SET category = 'Calcium based inoculants',            specific_gravity = 2.90, content_pct = 73.00 WHERE name = 'FeSi–Ca';
UPDATE inoculants SET category = 'Barium based inoculants',             specific_gravity = 3.10, content_pct = 72.00 WHERE name = 'FeSi–Ba';
UPDATE inoculants SET category = 'Zirconium based inoculants',          specific_gravity = 3.10, content_pct = 70.00 WHERE name = 'FeSi–Zr';
UPDATE inoculants SET category = 'Strontium based inoculants',          specific_gravity = 2.90, content_pct = 74.00 WHERE name = 'FeSi–Sr';
UPDATE inoculants SET category = 'Multi element/ Specialty inoculants', specific_gravity = 3.20, content_pct = 68.00 WHERE name = 'FeSi–Ca–Ba–Zr';
UPDATE inoculants SET category = 'Multi element/ Specialty inoculants', specific_gravity = 3.20, content_pct = 90.00 WHERE name = 'SiC Preconditioner';
UPDATE inoculants SET category = 'Rare earth inoculants',               specific_gravity = 3.30, content_pct = 70.00 WHERE name = 'FeSi–Ce';
UPDATE inoculants SET category = 'Rare earth inoculants',               specific_gravity = 3.40, content_pct = 68.00 WHERE name = 'FeSi–RE';
UPDATE inoculants SET category = 'Ferro Silicon inoculants',            specific_gravity = 2.80, content_pct = 75.00 WHERE name = 'FeSi–Al';
UPDATE inoculants SET category = 'Aluminum Calcium Silicon inoculants', specific_gravity = 2.80, content_pct = 72.00 WHERE name = 'FeSi–Ca–Al';
UPDATE inoculants SET category = 'Zirconium based inoculants',          specific_gravity = 3.00, content_pct = 71.00 WHERE name = 'FeSi–Mn–Zr';
UPDATE inoculants SET category = 'Multi element/ Specialty inoculants', specific_gravity = 2.20, content_pct = 98.00 WHERE name = 'Graphite Inoculant';
UPDATE inoculants SET category = 'Multi element/ Specialty inoculants', specific_gravity = 2.90, content_pct = 45.00 WHERE name = 'Mg–FeSi Nodulizer';
UPDATE inoculants SET category = 'Multi element/ Specialty inoculants', specific_gravity = 3.50, content_pct = 60.00 WHERE name = 'Bi–Sulphide Blend';

INSERT IGNORE INTO inoculants (name, category, application, inoculation_type, size_mm, specific_gravity, content_pct) VALUES
  ('FeSi 75',  'Ferro Silicon inoculants', 'Gray Iron', 'Ladle', '0.2 – 0.7', 2.80, 75.00);
