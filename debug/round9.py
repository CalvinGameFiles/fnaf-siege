"""Round 9: Dust Mangle, Festive BB, the six King upgrades, the CPU's shots, and the 50-level campaign.
Run:  python debug/round9.py      (screenshots in debug/shots/)
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
    E(f"{D}.frameNow()")
    data = E("document.getElementById('game').toDataURL('image/png')")
    open(os.path.join(HERE, "shots", name + ".png"), "wb").write(base64.b64decode(data.split(",", 1)[1]))
def page_shot(name):
    r = cdp.send("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(HERE, "shots", name + ".png"), "wb").write(base64.b64decode(r["result"]["data"]))

s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(["node", "server.js"], cwd=ROOT, env={**os.environ, "PORT": str(port)}, stdout=subprocess.DEVNULL)
time.sleep(0.8)
proc, cdp = harness.launch_chrome("chrome-fnafsiege-r9")
D = "Game.debug"; E = cdp.eval
nid = [13000]
def blk(shape, mat, c, r, **kw):
    nid[0] += 1; return {"id": nid[0], "shape": shape, "mat": mat, "c": c, "r": r, **kw}
def unit(kind, c, r, **kw):
    nid[0] += 1; return {"id": nid[0], "kind": kind, "c": c, "r": r, **kw}
def fresh(bb, rb, bu, ru):
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop()")
    E("Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('field')")
    E(f"(() => {{ const S={D}.S; S.layouts.blue={{blocks:{json.dumps(bb)},units:{json.dumps(bu)}}}; S.layouts.red={{blocks:{json.dumps(rb)},units:{json.dumps(ru)}}}; }})()")
    E(f"{D}.readyUp('blue'); {D}.readyUp('red'); document.getElementById('overlay').classList.add('hidden')")
def blue8(x0=2): return [unit("endo", x0 + i, 49) for i in range(8)]
def red10(): return [unit("endo", 66 + i, 49) for i in range(8)] + [unit("king", 64, 49)]
def look(x, y, z=1.5):
    E(f"(() => {{ const d={D}; d.cam.lock=false; d.cam.t=null; d.cam.z={z}; d.cam.x={x}*40-915/2/{z}; d.cam.y={y}*40-412/2/{z}; }})()")
def roll(v):
    E(f"{D}.doAct({{t:'roll', v:{v}}})")
    for _ in range(25):
        if E(f"{D}.S.rolling") == 0: break
        cdp.pump(0.2)
def dice(v=8):
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(v)
def wait(cond, t=20):
    end = time.time() + t
    while time.time() < end:
        if E(cond): return True
        cdp.pump(0.25)
    return False
def U(i): return f"{D}.units.find(u=>u.gm.id==={i})"
def uid(kind, side="blue"): return E(f"{D}.units.find(u=>(u.gm.up||u.gm.kind)==='{kind}'&&u.gm.side==='{side}').gm.id")
def cell(i): return E(f"(() => {{ const u={U(i)}; return u ? [{D}.unitCell(u).c, {D}.unitCell(u).r] : null; }})()")
def tgts(i): return E(f"{D}.moveTargets({U(i)}).map(t=>[t.c,t.r])")
def bar(): return E("document.getElementById('hudBar').textContent")
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)
    new = ["dmangle", "fbb", "books", "blfreddy", "dread", "molten", "funtime", "unknown"]

    # --- heads + shop
    sizes = E("Promise.all(" + json.dumps(new) + ".map(k => new Promise(res => { const im = new Image(); im.onload = () => res([k, im.naturalWidth, im.naturalHeight]); im.onerror = () => res([k, 0, 0]); im.src = Game.KINDS[k].img; })))")
    check("all eight heads load at their KINDS size", all(w == E(f"Game.KINDS['{k}'].w") and h == E(f"Game.KINDS['{k}'].h") for k, w, h in sizes), str(sizes))
    check("the shop sells all eight", all(E(f"!!ITEMS['{k}']") for k in new))
    check("the six King upgrades are marked as King items", all(E(f"!!ITEMS['{k}'].king && Game.KINDS['{k}'].kingUp") for k in new[2:]))

    # --- Dust Mangle: launched into red land, red's rolls are halved while she's there
    fresh([], [], [unit("dmangle", 10, 49)] + blue8(12)[:7] + [unit("king", 22, 49)], red10())
    cdp.pump(1.0); dice(6)
    dm = uid("dmangle")
    E(f"{D}.doAct({{t:'throwmode', id:{dm}, kind:'self'}}); {D}.doAct({{t:'throw', id:{dm}, kind:'self', vx:17.5, vy:-17.5}})")
    wait(f"!{D}.balls.length", 15); cdp.pump(0.6)
    c = cell(dm)
    check("Dust Mangle landed in red land", c is not None and c[0] >= 50, str(c))
    check("red is dusted", E(f"{D}.dusted('red')") is True and E(f"{D}.dusted('blue')") is False)
    look(62, 48.4, 1.1); cdp.pump(0.2); shot("100-dust-mangle")
    E(f"{D}.doAct({{t:'endturn'}})"); wait(f"{D}.S.turn==='red' && {D}.S.act==='choose'", 20); cdp.pump(0.3)
    check("red's turn bar warns about the dust", "cut in half" in bar())
    dice(9)
    check("red rolled a 9 and got 5 points", E(f"{D}.S.pts") == 5, str(E(f"{D}.S.pts")))

    # --- Festive BB can't be crushed (an Endo next to him is)
    fresh([blk("s11", "stone", 10, 42), blk("s11", "stone", 13, 42)], [], [unit("fbb", 10, 49), unit("endo", 13, 49)] + blue8(0)[:2] + blue8(15)[:5] + [unit("king", 22, 49)], red10())
    fb, e13 = uid("fbb"), E(f"{D}.units.find(u=>u.gm.side==='blue'&&Math.floor(u.position.x/40)===13).gm.id")
    cdp.pump(3.5)
    check("a falling stone didn't hurt Festive BB", E(f"!!{U(fb)} && {U(fb)}.gm.hp === 1") is True)
    check("...but crushed the Endo beside him", E(f"!{U(e13)}") is True)
    look(11, 48.4, 1.8); cdp.pump(0.2); shot("101-festive-bb")

    # --- Books Freddy: 3 hearts
    fresh([], [], blue8() + [unit("endo", 12, 49), unit("king", 20, 49, up="books")], red10())
    cdp.pump(0.8)
    k = uid("books")
    check("Books Freddy's King has 3 hearts", E(f"[{U(k)}.gm.kind, {U(k)}.gm.hp, {U(k)}.gm.mhp]") == ["king", 3, 3])
    look(18, 48.2, 2.0); cdp.pump(0.2); shot("102-books-freddy")

    # --- Black Light Freddy: the blue cannonball smashes stone, stops at wood
    rb = [blk("s14", "stone", 52, 46), blk("s14", "wood", 57, 46)]
    fresh([], rb, blue8() + [unit("king", 40, 49, up="blfreddy")], red10())
    cdp.pump(1.2); dice(6)
    check("the dice bar offers the Blue Cannonball", "Blue Cannonball" in bar())
    k = uid("blfreddy")
    E(f"{D}.doAct({{t:'throwmode', id:{k}, kind:'blue'}}); {D}.doAct({{t:'throw', id:{k}, kind:'blue', vx:25, vy:-3}})")
    look(50, 47.5, 1.3); cdp.pump(0.5); shot("103-blue-cannonball")
    wait(f"!{D}.balls.length", 10); cdp.pump(0.5)
    check("it smashed through the stone", E(f"!{D}.blocks.some(b=>b.gm.mat==='stone')") is True)
    check("...and couldn't break the wood", E(f"{D}.blocks.some(b=>b.gm.mat==='wood'&&b.gm.hp===b.gm.max)") is True)

    # --- Dread Bear: only crushing hurts him; once a match he gives a unit 3 hearts
    fresh([], [], blue8() + [unit("king", 14, 49, up="dread")], [unit("endo", 15, 49)] + [unit("endo", 66 + i, 49) for i in range(7)] + [unit("king", 64, 49)])
    cdp.pump(0.8)
    k = uid("dread")
    E(f"{D}.damageUnit({U(k)}, 3, 'cannon'); {D}.damageUnit({U(k)}, 1, 'fire')")
    check("cannonballs and shots don't hurt Dread Bear", E(f"{U(k)}.gm.hp") == 2)
    inv = E(f"{D}.units.find(u=>u.gm.side==='red'&&Math.floor(u.position.x/40)===15).gm.id")
    check("an invader next to him can't attack him", [14, 49] not in tgts(inv), str(tgts(inv)))
    E(f"{D}.damageUnit({U(k)}, 1, 'crush')")
    check("...but a falling block does", E(f"{U(k)}.gm.hp") == 1)
    dice(5)
    check("the dice bar offers his 3 Hearts gift", "3 Hearts" in bar())
    e4 = E(f"{D}.units.find(u=>u.gm.side==='blue'&&Math.floor(u.position.x/40)===4).gm.id")
    E(f"{D}.onBar('dtool','bless')")
    sp = E(f"(() => {{ const u={U(e4)}; const s={D}.toScreen(u.position.x,u.position.y); return [s.x,s.y]; }})()")
    E(f"{D}.tap({sp[0]}, {sp[1]})"); cdp.pump(0.4)
    check("tapping an Endo gives it 3 hearts", E(f"[{U(e4)}.gm.hp, {U(e4)}.gm.mhp]") == [3, 3])
    check("...only once a match", "3 Hearts" not in bar() and E(f"{U(k)}.gm.blessed") is True)
    look(6, 48.2, 1.8); cdp.pump(0.2); shot("104-dread-bear")

    # --- Molten Freddy: launches himself, walks through any enemy one-block wall
    fresh([], [blk("s14", "stone", 56, 46)], blue8() + [unit("king", 55, 49, up="molten")], red10())
    cdp.pump(0.8); dice(6)
    k = uid("molten")
    check("Molten Freddy walks through enemy stone", [57, 49] in tgts(k), str(tgts(k)))
    E(f"{D}.doAct({{t:'endroll'}}); {D}.doAct({{t:'endturn'}})"); wait(f"{D}.S.turn==='red'", 20)
    E(f"{D}.onBar('dice'); {D}.onBar('endturn')"); wait(f"{D}.S.turn==='blue' && {D}.S.act==='choose'", 20)
    E(f"{D}.onBar('cannon')"); cdp.pump(0.3)
    check("the cannon offers Molten Freddy as ammo", "Molten Freddy" in bar())
    E(f"{D}.onBar('ammo','molten'); {D}.doAct({{t:'shot', vx:-6, vy:-12, tb:{k}}})"); cdp.pump(0.6)
    check("the King flies as the cannonball", E(f"{D}.balls.some(b=>b.gm.tb && b.gm.tb.id==={k})") is True)
    wait(f"!{D}.balls.length", 15); cdp.pump(0.4)
    check("...and gets up still a King in Molten Freddy's mask", E(f"(() => {{ const u={U(k)}; return u ? [u.gm.kind, u.gm.up] : null; }})()") == ["king", "molten"])

    # --- Funtime Freddy: revive, wreck the cannon, explode in enemy land
    fresh([], [blk("s14", "stone", 72, 46)], blue8() + [unit("king", 20, 49, up="funtime")], [unit("endo", 60 + i, 49) for i in range(8)] + [unit("king", 58, 49)])
    cdp.pump(0.8)
    k = uid("funtime")
    e2 = E(f"{D}.units.find(u=>u.gm.side==='blue'&&u.gm.kind==='endo').gm.id")
    E(f"{D}.damageUnit({U(e2)}, 1, 'test')"); cdp.pump(0.3)
    n0 = E(f"{D}.units.filter(u=>u.gm.side==='blue').length")
    check("the fallen Endo is in the graves", E(f"{D}.S.graves.blue.length") == 1)
    check("the turn bar offers a revive", "\u267B" in bar() or E("!!document.querySelector('[data-a=revive]')") is True)
    E("document.querySelector('[data-a=revive]').click()"); cdp.pump(0.5)
    check("the Endo is back, next to Funtime Freddy", E(f"{D}.units.filter(u=>u.gm.side==='blue').length") == n0 + 1 and E(f"{D}.S.graves.blue.length") == 0)
    check("...it cost the cannon: now it's the dice", E(f"[{D}.S.act, {D}.S.rolls]") == ["dice", 3])
    look(19, 48.2, 1.8); cdp.pump(0.2); shot("105-funtime-revive")
    E(f"(() => {{ const u={U(k)}; Matter.Body.setPosition(u, {{x:73.5*40, y:49.5*40}}); }})()"); cdp.pump(0.5)
    roll(6)
    E(f"{D}.doAct({{t:'move', id:{k}, c:74, r:49}})"); cdp.pump(0.5)
    check("Funtime Freddy at the far edge wrecks red's cannon", E(f"{D}.S.cannonDown.red") is True)
    E(f"{D}.damageUnit({U(k)}, 2, 'test')"); cdp.pump(0.5)
    check("killed in red land, he explodes (red's stone next to him is gone)", E(f"!{D}.blocks.some(b=>b.gm.mat==='stone')") is True)
    look(70, 47.5, 1.2); cdp.pump(0.1); shot("106-funtime-boom")

    # --- Unidentified Freddy: a random ability every match, never the same twice running
    abs_ = []
    for _ in range(3):
        fresh([], [], blue8() + [unit("king", 20, 49, up="unknown")], red10())
        cdp.pump(0.4)
        k = uid("unknown")
        abs_.append(E(f"{U(k)}.gm.ab"))
    names = E("Object.keys(Game.ABILITIES)")
    check("Unidentified Freddy gets a real ability each match", all(a in names for a in abs_), str(abs_))
    check("...a different one each time", abs_[0] != abs_[1] and abs_[1] != abs_[2], str(abs_))
    give = E(f"Game.ABILITIES['{abs_[2]}'].give")
    kd = E(f"{D}.kd({U(k)})")
    check("...and he really has it", all(kd.get(x) == y for x, y in give.items()), f"{abs_[2]} {give}")
    look(20, 48.2, 2.0); cdp.pump(0.2); shot("107-unidentified")

    # --- the CPU fires its shooters' shots
    fresh([], [], [unit("burntfoxy", 40, 49)] + blue8()[:7] + [unit("king", 20, 49)], red10())
    cdp.pump(0.8)
    E(f"{D}.doAct({{t:'mode', v:'dice'}}); {D}.S.cpu='blue'")
    ok = E(f"{D}.cpuShoot()"); E(f"{D}.S.cpu=null")
    check("the CPU can aim and fire a shooter's shot", ok is True and E(f"{D}.balls.some(b=>b.gm.shot==='fire')") is True)

    # --- 50 levels, growing armies
    L = E(f"{D}.LEVELS.map(l => [l.name, (l.kinds||[]).length, l.king||null, new Set(l.kinds||[]).size])")
    check("there are 50 levels", len(L) == 50)
    check("level 1 is Endos only", L[0][1] == 0 and L[0][2] is None)
    check("level 2 has 1 mask", L[1][1] == 1)
    check("mask counts never go down", all(L[i][1] <= L[i + 1][1] for i in range(49)))
    check("different masks appear, then 2+ masks", any(l[3] >= 2 for l in L[11:20]) and L[10][1] >= 2)
    check("King upgrades start around level 20", all(l[2] is None for l in L[:19]) and all(l[2] for l in L[29:]))
    check("level 50: 9 masks and Dread Bear", L[49][1] == 9 and L[49][2] == "dread", str(L[49]))
    E("Game.running && Game.stop(); Store.set('beaten', Array.from({length: 49}, (_, i) => i + 1)); UI.show('campaign')"); cdp.pump(0.4)
    check("the campaign shows 10 levels a page", E("document.querySelectorAll('#levels .lvl').length") == 10 and "1-10" in E("document.getElementById('lvlPage').textContent"))
    for _ in range(4): E("document.getElementById('lvlNext').click()")
    cdp.pump(0.2)
    check("...and pages through to 41-50", "41-50" in E("document.getElementById('lvlPage').textContent"))
    E("document.querySelectorAll('#levels .lvl')[9].click()"); cdp.pump(0.3)
    check("level 50's line-up is shown (King, 9 masks, cannonball power)", E("document.querySelectorAll('#lvlInfo .lineup img').length") == 11)
    page_shot("108-campaign-50")

    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
