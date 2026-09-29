"""v0.5.2: every campaign level has its own fort; the phone app offers an UPDATE button when GitHub has a newer version.
(levels.py checks that all 50 forts stand.)  Run:  python debug/round16.py      (screenshots in debug/shots/)
"""
import os, sys, json, time, subprocess, socket, base64
sys.path.insert(0, r"C:\Users\JesusFam\slayerfiles-debug")
import harness

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
fails = []
def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  ({extra})" if extra else ""))
    if not ok: fails.append(name)

s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(["node", "server.js"], cwd=ROOT, env={**os.environ, "PORT": str(port)}, stdout=subprocess.DEVNULL)
time.sleep(0.8)
proc, cdp = harness.launch_chrome("chrome-fnafsiege-r16")
D = "Game.debug"; E = cdp.eval
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)

    # --- 50 different forts: every level's plan, and the fort actually built from it, is its own
    plans = E("Game.LEVELS.map(L => JSON.stringify(L.plan))")
    check("all 50 levels have a fort plan", len(plans) == 50 and all(p and p != "null" for p in plans))
    check("...and no two plans are the same", len(set(plans)) == 50, f"{len(set(plans))} different")
    sigs = []
    for lv in range(50):
        E(f"document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop(); Game.start({{mode:'campaign', level:{lv}}}); document.getElementById('overlay').classList.add('hidden')")
        sigs.append(E(f"JSON.stringify({D}.S.layouts.red.blocks.map(b=>[b.shape,b.mat,b.c,b.r]).sort())"))
    check("the 50 forts that get built are all different", len(set(sigs)) == 50, f"{len(set(sigs))} different")
    kinds = E("Game.LEVELS.map(L => [...new Set(L.plan.map(m => m.m))].sort().join('+'))")
    check("they use a mix of buildings (towers, huts, bunkers, steps, stilts, islands, glass houses, walls)",
          all(any(k in x for x in kinds) for k in ["tower", "hut", "bunker", "steps", "stilt", "island", "glass", "wall"]), str(sorted(set(kinds))[:6]))
    for lv in (0, 14, 29, 49):
        E(f"document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop(); Game.start({{mode:'campaign', level:{lv}}}); document.getElementById('overlay').classList.add('hidden')")
        E(f"{D}.S.layouts.blue = {D}.genFort('blue'); {D}.readyUp('blue'); document.getElementById('overlay').classList.add('hidden')"); cdp.pump(1.0)
        E(f"(() => {{ const d={D}; d.cam.lock=false; d.cam.z=0.42; d.cam.x=48*40; d.cam.y=d.H-800; }})()"); E(f"{D}.frameNow()"); cdp.pump(0.2)
        r = cdp.send("Page.captureScreenshot", {"format": "png"}); open(os.path.join(HERE, "shots", f"160-level{lv + 1}-fort.png"), "wb").write(base64.b64decode(r["result"]["data"]))
    E("Game.running && Game.stop()")

    # --- the UPDATE button (in the phone app only), against the real GitHub releases
    latest = E("fetch('https://api.github.com/repos/CalvinGameFiles/fnaf-siege/releases/latest').then(r => r.json()).then(j => j.tag_name)")
    def app(ver):
        cdp.send("Page.addScriptToEvaluateOnNewDocument", {"source": f"window.AndroidApp = {{ version: () => '{ver}', openUrl: u => {{ window.__opened = u; }}, quit: () => {{}} }};"})
        cdp.send("Page.reload", {}); cdp.pump(3.0)
    app("v0.1.0")
    check("an older app shows UPDATE TO the newest version", wait := E("!document.getElementById('updateBtn').classList.contains('hidden')") is True and latest in E("document.getElementById('updateBtn').textContent"),
          E("document.getElementById('updateBtn').textContent"))
    r = cdp.send("Page.captureScreenshot", {"format": "png"}); open(os.path.join(HERE, "shots", "161-update-button.png"), "wb").write(base64.b64decode(r["result"]["data"]))
    E("document.getElementById('updateBtn').click()"); cdp.pump(0.3)
    opened = E("window.__opened")
    check("tapping it opens the new APK's download", bool(opened) and opened.startswith("https://github.com/CalvinGameFiles/fnaf-siege/releases/download/") and opened.endswith(".apk"), str(opened))
    check("...and says to install it over the app (progress stays)", "don't uninstall" in E("document.getElementById('uiToast').textContent"))
    app(latest)
    check("an up-to-date app shows no UPDATE button", E("document.getElementById('updateBtn').classList.contains('hidden')") is True)
    cdp.send("Page.addScriptToEvaluateOnNewDocument", {"source": "delete window.AndroidApp;"})
    cdp.send("Page.reload", {}); cdp.pump(2.5)
    check("the web version never shows it (it's always the newest)", E("document.getElementById('updateBtn').classList.contains('hidden')") is True)

    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
