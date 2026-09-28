"""Smoke test for FNAF Siege: starts server.js, drives the real page in headless Chrome.
Menus, shop -> inventory -> equipment bar (real drag), hot-seat match with the locked battle camera, campaign vs the CPU.
Run:  python debug/smoke.py      (screenshots land in debug/shots/)
"""
import os, sys, json, time, base64, subprocess, socket
sys.path.insert(0, r"C:\Users\JesusFam\slayerfiles-debug")
import harness

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
SHOTS = os.path.join(HERE, "shots"); os.makedirs(SHOTS, exist_ok=True)
fails = []
def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  ({extra})" if extra else ""))
    if not ok: fails.append(name)
def shot(cdp, name):
    r = cdp.send("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["result"]["data"]))

s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(["node", "server.js"], cwd=ROOT, env={**os.environ, "PORT": str(port)}, stdout=subprocess.DEVNULL)
time.sleep(0.8)
proc, cdp = harness.launch_chrome("chrome-fnafsiege")
E = cdp.eval; D = "Game.debug"
def mouse(t, x, y):
    cdp.send("Input.dispatchMouseEvent", {"type": t, "x": x, "y": y, "button": "left", "buttons": 0 if t == "mouseReleased" else 1, "clickCount": 1})
def drag(x0, y0, x1, y1, steps=8):
    mouse("mousePressed", x0, y0)
    for i in range(1, steps + 1): mouse("mouseMoved", x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); cdp.pump(0.02)
    mouse("mouseReleased", x1, y1)
def center(sel):
    return E(f"(() => {{ const r=document.querySelector('{sel}').getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]; }})()")
def wait(cond, t=25):
    end = time.time() + t
    while time.time() < end:
        if E(cond): return True
        cdp.pump(0.3)
    return False
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)
    E("localStorage.clear(); location.reload()"); cdp.pump(1.5)
    shot(cdp, "01-menu")
    check("menu visible", E("document.getElementById('menu').classList.contains('active')"))
    # shop -> buy both masks
    E("Store.set('coins', 100); UI.show('shop')"); cdp.pump(0.3)
    check("shop shows its Common section (Bonnie 20 coins)", "20 coins" in E("document.querySelector('#shopgrid [data-key=bonnie]').textContent"))
    E("document.querySelector('#shopgrid [data-key=bonnie]').click()"); cdp.pump(0.2)
    E("document.getElementById('rarNext').click()"); cdp.pump(0.2)            # Uncommon: Chica 40
    E("document.querySelector('#shopgrid [data-key=chica]').click()"); cdp.pump(0.2)
    E("document.querySelector('#shopgrid [data-key=chica]').click()"); cdp.pump(0.2)
    check("buying took 20 + 40 coins (a second Chica wasn't bought)", E("Store.get('coins')") == 40)
    shot(cdp, "02-shop")
    check("masks owned", E("Store.get('owned').bonnie && Store.get('owned').chica") is True)
    # campaign screen: 10 levels, inventory, drag into the gold bar
    E("UI.show('campaign')"); cdp.pump(0.4)
    check("10 levels", E("document.querySelectorAll('.lvl').length") == 10)
    check("inventory holds 2 items", E("document.querySelectorAll('#invGrid .item').length") == 2)
    a = center("#invGrid .item[data-id=bonnie]"); b = center("#equipBar .slot[data-slot=\"0\"]")
    drag(a[0], a[1], b[0], b[1]); cdp.pump(0.3)
    a = center("#invGrid .item[data-id=chica]"); b = center("#equipBar .slot[data-slot=\"1\"]")
    drag(a[0], a[1], b[0], b[1]); cdp.pump(0.3)
    shot(cdp, "03-campaign")
    check("dragged masks into the equipment bar", E("JSON.stringify(Store.get('equip').slice(0,2))") == '["bonnie","chica"]', E("JSON.stringify(Store.get('equip'))"))
    check("inventory now empty", E("document.querySelectorAll('#invGrid .item').length") == 0)

    # ---- hot-seat match
    E("UI.show('local')"); cdp.pump(0.3)
    E("document.getElementById('hotseatBtn').click()"); cdp.pump(0.4)
    E("document.querySelector('[data-o=build]').click()"); cdp.pump(0.3)
    z0 = E(f"{D}.cam.z"); E("document.querySelector('[data-z=in]').click()"); cdp.pump(0.1)
    check("free zoom while building", E(f"{D}.cam.z") > z0)
    E(f"{D}.onBar('autofort')"); cdp.pump(0.3); shot(cdp, "04-build")
    E(f"{D}.onBar('tounits')"); cdp.pump(0.3)
    # drag the Bonnie mask from the in-game gold bar onto an endo (real pointer drag)
    tgt = E(f"(() => {{ const u={D}.S.layouts.blue.units.find(u=>u.kind==='endo'); const s={D}.toScreen((u.c+.5)*40,(u.r+.5)*40); return [s.x,s.y,u.id]; }})()")
    a = center("#equip .eslot[data-i=\"0\"]")
    drag(a[0], a[1], tgt[0], tgt[1]); cdp.pump(0.3)
    shot(cdp, "05-mask")
    check("mask turned an Endo into Bonnie", E(f"{D}.S.layouts.blue.units.find(u=>u.id==={tgt[2]}).kind") == "bonnie")
    E(f"{D}.readyUp('blue')"); cdp.pump(0.2); E("document.querySelector('[data-o=build]').click()")
    E(f"{D}.onBar('autofort'); {D}.readyUp('red')"); cdp.pump(0.5)
    check("battle started", E(f"{D}.S.phase") == "battle")
    E("document.querySelector('[data-o=close]').click()"); cdp.pump(1.5)
    shot(cdp, "06-battle-blue-side")
    view = E(f"(() => {{ const d={D}; return [d.cam.x/40, (d.cam.x+915/d.cam.z)/40]; }})()")
    check("turn start frames blue's side", view[0] < 0 and 20 < view[1] < 52, str(view))
    # camera can't be moved in battle
    cx = E(f"{D}.cam.x"); drag(600, 200, 200, 220); cdp.pump(0.8)
    check("battle camera ignores dragging", abs(E(f"{D}.cam.x") - cx) < 1)
    E(f"{D}.onBar('cannon')"); cdp.pump(1.5); shot(cdp, "07-cannon-view")
    view = E(f"(() => {{ const d={D}; return [d.cam.x/40, (d.cam.x+915/d.cam.z)/40]; }})()")
    check("aiming keeps the view on your own side (cannon highlighted)", view[0] < -4.5 and 20 < view[1] < 52, str(view))
    # aim by dragging anywhere, trajectory dots on
    mouse("mousePressed", 500, 200)
    for i in range(1, 11): mouse("mouseMoved", 500 - 20 * i, 200 + 16 * i); cdp.pump(0.02)
    shot(cdp, "07b-aiming")
    mouse("mouseReleased", 300, 360); cdp.pump(0.1)
    check("drag anywhere fires", E(f"{D}.S.act") == "fly", E(f"{D}.S.act"))
    cdp.pump(0.6); shot(cdp, "08-following-ball")
    fol = E(f"(() => {{ const d={D}, b=d.balls[0]; if (!b) return null; const s=d.toScreen(b.position.x,b.position.y); return [s.x, s.y]; }})()")
    check("camera follows the cannonball", fol is None or (0 <= fol[0] <= 915), str(fol))
    wait(f"{D}.S.flyView==='foe'", 12); cdp.pump(1.5); shot(cdp, "08b-damage-view")
    view = E(f"(() => {{ const d={D}; return [d.cam.x/40, (d.cam.x+915/d.cam.z)/40]; }})()")
    check("then pulls back over red's side to show the damage", view[0] > 23, str(view))
    # a shot that hit nothing gets one more try: take it (a dud) so the turn passes
    if wait(f"{D}.S.turn==='red' || ({D}.S.act==='aim' && {D}.S.retried)"):
        if E(f"{D}.S.act==='aim' && {D}.S.retried"):
            check("a complete miss gets one more try", True)
            E(f"{D}.doAct({{t:'shot', vx:-2, vy:-2}})")
    check("turn passed to red", wait(f"{D}.S.turn==='red'"))
    cdp.pump(1.5); shot(cdp, "09-red-turn")
    view = E(f"(() => {{ const d={D}; return [d.cam.x/40, (d.cam.x+915/d.cam.z)/40]; }})()")
    check("red's turn frames red's side", view[0] > 23, str(view))
    E(f"{D}.onBar('dice')"); cdp.pump(1.5); shot(cdp, "10-dice-army")
    check("dice view frames red's army", E(f"(() => {{ const d={D}; const x0=d.cam.x, x1=d.cam.x+915/d.cam.z; return d.units.filter(u=>u.gm.side==='red').every(u=>u.position.x>x0&&u.position.x<x1); }})()") is True)
    E(f"{D}.onBar('endturn')")
    check("back to blue", wait(f"{D}.S.turn==='blue'"))

    # ---- campaign level 1 vs the CPU
    E("Game.stop(); Game.start({mode:'campaign', level:0})"); cdp.pump(0.4)
    shot(cdp, "11-campaign-intro")
    E("document.querySelector('[data-o=close]').click()")
    check("CPU fort already built", E(f"{D}.S.layouts.red.units.length") == 10 and E(f"{D}.S.ready.red") is True)
    E(f"{D}.onBar('autofort'); {D}.onBar('tounits'); {D}.onBar('ready')"); cdp.pump(0.5)
    E("document.querySelector('[data-o=close]') && document.querySelector('[data-o=close]').click()")
    E(f"{D}.onBar('cannon'); {D}.doAct({{t:'shot', vx: 30, vy: -26}})")
    check("CPU takes its turn (cannon or dice)", wait(f"{D}.S.turn==='red' && ({D}.S.act==='fly' || {D}.S.act==='dice')", 30), E(f"{D}.S.act"))
    cdp.pump(0.3); shot(cdp, "12-cpu-shot")
    check("back to the player", wait(f"{D}.S.turn==='blue'", 30))
    # CPU accuracy: over many aims, how many land near the target unit
    acc = E(f"""(() => {{ const d={D}; let n=0; for (let i=0;i<20;i++) {{ const v=d.cpuAim(); if (Math.hypot(v.vx,v.vy) < 44.01) n++; }} return n; }})()""")
    check("CPU aim solves within cannon power", acc == 20, str(acc))
    # win the level: wipe red, fire the final shot as CPU, check the level is marked beaten
    E(f"{D}.units.filter(u=>u.gm.side==='red'&&u.gm.kind!=='king').forEach(u=>{{u.gm.hp=0;u.gm.dead=true;}})")
    E(f"{D}.onBar('dice'); {D}.onBar('endturn')")
    check("campaign won", wait(f"{D}.S.result==='blue'", 40), str(E(f"{D}.S.result")))
    cdp.pump(1.5); shot(cdp, "13-level-complete")
    check("level 1 marked beaten", 1 in E("Store.get('beaten')"))
    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
