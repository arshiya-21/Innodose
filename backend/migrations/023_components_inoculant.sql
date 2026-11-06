-- Components are linked to an inoculant from the Inoculant Master (shown in Past Records).
ALTER TABLE components
  ADD COLUMN inoculant_id INT NULL AFTER pattern,
  ADD CONSTRAINT fk_components_inoculant FOREIGN KEY (inoculant_id) REFERENCES inoculants (id) ON DELETE SET NULL;

-- dummy links for the existing components: spread across five common inoculants by component number
UPDATE components SET inoculant_id = (SELECT id FROM inoculants WHERE name = CASE (CAST(SUBSTRING(component_id, 3) AS UNSIGNED) MOD 5)
    WHEN 0 THEN 'FeSi–Ca'
    WHEN 1 THEN 'FeSi–Ba'
    WHEN 2 THEN 'FeSi 75'
    WHEN 3 THEN 'FeSi–Sr'
    ELSE 'FeSi–Zr' END)
WHERE inoculant_id IS NULL;
