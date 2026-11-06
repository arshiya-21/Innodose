-- Components master: the foundry pattern used to cast the component.
ALTER TABLE components ADD COLUMN pattern VARCHAR(50) NOT NULL DEFAULT '' AFTER grade;

-- dummy pattern numbers for the existing components: C-100 -> PTN-100, C-101 -> PTN-101, ...
UPDATE components SET pattern = CONCAT('PTN-', SUBSTRING(component_id, 3)) WHERE pattern = '';
