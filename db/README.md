# Inodose MySQL schema & seed

What's in this folder:

| File | Purpose |
|---|---|
| `01_schema.sql` | `CREATE DATABASE innodose`, the `mpmgateway` user that `alert.py` expects, and all 8 tables matching `alert.py`. |
| `02_seed.sql` | Dummy rows for `component_properties`, `alert_users`, `alert_tolerances`, `plc_update_log`, `dosage_calculations`, `dosage_alerts`, `modification_component_history`. |
| `load_csv.py` | Loads `..\innodose_casting_details_today_4.csv` (330 rows) into `innodose_casting_details_v2`. Handles `\0` padding, `\N` nulls, and the `dd-mm-yyyy HH:MM` datetime. |

## Prerequisite — install MySQL

If MySQL isn't installed yet on Windows:
1. Download MySQL Community Installer: https://dev.mysql.com/downloads/installer/
2. Install **MySQL Server 8** + **MySQL Shell**. Set a root password you'll remember.
3. Make sure the service `MySQL80` is running (Services app) and that `mysql.exe` is on `PATH` (usually `C:\Program Files\MySQL\MySQL Server 8.0\bin`).

Verify:
```powershell
mysql --version
```

## One-time setup (run in order)

```powershell
cd D:\Innodose\db

# 1. Create database `innodose` + all 8 tables (asks for root password)
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < 01_schema.sql

# 2. Load the PLC CSV into innodose_casting_details_v2 (~330 rows)
pip install pymysql
python load_csv.py --truncate --password YOUR_ROOT_PASSWORD

# 3. Seed reference tables (components, alert users, tolerances, etc.)
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p innodose < 02_seed.sql
```

## Verify

```powershell
$mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
& $mysql -u root -p innodose -e "SHOW TABLES;"
& $mysql -u root -p innodose -e "SELECT COUNT(*) FROM innodose_casting_details_v2;"
& $mysql -u root -p innodose -e "SELECT component_id, component_name FROM component_properties;"
& $mysql -u root -p innodose -e "SELECT alert_name, COUNT(*) FROM alert_users GROUP BY alert_name;"
```

Expect: 8 tables, ~330 rows in casting details, 3 components, 4 alert types.

## Tables

| Table | Rows after setup | Source |
|---|---|---|
| `innodose_casting_details_v2` | ~330 | CSV loader |
| `component_properties` | 3 | `02_seed.sql` |
| `alert_users` | 6 | `02_seed.sql` |
| `alert_tolerances` | 4 | `02_seed.sql` |
| `plc_update_log` | 3 | `02_seed.sql` |
| `dosage_calculations` | 10 | `02_seed.sql` |
| `dosage_alerts` | 4 | `02_seed.sql` |
| `modification_component_history` | 3 | `02_seed.sql` |

## Re-seeding / resetting

```powershell
$mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
& $mysql -u root -p -e "DROP DATABASE IF EXISTS innodose;"
& $mysql -u root -p < 01_schema.sql
python load_csv.py --truncate --password YOUR_ROOT_PASSWORD
& $mysql -u root -p innodose < 02_seed.sql
```

## Note about `alert.py`

The stock `alert.py` uses `mysql+pymysql://mpmgateway:mpmgateway@127.0.0.1:3306/innodose`. Since we're using local `root` instead, change that line in `alert.py` to:

```python
app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:YOUR_ROOT_PASSWORD@127.0.0.1:3306/innodose'
```
