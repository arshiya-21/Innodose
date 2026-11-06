from pycomm3 import SLCDriver

PLC_IP = "192.168.0.12"   # PLC IP address
TAG = "B3:0/1"           # tag to write
VALUE = True             # True/False for a boolean tag, a number for integer/float

with SLCDriver(PLC_IP) as plc:
    result = plc.write((TAG, VALUE))
    print("write ->", result)
    print("WORKING" if result else f"FAILED: {result.error}")
