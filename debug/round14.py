"""v0.5.0: battlefield blocks shove enemies instead of crushing them; units break enemy blocks in the battlefield;
leaving a match is a loss (-10, coins can go negative); four new maps (Snowy Hill, The Jungle, Volcano Wasteland,
The Towers). Run:  python debug/round14.py      (screenshots in debug/shots/)
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
proc, cdp = harness.launch_chrome("chrome-fnafsiege-r14")
D = "Game.debug"; E = cdp.eval
nid = [60000]
def blk(shape, mat, c, r):
    nid[0] += 1; return {"id": nid[0], "shape": shape, "mat": mat, "c": c, "r": r}
def unit(kind, c, r, **kw):
    nid[0] += 1; return {"id": nid[0], "kind": kind, "c": c, "r": r, **kw}
def fresh(bb, rb, bu, ru, mp="field"):
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop()")
    E("Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('{mp}')")
    E(f"(() => {{ const S={D}.S; S.map='{mp}'; S.layouts.blue={{blocks:{json.dumps(bb)},units:{json.dumps(bu)}}}; S.layouts.red={{blocks:{json.dumps(rb)},units:{json.dumps(ru)}}}; }})()")
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
def at(side, c): return E(f"{D}.units.find(u=>u.gm.side==='{side}'&&Math.floor(u.position.x/40)==={c}).gm.id")
def cell(i): return E(f"(() => {{ const u={U(i)}; return u ? [{D}.unitCell(u).c, {D}.unitCell(u).r] : null; }})()")
blue10 = lambda: [unit("endo", 2 + i, 49) for i in range(9)] + [unit("king", 20, 49)]
red10 = lambda: [unit("endo", 64 + i, 49) for i in range(9)] + [unit("king", 74, 49)]
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)

    # --- battlefield: an enemy's falling block shoves a unit instead of crushing it (only in the battlefield)
    fresh([], [], blue10()[:8] + [unit("endo", 36, 49), unit("king", 20, 49)], [unit("endo", 40, 49), unit("endo", 60, 49)] + [unit("endo", 65 + i, 49) for i in range(7)] + [unit("king", 74, 49)])
    cdp.pump(1.0)
    rf, rh, bf = at("red", 40), at("red", 60), at("blue", 36)
    E(f"""(() => {{ const d={D};
      for (const [c, side] of [[40, 'blue'], [60, 'blue'], [36, 'blue']]) {{ const b = d.makeBlock('s11', 'stone', (c + 0.5) * 40, 40 * 40); b.gm.side = side; b.collisionFilter.category = side === 'blue' ? 0x10 : 0x20; Matter.Body.setVelocity(b, {{ x: 0, y: 12 }}); }}
    }})()""")
    cdp.pump(2.0)
    check("an enemy's block falling on a unit in the battlefield doesn't crush it", E(f"!!{U(rf)} && {U(rf)}.gm.hp === 1") is True)
    check("...it shoves it to another square instead", cell(rf) is not None and cell(rf)[0] != 40, str(cell(rf)))
    check("in the enemy's land a falling block still crushes", E(f"!{U(rh)}") is True)
    check("your OWN block falling on your unit in the battlefield still hurts", E(f"!{U(bf)}") is True)

    # --- units can break enemy blocks out in the battlefield
    fresh([], [], blue10()[:8] + [unit("endo", 36, 49), unit("king", 20, 49)], red10()); cdp.pump(0.8)
    E(f"(() => {{ const b={D}.makeBlock('s11', 'wood', 37.5*40, 49.5*40); b.gm.side='red'; b.collisionFilter.category = 0x20; }})()"); cdp.pump(0.5)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(6)
    bu = at("blue", 36)
    tg = E(f"{D}.breakTargets({U(bu)}).map(t=>[t.b.gm.mat, t.cost])")
    check("a unit in the battlefield can break an enemy block next to it", ["wood", 2] in tg, str(tg))

    # --- leaving a match costs 10 coins (and can go below 0)
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop(); Store.set('coins', 0)")
    E("Game.start({mode:'campaign', level:0}); document.getElementById('overlay').classList.add('hidden')"); cdp.pump(0.4)
    check("a match in progress is remembered", E("Store.get('activeMatch')") is True)
    E("document.getElementById('hudMenu').click()"); cdp.pump(0.2); E("document.querySelector('[data-o=quit]').click()"); cdp.pump(0.4)
    check("quitting a campaign match costs 10 coins (0 -> -10: coins can go negative)", E("Store.get('coins')") == -10 and E("Store.get('activeMatch')") is False)
    E("Game.start({mode:'campaign', level:0})"); cdp.pump(0.3)
    cdp.send("Page.reload", {}); cdp.pump(1.8)
    check("closing the app mid-match counts as leaving it (-10 more on the next start)", E("Store.get('coins')") == -20 and E("Store.get('activeMatch')") is False)
    check("the coins show as negative", "-20" in E("(UI.show('campaign'), document.querySelector('#campaign .coin-n').textContent)"))
    E("Store.set('coins', 0)")

    # --- the maps: every style stands on every new map, with all 20 units alive
    for mp in ["snow", "jungle", "wasteland", "towers"]:
        for st in (["keep", "twin", "pyramid", "castle"] if mp == "towers" else ["pyramid", "bunker", "hall", "village", "castle"]):
            E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop(); Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
            E(f"{D}.setMap('{mp}'); {D}.S.map='{mp}'; {D}.S.layouts.blue = {D}.genFort('blue', {{style:'{st}'}}); {D}.S.layouts.red = {D}.genFort('red', {{style:'{st}'}}); {D}.readyUp('blue'); {D}.readyUp('red'); document.getElementById('overlay').classList.add('hidden')")
            b0 = E(f"{D}.blocks.filter(b=>!b.gm.mover).map(b=>[b.gm.id, b.position.x, b.position.y])"); cdp.pump(3)
            b1 = {b[0]: b for b in E(f"{D}.blocks.filter(b=>!b.gm.mover).map(b=>[b.gm.id, b.position.x, b.position.y])")}
            moved = sum(1 for b in b0 if b[0] not in b1 or abs(b1[b[0]][1] - b[1]) + abs(b1[b[0]][2] - b[2]) > 8)
            n = E(f"{D}.units.length")
            check(f"{mp} / {st}: the forts stand and all 20 units are alive", moved == 0 and n == 20, f"moved {moved}, units {n}")
        E(f"(() => {{ const d={D}; d.cam.lock=false; d.cam.z=0.3; d.cam.x=-440; d.cam.y=d.H-1150; }})()"); E(f"{D}.frameNow()"); cdp.pump(0.3)
        shot(f"150-map-{mp}")

    # --- snowy hill and wasteland pit
    E(f"{D}.setMap('snow')"); g = E(f"{D}.GROUND")
    check("Snowy Hill: flat sides, a hill peaking in the middle", g[0] == 50 and g[74] == 50 and g[37] == 43 and g[30] > 43, f"{g[0]} {g[30]} {g[37]} {g[74]}")
    E(f"{D}.setMap('wasteland')"); g = E(f"{D}.GROUND")
    check("Volcano Wasteland: flat sides, a pit dipping through the middle", g[0] == 44 and g[74] == 44 and g[37] == 50 and 44 < g[31] < 50, f"{g[0]} {g[31]} {g[37]} {g[74]}")

    # --- the jungle: climb a tree trunk, stand and build on the canopy
    fresh([], [], blue10()[:8] + [unit("endo", 29, 49), unit("king", 20, 49)], red10(), mp="jungle"); cdp.pump(1.0)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(10)
    u = at("blue", 29)
    for r in range(48, 37, -1):
        E(f"{D}.S.pts = 5"); E(f"{D}.doAct({{t:'move', id:{u}, c:29, r:{r}}})"); cdp.pump(0.1)
    check("a unit climbs a jungle tree's trunk up through the canopy", cell(u) == [29, 38] and E(f"{U(u)}.gm.hang") is True, str(cell(u)))
    E(f"{D}.S.pts = 5"); E(f"{D}.doAct({{t:'move', id:{u}, c:28, r:37}})"); cdp.pump(1.0)
    check("...and steps off onto the leaves", cell(u) == [28, 37] and E(f"{U(u)}.gm.hang") is False, str(cell(u)))
    check("blocks can be built on a canopy (in the battlefield), not inside it", E(f"{D}.canRepair('wood', 31, 37)") is True and E(f"{D}.canRepair('wood', 30, 38)") is False)
    E(f"(() => {{ const d={D}; d.cam.lock=false; d.cam.z=0.9; d.cam.x=37*40-457/0.9; d.cam.y=42*40-206/0.9; }})()"); E(f"{D}.frameNow()"); cdp.pump(0.2)
    shot("151-jungle-trees")

    # --- the towers: concrete bases, clouds to cross, falling means gone
    fresh([], [], [unit("endo", 6 + i, 48) for i in range(9)] + [unit("king", 18, 48)], [unit("endo", 56 + i, 48) for i in range(9)] + [unit("king", 68, 48)], mp="towers")
    cdp.pump(1.5)
    info = E(f"[{D}.blocks.filter(b=>b.gm.mat==='concrete').length, {D}.blocks.filter(b=>b.gm.mat==='concrete').every(b=>b.isStatic), {D}.units.length]")
    check("The Towers: two 15-wide concrete bases, fixed in place, all 20 units standing on them", info == [30, True, 20], str(info))
    check("concrete is twice as strong as stone", E("(() => { const d = Game.debug; const c = d.blocks.find(b=>b.gm.mat==='concrete'); return c.gm.max; })()") == 20)
    check("on the Towers you can only build on your base", E(f"(() => {{ const S={D}.S; return 0; }})()") == 0)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(10)
    check("the dice bar offers clouds", "Cloud (2)" in E("document.getElementById('hudBar').textContent"))
    E(f"{D}.doAct({{t:'place', mat:'cloud', c:26, r:48}})"); cdp.pump(0.3)
    check("a cloud can be placed out in the battlefield (2 points)", E(f"{D}.clouds2.length") == 1 and E(f"{D}.S.pts") == 8)
    E(f"{D}.doAct({{t:'place', mat:'wood', c:26, r:47}})"); cdp.pump(1.0)
    check("...and a block built on it stays up", E(f"{D}.blocks.some(b=>b.gm.mat==='wood' && Math.abs(b.position.y - 47.5*40) < 6)") is True)
    edge = at("blue", 14)
    E(f"{D}.doAct({{t:'move', id:{edge}, c:21, r:47}})")
    E(f"(() => {{ const u={U(edge)}; Matter.Body.setPosition(u, {{ x: 22.5*40, y: 47.5*40 }}); Matter.Sleeping.set(u, false); }})()"); cdp.pump(2.5)
    check("a unit that steps off the tower falls into the clouds and is gone", E(f"!{U(edge)}") is True)
    E(f"(() => {{ const d={D}; d.cam.lock=false; d.cam.z=0.45; d.cam.x=-300; d.cam.y=d.H-600; }})()"); E(f"{D}.frameNow()"); cdp.pump(0.2)
    shot("152-towers")

    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
