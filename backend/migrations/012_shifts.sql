-- Plant shifts (Administration -> Customer Info -> Add Shift).
-- `name` is free text (A/B/C, 1/2/3, ...). Times are HH:MM:SS; start > end means the shift runs past midnight.
CREATE TABLE IF NOT EXISTS shifts (
  id          INT          NOT NULL AUTO_INCREMENT,
  name        VARCHAR(50)  NOT NULL,
  start_time  TIME         NOT NULL,
  end_time    TIME         NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shifts_name (name)
) ENGINE=InnoDB;
