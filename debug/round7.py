"""Round 7: centred side camera, cannon overheat, blue up/down arrows (lifts), Ennard, Games Freddy, Missing Mangle's
pink plastic, Cookie Bonnie's straight cookie, Radioactive Foxy's melt, 3 magic shots a turn.
Run:  python debug/round7.py      (screenshots in debug/shots/)
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
proc, cdp = harness.launch_chrome("chrome-fnafsiege-r7")
D = "Game.debug"; E = cdp.eval
nid = [9000]
def blk(shape, mat, c, r, **kw):
    nid[0] += 1; return {"id": nid[0], "shape": shape, "mat": mat, "c": c, "r": r, **kw}
def unit(kind, c, r):
    nid[0] += 1; return {"id": nid[0], "kind": kind, "c": c, "r": r}
def fresh(bb, rb, bu, ru):
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop()")
    E("Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('field')")
    E(f"(() => {{ const S={D}.S; S.layouts.blue={{blocks:{json.dumps(bb)},units:{json.dumps(bu)}}}; S.layouts.red={{blocks:{json.dumps(rb)},units:{json.dumps(ru)}}}; }})()")
    E(f"{D}.readyUp('blue'); {D}.readyUp('red'); document.getElementById('overlay').classList.add('hidden')")
def blue9(x0=2): return [unit("endo", x0 + i, 49) for i in range(8)] + [unit("king", 20, 49)]
def red10(): return [unit("endo", 66 + i, 49) for i in range(8)] + [unit("king", 64, 49)]
def look(x, y, z=1.5):
    E(f"(() => {{ const d={D}; d.cam.t={{cx:{x}*40, cy:{y}*40, z:{z}}}; d.cam.cx={x}*40; d.cam.cy={y}*40; d.cam.z={z}; }})()")
def roll(v):
    E(f"{D}.doAct({{t:'roll', v:{v}}})")
    for _ in range(25):
        if E(f"{D}.S.rolling") == 0: break
        cdp.pump(0.2)
def wait(cond, t=20):
    end = time.time() + t
    while time.time() < end:
        if E(cond): return True
        cdp.pump(0.25)
    return False
def uid(kind, side="blue"): return E(f"{D}.units.find(u=>u.gm.kind==='{kind}'&&u.gm.side==='{side}').gm.id")
def shoot(kind, vx, vy):
    u = uid(kind)
    sh = E(f"Game.KINDS['{kind}'].shoot")
    E(f"{D}.doAct({{t:'throwmode', id:{u}, kind:'{sh}'}}); {D}.doAct({{t:'throw', id:{u}, kind:'{sh}', vx:{vx}, vy:{vy}}})")
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)

    # --- the side view is centred on the side (cannon to border), and never shows the enemy's land
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('field'); {D}.S.layouts.blue = {D}.genFort('blue', {{style:'pyramid'}}); {D}.S.layouts.red = {D}.genFort('red', {{style:'pyramid'}}); {D}.readyUp('blue'); {D}.readyUp('red'); document.getElementById('overlay').classList.add('hidden')")
    cdp.pump(1.5)
    v = E(f"(() => {{ const d={D}; return [d.cam.x/40, (d.cam.x+915/d.cam.z)/40]; }})()")
    mid = (v[0] + v[1]) / 2
    check("blue's view is centred on blue's side", 4 < mid < 13 and v[1] <= 50.5, f"view {v[0]:.1f}..{v[1]:.1f}, centre {mid:.1f}")
    shot("81-camera-centred")
    E(f"{D}.onBar('dice'); {D}.onBar('endturn')"); wait(f"{D}.S.turn==='red'"); cdp.pump(1.5)
    v = E(f"(() => {{ const d={D}; return [d.cam.x/40, (d.cam.x+915/d.cam.z)/40]; }})()")
    mid = (v[0] + v[1]) / 2
    check("red's view is centred on red's side", 62 < mid < 71 and v[0] >= 24.5, f"view {v[0]:.1f}..{v[1]:.1f}, centre {mid:.1f}")

    # --- overheat: 3 cannon shots in a row, then 2 turns without the cannon
    fresh([], [], blue9(), red10())
    cdp.pump(0.5)
    def blue_fires():
        E(f"{D}.onBar('cannon'); {D}.doAct({{t:'shot', vx:-3, vy:-3}})")
        # a miss gets one more try (it doesn't add heat): take it so the turn passes
        wait(f"{D}.S.turn==='red' || ({D}.S.act==='aim' && {D}.S.retried)", 20)
        if E(f"{D}.S.act==='aim' && {D}.S.retried"): E(f"{D}.doAct({{t:'shot', vx:-3, vy:-3}})")
        wait(f"{D}.S.turn==='red'", 20)
    def red_passes():
        E(f"{D}.onBar('dice'); {D}.onBar('endturn')"); wait(f"{D}.S.turn==='blue'", 20)
    for i in range(3):
        blue_fires(); red_passes()
    check("after 3 shots in a row blue's cannon is overheated", E(f"{D}.S.hot") is True and "OVERHEATED" in E("document.getElementById('hudBar').textContent"))
    shot("82-overheated")
    E(f"{D}.onBar('dice'); {D}.onBar('endturn')"); wait(f"{D}.S.turn==='red'"); red_passes()
    check("still overheated the 2nd turn", E(f"{D}.S.hot") is True)
    E(f"{D}.onBar('dice'); {D}.onBar('endturn')"); wait(f"{D}.S.turn==='red'"); red_passes()
    check("cooled down on the 3rd turn", E(f"{D}.S.hot") is False and "FIRE CANNON" in E("document.getElementById('hudBar').textContent"))
    blue_fires(); red_passes(); E(f"{D}.onBar('dice'); {D}.onBar('endturn')"); wait(f"{D}.S.turn==='red'"); red_passes()
    blue_fires(); red_passes()
    check("using the dice breaks the streak", E(f"{D}.S.hot") is False and E(f"{D}.S.heat.blue") == 1)

    # --- blue up/down arrows: a lift carrying a unit
    bb = [blk("v1", "varrow", 10, 45, dir=-1), blk("s31", "stone", 9, 44), blk("v1", "varrow", 10, 34, dir=1)]
    fresh(bb, [], [unit("endo", 10, 43)] + blue9(12), red10())
    y0 = E(f"{D}.blocks[0].position.y"); u0 = E(f"{D}.units.find(u=>Math.floor(u.position.x/40)===10).position.y")
    cdp.pump(3)
    y1 = E(f"{D}.blocks[0].position.y"); u1 = E(f"{D}.units.find(u=>Math.floor(u.position.x/40)===10).position.y")
    check("the lift rises", y1 < y0 - 60, f"{y0:.0f}->{y1:.0f}")
    check("the unit rides it up", abs((u1 - u0) - (y1 - y0)) < 20, f"{u0:.0f}->{u1:.0f}")
    look(10, 40, 1.1); cdp.pump(0.2); shot("83-lift")
    cdp.pump(8)
    ys = []
    for _ in range(12): cdp.pump(0.5); ys.append(E(f"{D}.blocks[0].position.y"))
    check("it turns around at the blue arrow and stays between them", min(ys) > 35 * 40 and max(ys) < 45 * 40, f"{min(ys) / 40:.1f}..{max(ys) / 40:.1f}")

    # --- Ennard walks through every enemy wall; Games Freddy flies
    rb = [blk("s14", "wood", 53, 46), blk("s14", "glass", 56, 46), blk("s14", "stone", 59, 46)]
    fresh([], rb, [unit("ennard", 54, 49), unit("gfreddy", 12, 49)] + blue9(0)[:7] + [unit("king", 20, 49)], red10())
    cdp.pump(0.8); E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(8)
    tg = E(f"{D}.moveTargets({D}.units.find(u=>u.gm.kind==='ennard')).map(t=>[t.c,t.r])")
    check("Ennard walks through enemy wood", [52, 49] in tg, str(tg))
    check("...and glass", [57, 49] in E(f"(() => {{ const d={D}, u=d.units.find(u=>u.gm.kind==='ennard'); Matter.Body.setPosition(u, {{x:55.5*40, y:49.5*40}}); return d.moveTargets(u).map(t=>[t.c,t.r]); }})()"))
    check("...and stone", [60, 49] in E(f"(() => {{ const d={D}, u=d.units.find(u=>u.gm.kind==='ennard'); Matter.Body.setPosition(u, {{x:58.5*40, y:49.5*40}}); return d.moveTargets(u).map(t=>[t.c,t.r]); }})()"))
    gf = uid("gfreddy")
    for r_ in (48, 47, 46, 45):
        E(f"{D}.doAct({{t:'move', id:{gf}, c:12, r:{r_}}})"); cdp.pump(0.3)
    cdp.pump(1.2)
    check("Games Freddy stays up in the air", E(f"{D}.unitCell({D}.units.find(u=>u.gm.id==={gf}))") == {"c": 12, "r": 45})
    look(12, 46, 1.6); cdp.pump(0.2); shot("84-games-freddy")

    # --- Missing Mangle: pink ooze turns enemy blocks to pink plastic (1 point to break)
    rb = [blk("s11", "stone", 52 + (i % 3), 47 + i // 3) for i in range(9)]
    fresh([], rb, [unit("mmangle", 47, 49)] + blue9(), red10())
    cdp.pump(1); E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(6)
    shoot("mmangle", 10, -2)
    wait(f"!{D}.balls.length", 5); cdp.pump(0.5)
    mats = E(f"{D}.blocks.filter(b=>b.gm.side==='red').map(b=>b.gm.mat)")
    check("the ooze turned the enemy stone to pink plastic", mats.count("plastic") >= 7, str(mats))
    look(53, 47, 1.6); cdp.pump(0.2); shot("85-pink-plastic")
    fresh([], [blk("s11", "plastic", 56, 49)], [unit("endo", 55, 49)] + blue9(), red10())
    cdp.pump(0.8)
    check("pink plastic costs 1 point to break", E(f"{D}.breakTargets({D}.units.find(u=>Math.floor(u.position.x/40)===55)).map(t=>t.cost)") == [1])

    # --- Cookie Bonnie: a straight cookie, 1 damage to each enemy it passes, through glass, stopped by wood
    rb = [blk("s12", "glass", 51, 48), blk("s12", "wood", 57, 48)]
    ru = [unit("bonnie", 53, 49), unit("bonnie", 55, 49), unit("endo", 59, 49)] + [unit("endo", 66 + i, 49) for i in range(6)] + [unit("king", 64, 49)]
    fresh([], rb, [unit("cbonnie", 47, 49)] + blue9(), ru)
    cdp.pump(1); E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(6)
    shoot("cbonnie", 16, 0)
    cdp.pump(0.3); shot("86-cookie")
    wait(f"!{D}.balls.length", 5)
    hp = E(f"{D}.units.filter(u=>u.gm.side==='red'&&u.gm.kind==='bonnie').map(u=>u.gm.hp)")
    check("the cookie hit both Bonnies behind the glass for 1", hp == [1, 1], str(hp))
    check("...and the wood stopped it (the Endo behind is fine)", E(f"{D}.units.some(u=>u.gm.side==='red'&&Math.floor(u.position.x/40)===59)") is True)
    check("the glass is unharmed", E(f"{D}.blocks.filter(b=>b.gm.mat==='glass').length") == 1)

    # --- Radioactive Foxy melts enemy blocks; magic is capped at 3 a turn
    rb = [blk("s11", "stone", 52 + (i % 3), 47 + i // 3) for i in range(9)]
    fresh([], rb, [unit("rfoxy", 47, 49), unit("burntfoxy", 45, 49)] + blue9()[:7] + [unit("king", 20, 49)], red10())
    cdp.pump(1); E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(6)
    shoot("rfoxy", 10, -2)
    wait(f"!{D}.balls.length", 5); cdp.pump(0.5)
    left = E(f"{D}.blocks.filter(b=>b.gm.side==='red').length")
    check("the radioactive goo melted the enemy blocks", left <= 2, f"{left} of 9 left")
    look(52, 46, 1.4); cdp.pump(0.2); shot("87-melted")
    E(f"{D}.S.rolls = 5")
    shoot("burntfoxy", -5, -8); wait(f"!{D}.balls.length", 5)
    shoot("rfoxy", -5, -8); wait(f"!{D}.balls.length", 5)
    check("3 magic shots used", E(f"{D}.S.magic") == 3)
    E(f"{D}.S.pts = 0; {D}.S.act = 'dice'"); cdp.pump(0.3)
    check("a 4th magic shot is not allowed this turn", "disabled" in E("[...document.querySelectorAll('[data-a=throwmode]')].map(b=>b.disabled ? 'disabled' : 'on').join()") and "on" not in E("[...document.querySelectorAll('[data-a=throwmode]')].map(b=>b.disabled ? 'disabled' : 'on').join()"))

    # --- heads, mid-blink
    fresh([], [], [unit(k, 8 + i, 49) for i, k in enumerate(["ennard", "gfreddy", "mmangle", "cbonnie", "rfoxy"])] + [unit("endo", 1 + i, 49) for i in range(4)] + [unit("king", 20, 49)], red10())
    cdp.pump(1); look(10, 48.3, 2.2)
    url = E(f"(() => {{ {D}.units.forEach(u=>{{u.gm.blink=-0.08;}}); {D}.frameNow(); return document.getElementById('game').toDataURL('image/png'); }})()")
    open(os.path.join(HERE, "shots", "88-heads-blink.png"), "wb").write(base64.b64decode(url.split(",", 1)[1]))
    E(f"{D}.units.forEach(u=>{{u.gm.blink=3;}})"); cdp.pump(0.3); shot("88-heads-open")

    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
