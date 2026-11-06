-- Inoculant types in their own table (fixed list of 8). inoculants.type_id points at one; the free-text
-- "category" column (which already holds exactly these type names) is converted and dropped.
CREATE TABLE IF NOT EXISTS inoculant_types (
  id         INT          NOT NULL AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inoculant_types_name (name)
) ENGINE=InnoDB;

INSERT IGNORE INTO inoculant_types (name, sort_order) VALUES
  ('Ferro Silicon inoculants', 1),
  ('Calcium based inoculants', 2),
  ('Barium based inoculants', 3),
  ('Strontium based inoculants', 4),
  ('Rare earth inoculants', 5),
  ('Zirconium based inoculants', 6),
  ('Aluminum Calcium Silicon inoculants', 7),
  ('Multi element/ Specialty inoculants', 8);

ALTER TABLE inoculants ADD COLUMN type_id INT NULL AFTER name;

UPDATE inoculants i JOIN inoculant_types t ON t.name = i.category SET i.type_id = t.id;
-- anything that did not match one of the 8 types falls back to the specialty type
UPDATE inoculants SET type_id = (SELECT id FROM inoculant_types WHERE name = 'Multi element/ Specialty inoculants') WHERE type_id IS NULL;

ALTER TABLE inoculants
  MODIFY COLUMN type_id INT NOT NULL,
  ADD CONSTRAINT fk_inoculants_type FOREIGN KEY (type_id) REFERENCES inoculant_types (id),
  DROP COLUMN category;
