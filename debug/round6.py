"""Round 6: Save Fort, shop looks (team colours, block colours, cannons), drag-to-launch Toy Bonnie, Bidybab split,
Electrobab blast, Burnt Foxy fireballs (burn wood, bounce off glass, 1 damage), Funtime Foxy, Glamrock / OMC walls.
Run:  python debug/round6.py      (screenshots in debug/shots/)
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
proc, cdp = harness.launch_chrome("chrome-fnafsiege-r6")
D = "Game.debug"; E = cdp.eval
nid = [8000]
def blk(shape, mat, c, r, **kw):
    nid[0] += 1; return {"id": nid[0], "shape": shape, "mat": mat, "c": c, "r": r, **kw}
def unit(kind, c, r):
    nid[0] += 1; return {"id": nid[0], "kind": kind, "c": c, "r": r}
def fresh(bb, rb, bu, ru, mode="hotseat"):
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop()")
    E(f"Game.start({{mode:'{mode}'}}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('field')")
    E(f"(() => {{ const S={D}.S; S.layouts.blue={{blocks:{json.dumps(bb)},units:{json.dumps(bu)}}}; S.layouts.red={{blocks:{json.dumps(rb)},units:{json.dumps(ru)}}}; }})()")
    E(f"{D}.readyUp('blue'); {D}.readyUp('red'); document.getElementById('overlay').classList.add('hidden')")
def filler(side, n=9, king=True):
    xs = range(2, 2 + n) if side == "blue" else range(74 - n, 74)
    out = [unit("endo", x, 49) for x in xs]
    if king: out.append(unit("king", 20 if side == "blue" else 58, 49))
    return out
def look(x, y, z=1.5):
    E(f"(() => {{ const d={D}; d.cam.t={{cx:{x}*40, cy:{y}*40, z:{z}}}; d.cam.cx={x}*40; d.cam.cy={y}*40; d.cam.z={z}; }})()")
def mouse(t, x, y):
    cdp.send("Input.dispatchMouseEvent", {"type": t, "x": x, "y": y, "button": "left", "buttons": 0 if t == "mouseReleased" else 1, "clickCount": 1})
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
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)
    E("localStorage.clear(); location.reload()"); cdp.pump(1.5)

    # --- Save Fort joins the Auto Fort rotation (and loads mirrored on red's side)
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('field'); {D}.S.layouts.blue = {D}.genFort('blue', {{style:'bunker'}})")
    nb = E(f"{D}.S.layouts.blue.blocks.length")
    E(f"{D}.onBar('savefort')")
    check("Save Fort stores the fort", len(E("Store.get('forts')")) == 1)
    E(f"{D}.onBar('clear')")
    found = False
    for _ in range(13):
        E(f"{D}.onBar('autofort')")
        if "My Fort 1" in E("document.getElementById('toast').textContent"): found = True; break
    check("the saved fort comes up in the Auto Fort rotation", found and E(f"{D}.S.layouts.blue.blocks.length") == nb, f"{E(f'{D}.S.layouts.blue.blocks.length')} vs {nb}")
    red = E(f"(() => {{ const L = {D}.loadFort('red', Store.get('forts')[0]); return [L.blocks.length, L.blocks.every(b=>b.c>=50), L.units.length]; }})()")
    check("it loads mirrored onto red's land too", red[0] == nb and red[1] and red[2] == 10, str(red))

    # --- shop: looks sit in the rarity sections; buying one equips it
    E("Game.stop(); Store.set('coins', 1000); UI.show('shop')"); cdp.pump(0.4)
    def buy(key):
        for _ in range(5):
            if E(f"!!document.querySelector('#shopgrid [data-key=\"{key}\"]')"): break
            E("document.getElementById('rarNext').click()"); cdp.pump(0.15)
        E(f"document.querySelector('#shopgrid [data-key=\"{key}\"]').click()"); cdp.pump(0.2)
    n = 0
    for _ in range(5):
        n += E("document.querySelectorAll('#shopgrid [data-key^=\"cannon:\"]').length"); E("document.getElementById('rarNext').click()"); cdp.pump(0.1)
    check("the shop sells 10 cannons", n == 10, str(n))
    buy("cannon:torch"); shot("70-shop-cannons")
    check("buying a cannon equips it", E("Store.get('looks').cannon") == "torch")
    for key in ("team:green", "stone:black", "wood:cherry", "glass:pink"): buy(key)
    shot("71-shop-looks")
    looks = E("Store.get('looks')")
    check("team / stone / wood / glass looks equipped", looks == {"cannon": "torch", "team": "green", "stone": "black", "wood": "cherry", "glass": "pink"}, str(looks))
    check("...and they cost their prices (70+10+40+70+70)", E("Store.get('coins')") == 1000 - 260)

    # --- the looks show in a match: blue side green, black stone, cherry wood, pink glass, the Torch
    E("UI.show('menu'); document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('field'); {D}.S.layouts.blue = {D}.genFort('blue', {{style:'pyramid', stone:0.5}}); {D}.S.layouts.red = {D}.genFort('red', {{style:'pyramid', stone:0.5}}); {D}.readyUp('blue'); {D}.readyUp('red'); document.getElementById('overlay').classList.add('hidden')")
    check("blue's team colour is green", E(f"{D}.TEAM.blue.col") == "#3ddc6a" and E(f"{D}.TEAM.blue.name") == "GREEN")
    check("red keeps red", E(f"{D}.TEAM.red.col") == "#ff4a4a")
    check("blue's blocks use the bought skins", [E(f"{D}.skinOf('blue','{m}')") for m in ("stone", "wood", "glass", "cannon")] == ["black", "cherry", "pink", "torch"])
    check("red's blocks stay default", E(f"{D}.skinOf('red','stone')") == "default")
    cdp.pump(1.5); shot("73-looks-in-battle")
    E(f"{D}.onBar('cannon')"); cdp.pump(1.2); look(-4, 46, 1.6); cdp.pump(0.3); shot("74-torch-cannon")

    # --- Toy Bonnie: grab him on a dice turn, drag back, he launches across the map
    fresh([], [], [unit("toybonnie", 5, 49)] + [unit("endo", 10 + i, 49) for i in range(8)] + [unit("king", 22, 49)], filler("red"))
    cdp.pump(1)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(7)
    cdp.pump(1.5)
    tb = uid("toybonnie")
    p = E(f"(() => {{ const u={D}.units.find(u=>u.gm.id==={tb}); const s={D}.toScreen(u.position.x,u.position.y); return [s.x,s.y]; }})()")
    mouse("mousePressed", p[0], p[1])
    for i in range(1, 13): mouse("mouseMoved", p[0] - 16 * i, p[1] + 12 * i); cdp.pump(0.02)
    shot("75-toybonnie-drag")
    check("dragging Toy Bonnie aims his launch", E(f"{D}.S.act") == "throw" and E(f"{D}.S.throwKind") == "self")
    mouse("mouseReleased", p[0] - 192, p[1] + 144); cdp.pump(0.4)
    check("he flies", E(f"{D}.balls.some(b=>b.gm.tb&&b.gm.tb.id==={tb})") is True)
    check("the launch spent the roll", E(f"{D}.S.pts") == 0 and E(f"{D}.S.rolls") == 2, f"pts {E(f'{D}.S.pts')} rolls {E(f'{D}.S.rolls')}")
    wait(f"!{D}.balls.length", 15); cdp.pump(0.5)
    c = E(f"(() => {{ const u={D}.units.find(u=>u.gm.id==={tb}); return u ? {D}.unitCell(u).c : -1; }})()")
    check("Toy Bonnie landed far across the map", c > 35, f"col {c}")

    # --- Bidybab splits into two in mid-air
    fresh([], [], [unit("bidybab", 5, 49)] + [unit("endo", 10 + i, 49) for i in range(8)] + [unit("king", 22, 49)], filler("red"))
    cdp.pump(1)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(6)
    bb = uid("bidybab")
    E(f"{D}.doAct({{t:'throwmode', id:{bb}, kind:'self'}}); {D}.doAct({{t:'throw', id:{bb}, kind:'self', vx:18, vy:-18}})")
    cdp.pump(1.2); shot("76-bidybab-split")
    check("Bidybab split in the air", E(f"{D}.balls.filter(b=>b.gm.tb&&b.gm.tb.kind==='bidybab').length") == 2)
    wait(f"!{D}.balls.length", 15); cdp.pump(0.5)
    check("two Bidybabs landed", E(f"{D}.units.filter(u=>u.gm.kind==='bidybab').length") == 2)

    # --- Electrobab blows up a big patch of the enemy fort
    rb = [blk("s11", "stone", 52 + (i % 4), 46 + i // 4) for i in range(16)]
    fresh([], rb, [unit("electrobab", 47, 47)] + [unit("endo", 2 + i, 49) for i in range(8)] + [unit("king", 20, 49)], filler("red"))
    cdp.pump(1)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(6)
    eb = uid("electrobab")
    E(f"{D}.doAct({{t:'throwmode', id:{eb}, kind:'self'}}); {D}.doAct({{t:'throw', id:{eb}, kind:'self', vx:12, vy:-2}})")
    cdp.pump(1.5)
    left = E(f"{D}.blocks.filter(b=>b.gm.side==='red').length")
    check("Electrobab's blast wiped out the stone around her", left <= 4, f"{left} of 16 left")
    check("...and she is gone", E(f"{D}.units.some(u=>u.gm.kind==='electrobab')") is False)
    look(53, 46, 1.2); cdp.pump(0.2); shot("77-electrobab")

    # --- Burnt Foxy: fireballs set wood alight, bounce off glass, do 1 damage
    fresh([], [blk("s11", "wood", 52, 49)], [unit("burntfoxy", 47, 49)] + [unit("endo", 2 + i, 49) for i in range(8)] + [unit("king", 20, 49)], filler("red"))
    cdp.pump(1)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(6)
    bf = uid("burntfoxy")
    E(f"{D}.doAct({{t:'throwmode', id:{bf}, kind:'fire'}}); {D}.doAct({{t:'throw', id:{bf}, kind:'fire', vx:10, vy:-2}})")
    check("the fireball sets the wood on fire", wait(f"{D}.blocks.some(b=>b.gm.mat==='wood'&&b.gm.burn>0)", 5))
    look(51, 47, 1.6); cdp.pump(0.3); shot("78-fire")
    check("...and the wood burns away", wait(f"!{D}.blocks.some(b=>b.gm.mat==='wood')", 12))
    fresh([], [blk("s14", "glass", 52, 45)], [unit("burntfoxy", 47, 49)] + [unit("endo", 2 + i, 49) for i in range(8)] + [unit("king", 20, 49)], filler("red"))
    cdp.pump(1)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(6)
    bf = uid("burntfoxy")
    E(f"{D}.doAct({{t:'throwmode', id:{bf}, kind:'fire'}}); {D}.doAct({{t:'throw', id:{bf}, kind:'fire', vx:12, vy:-5}})")
    back = wait(f"{D}.balls.some(b=>b.gm.fire&&b.velocity.x<0)", 4)
    check("glass bounces the fireball back", back)
    check("...and isn't hurt", E(f"{D}.blocks.filter(b=>b.gm.mat==='glass').length") == 1)
    fresh([], [], [unit("burntfoxy", 47, 49)] + [unit("endo", 2 + i, 49) for i in range(8)] + [unit("king", 20, 49)], [unit("bonnie", 52, 49)] + filler("red", 8))
    cdp.pump(1)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(6)
    bf = uid("burntfoxy")
    E(f"{D}.doAct({{t:'throwmode', id:{bf}, kind:'fire'}}); {D}.doAct({{t:'throw', id:{bf}, kind:'fire', vx:10, vy:-1}})")
    wait(f"!{D}.balls.length", 5)
    check("a fireball does 1 damage", E(f"{D}.units.find(u=>u.gm.kind==='bonnie').gm.hp") == 1)

    # --- Funtime Foxy breaks glass free; Glamrock through wood, OMC Mangle through glass
    fresh([], [blk("s11", "glass", 56, 49), blk("s11", "wood", 54, 49)], [unit("ftfoxy", 55, 49)] + [unit("endo", 2 + i, 49) for i in range(8)] + [unit("king", 20, 49)], filler("red"))
    cdp.pump(0.8)
    costs = E(f"{D}.breakTargets({D}.units.find(u=>u.gm.kind==='ftfoxy')).map(t=>[t.b.gm.mat,t.cost]).sort()")
    check("Funtime Foxy: glass free, wood still 2", costs == [["glass", 0], ["wood", 2]], str(costs))
    rb = [blk("s14", "wood", 53, 46), blk("s14", "glass", 56, 46), blk("s14", "stone", 59, 46)]
    fresh([], rb, [unit("glamrock", 54, 49), unit("omcmangle", 57, 49), unit("ppuppet", 60, 49)] + [unit("endo", 2 + i, 49) for i in range(6)] + [unit("king", 20, 49)],
          [unit("endo", 66 + i, 49) for i in range(8)] + [unit("king", 64, 49)])
    cdp.pump(0.8); E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(6)
    tg = lambda k: E(f"{D}.moveTargets({D}.units.find(u=>u.gm.kind==='{k}')).map(t=>[t.c,t.r])")
    check("Glamrock Bonnie walks through enemy wood", [52, 49] in tg("glamrock"), str(tg("glamrock")))
    check("...but not enemy glass", [56, 49] not in tg("glamrock") and [55, 49] in tg("glamrock"))
    check("OMC Mangle walks through enemy glass", [55, 49] in tg("omcmangle"), str(tg("omcmangle")))
    check("...but not enemy stone", [59, 49] not in tg("omcmangle") and [58, 49] in tg("omcmangle"))
    check("Phantom Puppet walks through enemy stone", [58, 49] in tg("ppuppet"), str(tg("ppuppet")))

    # --- heads of the new fighters, mid-blink
    fresh([], [], [unit(k, 8 + i, 49) for i, k in enumerate(["bidybab", "electrobab", "ftfoxy", "burntfoxy", "glamrock", "omcmangle"])] + [unit("endo", 2, 49), unit("endo", 3, 49), unit("endo", 4, 49), unit("king", 20, 49)], filler("red"))
    cdp.pump(1); look(10.5, 48.3, 2.2)
    url = E(f"(() => {{ {D}.units.forEach(u=>{{u.gm.blink=-0.08;}}); {D}.frameNow(); return document.getElementById('game').toDataURL('image/png'); }})()")
    open(os.path.join(HERE, "shots", "79-new-heads-blink.png"), "wb").write(base64.b64decode(url.split(",", 1)[1]))
    E(f"{D}.units.forEach(u=>{{u.gm.blink=3;}})"); cdp.pump(0.3); shot("79-new-heads-open")

    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
