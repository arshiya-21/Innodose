-- Align the first inoculants with the plant's reference table (application, size range, specific gravity).
-- Content (%) is kept as stored.
UPDATE inoculants SET application = 'Gray & Ductile Iron', size_mm = '0.2 – 0.7', specific_gravity = 3.00 WHERE name = 'FeSi 75';
UPDATE inoculants SET application = 'Gray & Ductile Iron', size_mm = '0.2 – 0.7', specific_gravity = 2.90 WHERE name = 'FeSi–Ca';
UPDATE inoculants SET application = 'Gray & Ductile Iron', size_mm = '0.3 – 0.7', specific_gravity = 3.20 WHERE name = 'FeSi–Ba';
UPDATE inoculants SET application = 'Gray Iron',            size_mm = '0.2 – 0.7', specific_gravity = 3.00 WHERE name = 'FeSi–Sr';
