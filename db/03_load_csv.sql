-- Load innodose_casting_details_today_4.csv into innodose_casting_details_v2.
-- Uses MySQL's secure uploads folder (no Python dependency).
--
-- Prerequisite: the CSV was copied to:
--   C:\ProgramData\MySQL\MySQL Server 8.0\Uploads\casting.csv
--
-- Handles CSV quirks:
--   - \N nulls (native LOAD DATA behaviour)
--   - \0-padded strings in HEAT NO / PATTERN ID / COMPONENT ID (REPLACE'd)
--   - DD-MM-YYYY HH:MM datetime (STR_TO_DATE)
--   - 3 trailing empty columns (captured into @dummy vars and ignored)

USE innodose;
TRUNCATE TABLE innodose_casting_details_v2;

LOAD DATA INFILE 'C:/ProgramData/MySQL/MySQL Server 8.0/Uploads/casting.csv'
INTO TABLE innodose_casting_details_v2
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(
  @id, @dt,
  @w_cast, @inoc_ct, @pour_t, @sg, @w_inoc, @flow_inoc, @step,
  @heat, @pattern, @comp,
  @box, @cum_box, @cum_dose, @load_pv, @load_m,
  @f1,@f2,@f3,@f4,@f5,@f6,@f7,@f8,@f9,@f10,
  @f11,@f12,@f13,@f14,@f15,@f16,@f17,@f18,@f19,@f20,
  @f21,@f22,@f23,@f24,@f25,@f26,@f27,@f28,@f29,@f30,
  @f31,@f32,@f33,@f34,@f35,@f36,@f37,@f38,@f39,@f40,
  @cd_dose, @cd_miss, @ld_dose, @ld_miss, @pour_timer,
  @dummy1, @dummy2, @dummy3
)
SET
  `id`                        = @id,
  `datetime`                  = STR_TO_DATE(@dt, '%d-%m-%Y %H:%i'),
  `WEIGHT OF CASTING`         = NULLIF(@w_cast, ''),
  `CONTENT OF INOCULANT`      = NULLIF(@inoc_ct, ''),
  `POURING TIME`              = NULLIF(@pour_t, ''),
  `SPECIFIC GRAVITY`          = NULLIF(@sg, ''),
  `WEIGHT OF INOCULANT`       = NULLIF(@w_inoc, ''),
  `FLOW OF INOCULANT`         = NULLIF(@flow_inoc, ''),
  `STEP SIZE`                 = NULLIF(@step, ''),
  `HEAT NO`                   = NULLIF(REPLACE(@heat,    '\0', ''), ''),
  `PATTERN ID`                = NULLIF(REPLACE(@pattern, '\0', ''), ''),
  `COMPONENT ID`              = NULLIF(REPLACE(@comp,    '\0', ''), ''),
  `BOX COUNT`                 = NULLIF(@box, ''),
  `CUMMULATIVE BOX COUNT`     = NULLIF(@cum_box, ''),
  `CUMMULATIVE DOSES`         = NULLIF(@cum_dose, ''),
  `LOAD PV`                   = NULLIF(@load_pv, ''),
  `LOAD MEASURED`             = NULLIF(@load_m, ''),
  `DOSAGE / SEC` = NULLIF(TRIM(BOTH ',' FROM CONCAT_WS(',',
     NULLIF(@f1,''),NULLIF(@f2,''),NULLIF(@f3,''),NULLIF(@f4,''),NULLIF(@f5,''),
     NULLIF(@f6,''),NULLIF(@f7,''),NULLIF(@f8,''),NULLIF(@f9,''),NULLIF(@f10,''),
     NULLIF(@f11,''),NULLIF(@f12,''),NULLIF(@f13,''),NULLIF(@f14,''),NULLIF(@f15,''),
     NULLIF(@f16,''),NULLIF(@f17,''),NULLIF(@f18,''),NULLIF(@f19,''),NULLIF(@f20,''),
     NULLIF(@f21,''),NULLIF(@f22,''),NULLIF(@f23,''),NULLIF(@f24,''),NULLIF(@f25,''),
     NULLIF(@f26,''),NULLIF(@f27,''),NULLIF(@f28,''),NULLIF(@f29,''),NULLIF(@f30,''),
     NULLIF(@f31,''),NULLIF(@f32,''),NULLIF(@f33,''),NULLIF(@f34,''),NULLIF(@f35,''),
     NULLIF(@f36,''),NULLIF(@f37,''),NULLIF(@f38,''),NULLIF(@f39,''),NULLIF(@f40,'')
  )), ''),
  `CURRENT DAY DOSES`         = NULLIF(@cd_dose, ''),
  `CURRENT DAY MISSED DOSES`  = NULLIF(@cd_miss, ''),
  `LAST DAY DOSES`            = NULLIF(@ld_dose, ''),
  `LAST DAY MISSED DOSES`     = NULLIF(@ld_miss, ''),
  `POURING TIMER`             = NULLIF(@pour_timer, '');

SELECT COUNT(*) AS loaded_rows FROM innodose_casting_details_v2;
