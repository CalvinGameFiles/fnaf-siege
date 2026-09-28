"""v0.4.0 play-test fixes: the cannon can't hurt units in the battlefield; cannons have 5 HP and enemy units can hit
them (a cannon wrecker one-shots it); mid-game blocks only in the battlefield (team-coloured there); removing your
own blocks for dice points; a missed shot gets one more try; zoom and pan on your dice turn.
Run:  python debug/round13.py      (screenshots in debug/shots/)
"""
import os, sys, json, time, subprocess, socket, base64
sys.path.insert(0, r"C:\Users\JesusFam\slayerfiles-debug")
import harness

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
fails = []
def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  ({extra})" if extra else ""))
    if not ok: fails.append(name)
def shot(name):
    r = cdp.send("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(HERE, "shots", name + ".png"), "wb").write(base64.b64decode(r["result"]["data"]))

s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(["node", "server.js"], cwd=ROOT, env={**os.environ, "PORT": str(port)}, stdout=subprocess.DEVNULL)
time.sleep(0.8)
proc, cdp = harness.launch_chrome("chrome-fnafsiege-r13")
D = "Game.debug"; E = cdp.eval
nid = [50000]
def blk(shape, mat, c, r):
    nid[0] += 1; return {"id": nid[0], "shape": shape, "mat": mat, "c": c, "r": r}
def unit(kind, c, r, **kw):
    nid[0] += 1; return {"id": nid[0], "kind": kind, "c": c, "r": r, **kw}
def fresh(bb, rb, bu, ru):
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop()")
    E("Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('field')")
    E(f"(() => {{ const S={D}.S; S.layouts.blue={{blocks:{json.dumps(bb)},units:{json.dumps(bu)}}}; S.layouts.red={{blocks:{json.dumps(rb)},units:{json.dumps(ru)}}}; }})()")
    E(f"{D}.readyUp('blue'); {D}.readyUp('red'); document.getElementById('overlay').classList.add('hidden')")
def wait(cond, t=25):
    end = time.time() + t
    while time.time() < end:
        if E(cond): return True
        cdp.pump(0.2)
    return False
def roll(v):
    E(f"{D}.doAct({{t:'roll', v:{v}}})"); wait(f"{D}.S.rolling===0", 8)
def U(i): return f"{D}.units.find(u=>u.gm.id==={i})"
blue10 = lambda: [unit("endo", 2 + i, 49) for i in range(9)] + [unit("king", 20, 49)]
red10 = lambda: [unit("endo", 64 + i, 49) for i in range(9)] + [unit("king", 74, 49)]
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 800, "height": 360, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)

    # --- 1. the cannon can't hurt a unit in the battlefield (but still can in the enemy's land)
    fresh([], [], blue10(), [unit("endo", 40, 49), unit("endo", 60, 49)] + [unit("endo", 65 + i, 49) for i in range(7)] + [unit("king", 74, 49)])
    cdp.pump(0.8)
    fld, home = 50001 + 10 + 0, None
    fld = E(f"{D}.units.find(u=>u.gm.side==='red'&&Math.floor(u.position.x/40)===40).gm.id")
    home = E(f"{D}.units.find(u=>u.gm.side==='red'&&Math.floor(u.position.x/40)===60).gm.id")
    for uid in (fld, home):
        E(f"(() => {{ const u={U(uid)}; {D}.makeBall(u.position.x - 30, u.position.y, 14, 0, 'blue', {{ cannon: true }}); }})()")
    cdp.pump(1.2)
    check("a cannonball can't hurt a unit out in the battlefield", E(f"!!{U(fld)} && {U(fld)}.gm.hp === 1") is True)
    check("...but still kills one in the enemy's land", E(f"!{U(home)}") is True)

    # --- 2. cannons have 5 HP; any enemy unit next to one can hit it; a cannon wrecker one-shots it
    fresh([], [], blue10(), [unit("endo", 0, 49), unit("bb", 1, 49), unit("endo", 0, 30)] + [unit("endo", 64 + i, 49) for i in range(6)] + [unit("king", 74, 49)])
    cdp.pump(1.0)
    E(f"{D}.onBar('dice'); {D}.onBar('endturn')"); wait(f"{D}.S.turn==='red' && {D}.S.act==='choose'")
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(6)
    endo = E(f"{D}.units.find(u=>u.gm.side==='red'&&Math.floor(u.position.x/40)===0&&u.position.y>1900).gm.id")
    high = E(f"{D}.units.find(u=>u.gm.side==='red'&&u.position.y<1300)")
    check("cannons start with 5 HP", E(f"{D}.S.cannonHp") == {"blue": 5, "red": 5})
    check("an Endo standing next to the enemy cannon can hit it", E(f"{D}.canHitCannon({U(endo)})") is True)
    E(f"{D}.S.sel = {endo}"); cdp.pump(0.3)
    check("...the dice bar offers Hit Cannon", "Hit Cannon" in E("document.getElementById('hudBar').textContent"))
    E(f"{D}.onBar('hitcannon')"); cdp.pump(0.2); E(f"{D}.onBar('hitcannon')"); cdp.pump(0.2)
    check("two hits take 2 HP off (5 -> 3) for 2 points", E(f"[{D}.S.cannonHp.blue, {D}.S.pts]") == [3, 4])
    shot("140-cannon-hit")
    bb = E(f"{D}.units.find(u=>u.gm.kind==='bb').gm.id")
    E(f"{D}.doAct({{t:'move', id:{bb}, c:0, r:48}})"); cdp.pump(1.0)
    check("Balloon Boy (a cannon wrecker) smashes it in one hit", E(f"{D}.S.cannonDown.blue") is True and E(f"{D}.S.cannonHp.blue") == 0)

    # --- 3. mid-game blocks only in the battlefield, in your team colour; 4. remove your own blocks
    fresh([blk("s11", "stone", 10, 49), blk("s11", "wood", 12, 49)], [blk("s11", "wood", 60, 49)], blue10(), red10())
    cdp.pump(1.0)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(9)
    check("no new blocks in your own land any more", E(f"{D}.canRepair('wood', 15, 48)") is False)
    check("...only in the battlefield", E(f"{D}.canRepair('wood', 35, 49)") is True and E(f"{D}.canRepair('stone', 60, 48)") is False)
    E(f"{D}.doAct({{t:'place', mat:'stone', c:35, r:49}})"); cdp.pump(0.3)
    check("a block placed out in the battlefield belongs to you", E(f"{D}.blocks.some(b=>Math.floor(b.position.x/40)===35 && b.gm.side==='blue')") is True)
    E(f"(() => {{ const d={D}; d.cam.lock=false; d.cam.z=1.6; d.cam.x=35*40-400/1.6; d.cam.y=48*40-180/1.6; }})()"); E(f"{D}.frameNow()")
    shot("141-field-block-team-colour")
    E(f"(() => {{ const d={D}; d.cam.lock=true; }})()")
    pts = E(f"{D}.S.pts")
    own = E(f"{D}.blocks.find(b=>b.gm.side==='blue'&&b.gm.mat==='stone'&&Math.floor(b.position.x/40)===10).gm.id")
    E(f"{D}.doAct({{t:'unbuild', bid:{own}}})"); cdp.pump(0.3)
    check("removing your own stone block costs 2 points", E(f"{D}.blocks.some(b=>b.gm.id==={own})") is False and E(f"{D}.S.pts") == pts - 2)
    enemy = E(f"{D}.blocks.find(b=>b.gm.side==='red').gm.id")
    E(f"{D}.doAct({{t:'unbuild', bid:{enemy}}})"); cdp.pump(0.3)
    check("...but you can't remove the enemy's blocks that way", E(f"{D}.blocks.some(b=>b.gm.id==={enemy})") is True)

    # --- 5. a missed cannon shot gets one more try; a second miss ends the turn
    fresh([], [], blue10(), red10()); cdp.pump(0.8)
    E(f"{D}.onBar('cannon'); {D}.doAct({{t:'shot', vx:-2, vy:-2}})")          # a dud: hits nothing
    check("a miss gives one more try (same turn, aiming again)", wait(f"{D}.S.act==='aim' && {D}.S.retried===true && {D}.S.turn==='blue'", 25))
    shot("142-one-more-try")
    E(f"{D}.doAct({{t:'shot', vx:-2, vy:-2}})")
    check("...and a second miss ends the turn", wait(f"{D}.S.turn==='red'", 25))
    # a shot that does something ends the turn straight away
    E(f"{D}.onBar('dice'); {D}.onBar('endturn')"); wait(f"{D}.S.turn==='blue' && {D}.S.act==='choose'")
    E(f"{D}.onBar('cannon'); {D}.doAct({{t:'shot', vx:-2, vy:-2}})")
    E(f"{D}.damageUnit({D}.units.find(u=>u.gm.side==='red'&&u.gm.kind==='endo'), 3, 'cannon')")
    check("a shot that takes out a unit doesn't get a second try", wait(f"{D}.S.turn==='red'", 25) and E(f"{D}.S.retried") is False)

    # --- 6. dice turn: the camera frames the army, then you can pinch / zoom / pan yourself
    fresh([], [], [unit("endo", 1, 49), unit("endo", 23, 49), unit("endo", 12, 40)] + [unit("endo", 3 + i, 49) for i in range(6)] + [unit("king", 20, 49)], red10())
    cdp.pump(1.0)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(7); cdp.pump(1.5)
    z0 = E(f"{D}.cam.z")
    def touch(kind, pts): cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})
    touch("touchStart", [(350, 150), (450, 150)]); cdp.pump(0.05)
    for k in range(1, 8): touch("touchMove", [(350 - k * 18, 150), (450 + k * 18, 150)]); cdp.pump(0.03)
    touch("touchEnd", []); cdp.pump(0.6)
    z1 = E(f"{D}.cam.z")
    check("on a dice turn two fingers zoom in", z1 > z0 * 1.4 and E(f"{D}.camFree") is True, f"{z0:.2f} -> {z1:.2f}")
    cdp.pump(1.0)
    check("...and the camera stays where you put it", abs(E(f"{D}.cam.z") - z1) < 0.01)
    shot("143-dice-zoomed-in")
    # a tap still moves a unit while zoomed in
    uid = E(f"{D}.units.find(u=>u.gm.side==='blue'&&Math.floor(u.position.x/40)===4).gm.id")
    E(f"{D}.S.sel = {uid}")
    # drag the view over to the unit with one finger (a pan), like a player would
    cur = E(f"(() => {{ const s={D}.toScreen(4.5*40, 48.5*40); return [s.x, s.y]; }})()")
    dx, dy = 400 - cur[0], 180 - cur[1]
    touch("touchStart", [(400 - dx * 0.0, 180)]); cdp.pump(0.03)
    for k in range(1, 11): touch("touchMove", [(400 + dx * k / 10, 180 + dy * k / 10)]); cdp.pump(0.03)
    touch("touchEnd", []); cdp.pump(0.3)
    sp = E(f"(() => {{ const s={D}.toScreen(4.5*40, 48.5*40); return [s.x, s.y]; }})()")
    check("one finger drags the view around", abs(sp[0] - 400) < 30 and abs(sp[1] - 180) < 30 and E(f"{D}.S.pts") == 7, str(sp))
    touch("touchStart", [sp]); cdp.pump(0.05); touch("touchEnd", []); cdp.pump(0.8)
    check("...and tapping a square still moves your unit", E(f"{D}.unitCell({U(uid)})")["r"] in (48, 49) and E(f"{D}.S.pts") == 6, str(E(f"{D}.unitCell({U(uid)})")))
    E(f"{D}.onBar('zoom', 'out')"); z2 = E(f"{D}.cam.z")
    check("the - button zooms out", z2 < E(f"{D}.cam.z") * 1.01 and z2 < z1)
    E(f"{D}.onBar('zoom', 'fit')"); cdp.pump(1.5)
    check("'All' frames the whole army again", E(f"{D}.camFree") is False and abs(E(f"{D}.cam.z") - z0) < 0.05, f"{E(f'{D}.cam.z'):.2f} vs {z0:.2f}")
    E(f"{D}.onBar('zoom', 'in')"); E(f"{D}.doAct({{t:'endturn'}})"); cdp.pump(0.5)
    check("when the dice turn ends the camera goes back to automatic", E(f"{D}.camFree") is False)

    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
