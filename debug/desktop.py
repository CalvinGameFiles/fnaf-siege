"""The Windows app starts, loads the live www/ game and runs a match without errors. python debug/desktop.py"""
import os, sys, json, time, subprocess, urllib.request
sys.path.insert(0, r"C:\Users\JesusFam\slayerfiles-debug"); import harness, websocket
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXE = os.path.join(ROOT, "desktop", "dist", "FNAF Siege-win32-x64", "FNAF Siege.exe")
port = harness.free_port()
proc = subprocess.Popen([EXE, f"--remote-debugging-port={port}", "--remote-allow-origins=*"], env={**os.environ, "FNAF_SIEGE_TEST": "1"})
fails = []
def check(n, ok, x=""):
    print(("PASS " if ok else "FAIL ") + n + (f"  ({x})" if x else "")); ok or fails.append(n)
try:
    ws = None
    for _ in range(80):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=1) as r:
                pages = [t for t in json.load(r) if t.get("type") == "page"]
            if pages: ws = pages[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.25)
    check("the app window opened", ws is not None)
    cdp = harness.CDP(websocket.create_connection(ws, timeout=25)); cdp.send("Runtime.enable"); cdp.pump(2)
    href = cdp.eval("location.href")
    check("it plays the live www/ folder", href.replace("%20", " ").lower().endswith("/fnafsiege/www/index.html"), href)
    check("the game loaded", cdp.eval("typeof Game === 'object' && document.getElementById('menu').classList.contains('active')") is True)
    cdp.eval("document.getElementById('hotseatBtn').click()"); cdp.pump(0.5)
    cdp.eval("Game.debug.onBar('autofort'); Game.debug.readyUp('blue'); Game.debug.onBar('autofort'); Game.debug.readyUp('red')"); cdp.pump(2)
    check("a match runs", cdp.eval("Game.debug.S.phase") == "battle")
    check("PeerJS is available for local play", cdp.eval("Net.available()") is True)
    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str(errs[:1]))
finally:
    subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
