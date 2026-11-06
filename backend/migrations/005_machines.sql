-- Machines registry.
CREATE TABLE IF NOT EXISTS machines (
  id              INT           NOT NULL AUTO_INCREMENT,
  product_id      VARCHAR(50)   NOT NULL,
  name            VARCHAR(100)  NOT NULL,
  production_line VARCHAR(100)  NOT NULL,
  active          BOOLEAN       NOT NULL DEFAULT TRUE,
  date_added      DATE          NOT NULL DEFAULT (CURRENT_DATE),
  PRIMARY KEY (id),
  UNIQUE KEY uq_machines_product (product_id),
  UNIQUE KEY uq_machines_name (name)
) ENGINE=InnoDB AUTO_INCREMENT=1;

INSERT IGNORE INTO machines (product_id, name, production_line, date_added) VALUES
  ('12335', 'Inodose Machine 1', 'Production Line 1', '2026-08-15'),
  ('44511', 'Inodose Machine 2', 'Production Line 2', '2026-07-01'),
  ('37722', 'Inodose Machine 3', 'Production Line 3', '2026-07-15');
