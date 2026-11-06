"""Write tags to an Allen-Bradley SLC/MicroLogix PLC (pycomm3).
Usage: python plc_write.py '{"ip":"192.168.0.12","writes":[["B3:0/1",1,"boolean"],["F8:0",0.2,"float"]]}'
Each write is [tag, value, type] with type = "boolean" (default) | "integer" | "float".
Prints one JSON line: {"ok":bool,"results":[...],"error":str|null}
"""
import json
import sys

from pycomm3 import SLCDriver


def convert(value, dtype):
    if dtype == "integer":
        return int(value)
    if dtype == "float":
        return float(value)
    return bool(value)  # boolean (default): any non-zero value is True


def main():
    req = json.loads(sys.argv[1])
    out = {"ok": False, "results": [], "error": None}
    try:
        with SLCDriver(req["ip"]) as plc:
            for w in req["writes"]:
                tag, value = w[0], w[1]
                dtype = w[2] if len(w) > 2 else "boolean"
                v = convert(value, dtype)
                r = plc.write((tag, v))
                out["results"].append({"tag": tag, "value": v, "type": dtype, "ok": bool(r), "error": getattr(r, "error", None)})
        out["ok"] = all(r["ok"] for r in out["results"])
    except Exception as e:  # connection refused, bad tag, etc.
        out["error"] = str(e)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
