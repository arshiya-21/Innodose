-- Per-machine runtime state: operating mode + applied setpoints.
-- Used by GET /dashboard and GET /machines/:id/control-panel.
CREATE TABLE IF NOT EXISTS machine_state (
  machine_id            INT          NOT NULL,
  mode                  ENUM('auto','manual','joystick') NOT NULL DEFAULT 'auto',
  applied_component_id  VARCHAR(20)  NULL,
  applied_pouring_time  SMALLINT     NULL,
  applied_flow_rate     DECIMAL(5,2) NULL,
  updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (machine_id),
  CONSTRAINT fk_machine_state_machine
    FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Seed one row per existing machine in 'auto' mode.
INSERT IGNORE INTO machine_state (machine_id, mode)
  SELECT id, 'auto' FROM machines;
