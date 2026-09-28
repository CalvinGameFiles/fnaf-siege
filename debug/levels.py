"""Every campaign level builds a valid CPU fort (10 units, extras present) that stands still. python debug/levels.py"""
import os, sys, time, subprocess, socket, base64
sys.path.insert(0, r"C:\Users\JesusFam\slayerfiles-debug"); import harness
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
fails = []
def check(n, ok, x=""):
    print(("PASS " if ok else "FAIL ") + n + (f"  ({x})" if x else "")); ok or fails.append(n)
s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(["node", "server.js"], cwd=ROOT, env={**os.environ, "PORT": str(port)}, stdout=subprocess.DEVNULL); time.sleep(0.8)
proc, cdp = harness.launch_chrome("chrome-fnafsiege-levels"); E = cdp.eval; D = "Game.debug"
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)
    for lv in range(E("Game.LEVELS.length")):
        E(f"document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop(); Game.start({{mode:'campaign', level:{lv}}}); document.getElementById('overlay').classList.add('hidden')")
        info = E(f"(() => {{ const L={D}.S.layouts.red; return [L.units.length, L.units.filter(u=>u.kind==='king').length, L.blocks.filter(b=>b.mat==='cloud').length, L.blocks.filter(b=>b.mat==='arrow').length, L.units.map(u=>u.kind).filter(k=>k!=='endo'&&k!=='king').join('+')]; }})()")
        lvl = E(f"Game.LEVELS[{lv}]")
        ok = info[0] == 10 and info[1] == 1 and (info[2] > 0) == bool(lvl.get("cloud")) and (info[3] == 2) == bool(lvl.get("mover"))
        E(f"{D}.S.layouts.blue = {D}.genFort('blue'); {D}.readyUp('blue'); document.getElementById('overlay').classList.add('hidden')")
        b0 = E(f"{D}.blocks.filter(b=>!b.gm.mover).map(b=>[b.position.x,b.position.y])"); cdp.pump(3)
        b1 = E(f"{D}.blocks.filter(b=>!b.gm.mover).map(b=>[b.position.x,b.position.y])")
        moved = sum(1 for p, q in zip(b0, b1) if abs(p[0]-q[0]) + abs(p[1]-q[1]) > 8)
        alive = E(f"{D}.units.filter(u=>u.gm.side==='red').length")
        riders = E(f"{D}.units.filter(u=>u.gm.side==='red'&&u.position.y<1060&&u.position.y>900).length") if lvl.get('mover') else 1
        ok = ok and riders >= 1
        check(f"level {lv+1} {lvl['name']}: units {info[0]}, clouds {info[2]}, arrows {info[3]}, fighters [{info[4]}]", ok and moved == 0 and alive == 10 and len(b0) == len(b1), f"moved {moved}, red alive {alive}")
    E(f"(() => {{ const d={D}; d.cam.t={{cx:62*40, cy:34*40, z:0.4}}; d.cam.cx=62*40; d.cam.cy=34*40; d.cam.z=0.4; }})()"); cdp.pump(0.3)
    r = cdp.send("Page.captureScreenshot", {"format": "png"}); open(os.path.join(HERE, "shots", "50-level10-fort.png"), "wb").write(base64.b64decode(r["result"]["data"]))
    # every Auto Fort style, on both maps, stands still with all 20 units alive
    for mp in ("'field'", "'desert', 'red'", "'desert', 'blue'"):
        for st in E(f"{D}.FORT_STYLES"):
            E(f"document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop(); Game.start({{mode:'hotseat'}}); document.getElementById('overlay').classList.add('hidden')")
            E(f"{D}.setMap({mp}); {D}.S.layouts.blue = {D}.genFort('blue', {{style:'{st}'}}); {D}.S.layouts.red = {D}.genFort('red', {{style:'{st}'}}); {D}.readyUp('blue'); {D}.readyUp('red'); document.getElementById('overlay').classList.add('hidden')")
            b0 = E(f"{D}.blocks.filter(b=>!b.gm.mover).map(b=>[b.position.x,b.position.y])"); cdp.pump(3)
            b1 = E(f"{D}.blocks.filter(b=>!b.gm.mover).map(b=>[b.position.x,b.position.y])")
            moved = sum(1 for p_, q in zip(b0, b1) if abs(p_[0]-q[0]) + abs(p_[1]-q[1]) > 8)
            n = E(f"{D}.units.length")
            check(f"fort style {st} on {mp}: stands, 20 units", moved == 0 and n == 20 and len(b0) == len(b1), f"moved {moved}, units {n}")
            if mp == "'field'":
                E(f"(() => {{ const d={D}; d.cam.t={{cx:12*40, cy:38*40, z:0.45}}; d.cam.cx=12*40; d.cam.cy=38*40; d.cam.z=0.45; }})()"); cdp.pump(0.3)
                r = cdp.send("Page.captureScreenshot", {"format": "png"}); open(os.path.join(HERE, "shots", f"51-style-{st}.png"), "wb").write(base64.b64decode(r["result"]["data"]))
    r = cdp.send("Page.captureScreenshot", {"format": "png"}); open(os.path.join(HERE, "shots", "50-level10-fort.png"), "wb").write(base64.b64decode(r["result"]["data"]))
    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
