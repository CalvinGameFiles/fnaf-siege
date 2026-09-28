"""Round 8: Chipper digs, Glamrock Endo's rally, DJ Music Man's throw, Festive Mangle's magic, Pitch Black Ennard's teleport.
Run:  python debug/round8.py      (screenshots in debug/shots/)
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

s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(["node", "server.js"], cwd=ROOT, env={**os.environ, "PORT": str(port)}, stdout=subprocess.DEVNULL)
time.sleep(0.8)
proc, cdp = harness.launch_chrome("chrome-fnafsiege-r8")
D = "Game.debug"; E = cdp.eval
nid = [11000]
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
def uid(kind, side="blue"): return E(f"{D}.units.find(u=>u.gm.kind==='{kind}'&&u.gm.side==='{side}').gm.id")
def U(i): return f"{D}.units.find(u=>u.gm.id==={i})"
def cell(i): return E(f"(() => {{ const u={U(i)}; return u ? [{D}.unitCell(u).c, {D}.unitCell(u).r] : null; }})()")
def tgts(i): return E(f"{D}.moveTargets({U(i)}).map(t=>[t.c,t.r])")
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)
    new = ["chipper", "gendo", "djmm", "fmangle", "pbennard"]

    # --- the five heads load, and the shop sells the five masks
    fresh([], [], [unit(k, 4 + 2 * i, 49) for i, k in enumerate(new)] + [unit("endo", 15 + i, 49) for i in range(4)] + [unit("king", 22, 49)], red10())
    cdp.pump(1.0)
    ok = E("(() => { const r = {}; for (const k of " + json.dumps(new) + ") { const im = new Image(); im.src = Game.KINDS[k].img; r[k] = Game.KINDS[k].img; } return r; })()")
    sizes = E("Promise.all(" + json.dumps(new) + ".map(k => new Promise(res => { const im = new Image(); im.onload = () => res([k, im.naturalWidth, im.naturalHeight]); im.onerror = () => res([k, 0, 0]); im.src = Game.KINDS[k].img; })))")
    check("all five heads load", all(w > 0 for _, w, _ in sizes), str(sizes))
    check("each picture matches its KINDS size", all([w, h] == [E(f"Game.KINDS['{k}'].w"), E(f"Game.KINDS['{k}'].h")] for k, w, h in sizes))
    look(9, 48.6, 1.9); cdp.pump(0.2); shot("90-new-five")
    check("the shop sells the five masks", all(E(f"!!ITEMS['{k}'] && ITEMS['{k}'].kind === '{k}'") for k in new))

    # --- Chipper digs down, tunnels under an enemy wall, and pops up behind it
    rb = [blk("s14", "stone", 56, 46)]
    fresh([], rb, [unit("chipper", 55, 49)] + [unit("endo", 2 + i, 49) for i in range(8)] + [unit("king", 20, 49)], red10())
    cdp.pump(1.0); dice(8)
    ch = uid("chipper")
    check("Chipper can step down into the earth", [55, 50] in tgts(ch) and [56, 50] in tgts(ch), str(tgts(ch)))
    E(f"{D}.doAct({{t:'move', id:{ch}, c:55, r:50}})"); cdp.pump(0.4)
    check("...and is burrowed (no physics, nothing can touch him)", E(f"(() => {{ const u={U(ch)}; return [u.gm.dig, u.isStatic, u.collisionFilter.mask]; }})()") == [True, True, 0])
    E(f"{D}.doAct({{t:'move', id:{ch}, c:56, r:51}})"); cdp.pump(0.3)
    check("he tunnels deeper", cell(ch) == [56, 51])
    check("but no deeper than 3 squares", all(r < 53 for _, r in tgts(ch)), str(tgts(ch)))
    E(f"{D}.doAct({{t:'move', id:{ch}, c:57, r:50}})"); cdp.pump(0.3)
    look(56, 49.6, 1.5); cdp.pump(0.2); shot("91-chipper-tunnel")
    check("the tunnel is drawn (3 squares dug)", E(f"{D}.S.tunnels.length") == 3)
    snap = E(f"JSON.stringify({D}.snapshot())")
    E(f"{D}.applySnapshot(JSON.parse({json.dumps(snap)}))"); cdp.pump(0.3)
    ch2 = uid("chipper")
    check("a synced snapshot keeps him burrowed and keeps the tunnel", E(f"{U(ch2)}.gm.dig") is True and E(f"{D}.S.tunnels.length") == 3)
    E(f"{D}.doAct({{t:'move', id:{ch2}, c:57, r:49}})"); cdp.pump(1.0)
    check("he pops up behind the enemy wall", cell(ch2) == [57, 49] and E(f"{U(ch2)}.gm.dig") is False and E(f"{U(ch2)}.isStatic") is False, str(cell(ch2)))
    shot("92-chipper-popped-up")
    look(10, 47, 1.5)
    e0 = E(f"{D}.units.find(u=>u.gm.kind==='endo'&&u.gm.side==='blue').gm.id")
    check("an ordinary unit can't dig", not any(r >= 50 for _, r in tgts(e0)), str(tgts(e0)))

    # --- Glamrock Endo: while he lives every unit fights invaders at home
    fresh([], [], [unit("gendo", 5, 49), unit("endo", 16, 49)] + [unit("endo", 2 + i, 49) for i in range(2)] + [unit("endo", 8 + i, 49) for i in range(5)] + [unit("king", 22, 49)],
          [unit("endo", 15, 49)] + [unit("endo", 65 + i, 49) for i in range(8)] + [unit("king", 58, 49)])
    cdp.pump(0.8)
    inv = E(f"{D}.units.find(u=>u.gm.side==='red'&&Math.floor(u.position.x/40)===15).gm.id")
    e16 = E(f"{D}.units.find(u=>u.gm.side==='blue'&&Math.floor(u.position.x/40)===16).gm.id")
    caps = lambda i: E(f"{D}.moveTargets({U(i)}).filter(t=>t.cap).map(t=>t.cap.gm.id)")
    check("with Glamrock Endo alive an ordinary Endo takes an invader at home", inv in caps(e16))
    look(12, 48.4, 1.6); cdp.pump(0.2); shot("93-gendo-rally")
    E(f"(() => {{ const u={D}.units.find(u=>u.gm.kind==='gendo'); u.gm.dead = true; }})()")
    check("once he's dead it can't any more", inv not in caps(e16))

    # --- DJ Music Man throws a comrade touching him into enemy land
    fresh([], [], [unit("djmm", 10, 49), unit("endo", 11, 49), unit("endo", 14, 49)] + [unit("endo", 2 + i, 49) for i in range(7)] + [unit("king", 22, 49)], red10())
    cdp.pump(1.0); dice(6)
    near = E(f"{D}.units.find(u=>u.gm.side==='blue'&&Math.floor(u.position.x/40)===11).gm.id")
    far = E(f"{D}.units.find(u=>u.gm.side==='blue'&&Math.floor(u.position.x/40)===14).gm.id")
    reach = E(f"{D}.djReach('blue').map(u=>u.gm.id)")
    check("DJ can reach the comrade touching him, not the one 4 squares away", near in reach and far not in reach, str(reach))
    check("the dice bar has a DJ Throw button", "DJ Throw" in E("document.getElementById('hudBar').textContent"))
    E(f"{D}.onBar('dtool', 'djpick')"); cdp.pump(0.2)
    sp = E(f"(() => {{ const u={U(near)}; const s={D}.toScreen(u.position.x, u.position.y); return [s.x, s.y]; }})()")
    E(f"{D}.tap({sp[0]}, {sp[1]})"); cdp.pump(0.3)
    check("tapping the comrade gets DJ ready to throw (and spends the roll)", E(f"[{D}.S.act, {D}.S.throwKind, {D}.S.throwBy, {D}.S.pts]") == ["throw", "dj", near, 0])
    shot("94-dj-aim")
    E(f"{D}.doAct({{t:'throw', id:{near}, kind:'dj', vx:17.5, vy:-17.5}})"); cdp.pump(0.8)
    check("the comrade flies like a cannonball", E(f"{D}.balls.some(b=>b.gm.tb && b.gm.tb.id==={near})") is True)
    shot("95-dj-throw")
    wait(f"!{D}.balls.length", 15); cdp.pump(0.5)
    c = cell(near)
    check("...and gets up in enemy land", c is not None and c[0] >= 50, str(c))

    # --- Festive Mangle's magic: through wood, kills the enemy, shoves stone over
    rb = [blk("s14", "wood", 50, 46), blk("s11", "stone", 53, 49), blk("s12", "stone", 56, 48)]
    fresh([], rb, [unit("fmangle", 40, 49)] + [unit("endo", 2 + i, 49) for i in range(8)] + [unit("king", 20, 49)],
          [unit("endo", 53, 48)] + [unit("endo", 66 + i, 49) for i in range(7)] + [unit("king", 64, 49)])
    cdp.pump(1.2); dice(6)
    target = E(f"{D}.units.find(u=>u.gm.side==='red'&&Math.floor(u.position.x/40)===53).gm.id")
    st0 = E(f"(() => {{ const b={D}.blocks.find(b=>b.gm.mat==='stone'&&b.gm.shape==='s12'); return [b.position.x, b.angle]; }})()")
    check("the dice bar offers Festive Magic", "Festive Magic" in E("document.getElementById('hudBar').textContent"))
    fm = uid("fmangle")
    E(f"{D}.doAct({{t:'throwmode', id:{fm}, kind:'festive'}}); {D}.doAct({{t:'throw', id:{fm}, kind:'festive', vx:20, vy:-4}})")
    look(50, 47, 1.4); cdp.pump(0.45); shot("96-festive-magic")
    wait(f"!{D}.balls.length", 10); cdp.pump(1.5)
    check("it went straight through the wood (wood untouched)", E(f"{D}.blocks.some(b=>b.gm.mat==='wood'&&b.gm.hp===b.gm.max)") is True)
    check("it killed the enemy it touched", E(f"!{U(target)}") is True)
    st1 = E(f"(() => {{ const b={D}.blocks.find(b=>b.gm.mat==='stone'&&b.gm.shape==='s12'); return b ? [b.position.x, b.angle] : null; }})()")
    check("it shoved the stone over", st1 is None or abs(st1[0] - st0[0]) > 10 or abs(st1[1] - st0[1]) > 0.3, f"{st0} -> {st1}")
    shot("97-festive-after")

    # --- Pitch Black Ennard teleports next to a comrade of your choice
    fresh([], [], [unit("pbennard", 3, 49), unit("endo", 45, 49)] + [unit("endo", 5 + i, 49) for i in range(7)] + [unit("king", 22, 49)], red10())
    cdp.pump(1.0); dice(7)
    pe = uid("pbennard")
    cells = E(f"{D}.teleCells({U(pe)}).map(t=>[t.c,t.r])")
    check("he can appear next to the far-off raider", [46, 49] in cells and [44, 48] in cells, str([c for c in cells if c[0] > 40]))
    check("the dice bar has a Teleport button", "Teleport" in E("document.getElementById('hudBar').textContent"))
    E(f"{D}.onBar('dtool', 'tele')"); cdp.pump(0.2)
    sp = E(f"(() => {{ const s={D}.toScreen(46.5*40, 49.5*40); return [s.x, s.y]; }})()")
    E(f"{D}.tap({sp[0]}, {sp[1]})"); cdp.pump(0.8)
    check("tapping a glowing square teleports him there", cell(pe) == [46, 49], str(cell(pe)))
    check("...and it spent the roll", E(f"[{D}.S.pts, {D}.S.rolls]") == [0, 2])
    look(45, 48.4, 1.6); cdp.pump(0.2); shot("98-ennard-teleport")

    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
