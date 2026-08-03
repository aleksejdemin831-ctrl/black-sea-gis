"""Extract pre-rendered layer PNGs from legacy index.html (no invented data)."""
import base64
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
for name, var in [
    ("satellite", "SATELLITE_IMG"),
    ("model3d", "MODEL3D_IMG"),
    ("daily", "DAILY_IMG"),
    ("salinity", "SAL_IMG"),
]:
    m = re.search(rf"const {var}='data:image/png;base64,([^']+)'", html)
    if not m:
        print(f"MISSING {var}")
        continue
    path = os.path.join(ROOT, "data", f"{name}.png")
    open(path, "wb").write(base64.b64decode(m.group(1)))
    print(f"OK {path} ({os.path.getsize(path)} bytes)")
