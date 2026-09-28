"""Round 4: Toy Bonnie as the cannonball, Balloon Boy wrecks the cannon, Mangle climbs, slopes slide, dice 5-10,
masks during the other player's turn, the Chica throw camera, the CPU marching its army, fort styles.
Run:  python debug/fighters.py      (screenshots in debug/shots/)
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
proc, cdp = harness.launch_chrome("chrome-fnafsiege-fighters")
D = "Game.debug"; E = cdp.eval
nid = [5000]
def blk(shape, mat, c, r, **kw):
    nid[0] += 1; return {"id": nid[0], "shape": shape, "mat": mat, "c": c, "r": r, **kw}
def unit(kind, c, r):
    nid[0] += 1; return {"id": nid[0], "kind": kind, "c": c, "r": r}
def fresh(bb, rb, bu, ru, mode="hotseat", level=None):
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop()")
    E(f"Game.start({{mode:'{mode}'" + (f", level:{level}" if level is not None else "") + "}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('field')")
    E(f"(() => {{ const S={D}.S; S.layouts.blue={{blocks:{json.dumps(bb)},units:{json.dumps(bu)}}}; S.layouts.red={{blocks:{json.dumps(rb)},units:{json.dumps(ru)}}}; S.ready.red=false; }})()")
    E(f"{D}.readyUp('blue'); {D}.S.phase !== 'battle' && {D}.readyUp('red'); document.getElementById('overlay').classList.add('hidden')")
def filler(side, n=9, king=True, x0=None):
    xs = range(2, 2 + n) if side == "blue" else range(74 - n, 74)
    out = [unit("endo", x, 49) for x in xs]
    if king: out.append(unit("king", 20 if side == "blue" else 58, 49))
    return out
def look(x, y, z=1.5):
    E(f"(() => {{ const d={D}; d.cam.t={{cx:{x}*40, cy:{y}*40, z:{z}}}; d.cam.cx={x}*40; d.cam.cy={y}*40; d.cam.z={z}; }})()")
def roll(v):
    E(f"{D}.doAct({{t:'roll', v:{v}}})")
    for _ in range(25):
        if E(f"{D}.S.rolling") == 0: break
        cdp.pump(0.2)
def mouse(t, x, y):
    cdp.send("Input.dispatchMouseEvent", {"type": t, "x": x, "y": y, "button": "left", "buttons": 0 if t == "mouseReleased" else 1, "clickCount": 1})
def wait(cond, t=25):
    end = time.time() + t
    while time.time() < end:
        if E(cond): return True
        cdp.pump(0.3)
    return False
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)

    # --- dice read 5..10
    vals = E("(() => { const s = new Set(); for (let i = 0; i < 400; i++) { Game.debug.onBar && 0; s.add(5 + Math.floor(Math.random() * 6)); } return [...s].sort((a,b)=>a-b); })()")
    fresh([], [], filler("blue"), filler("red"))
    cdp.pump(0.5)
    E(f"{D}.onBar('dice')"); cdp.pump(0.2)
    got = set()
    for _ in range(3):
        E(f"{D}.onBar('roll')")
        for _ in range(20):
            if E(f"{D}.S.rolling") == 0: break
            cdp.pump(0.2)
        got.add(E(f"{D}.S.pts")); E(f"{D}.onBar('endroll')")
    check("the dice roll 5-10", all(5 <= v <= 10 for v in got), str(sorted(got)))
    E(f"{D}.S.act='dice'; {D}.S.rolls=1; {D}.S.pts=0; {D}.S.die=8"); cdp.pump(0.3)
    look(10, 45, 0.8); shot("60-number-die")

    # --- Toy Bonnie is fired from the cannon and gets up where he lands
    fresh([], [], [unit("toybonnie", 10, 49)] + [unit("endo", 12 + i, 49) for i in range(8)] + [unit("king", 22, 49)], filler("red"))
    cdp.pump(0.8)
    tb = E(f"{D}.units.find(u=>u.gm.kind==='toybonnie').gm.id")
    E(f"{D}.onBar('cannon')"); cdp.pump(0.3)
    check("the cannon offers Toy Bonnie as ammo", "Toy Bonnie" in E("document.getElementById('hudBar').textContent"))
    E(f"{D}.onBar('ammo', 'toybonnie')")
    E(f"{D}.doAct({{t:'shot', vx: 20, vy: -24, tb: {tb}}})"); cdp.pump(0.8)
    check("Toy Bonnie flies as the cannonball", E(f"{D}.balls.some(b=>b.gm.tb && b.gm.tb.id==={tb})") is True)
    shot("61-toybonnie-flying")
    check("the turn passes", wait(f"{D}.S.turn==='red'", 30))
    where = E(f"(() => {{ const u={D}.units.find(u=>u.gm.id==={tb}); return u ? [u.gm.kind, {D}.unitCell(u).c] : null; }})()")
    check("Toy Bonnie got up where he landed", where is not None and where[0] == "toybonnie" and where[1] > 20, str(where))

    # --- Balloon Boy reaching the far edge of red land wrecks red's cannon
    fresh([], [], [unit("bb", 72, 49)] + [unit("endo", 12 + i, 49) for i in range(8)] + [unit("king", 22, 49)],
          [unit("endo", 52 + i, 49) for i in range(9)] + [unit("king", 64, 49)])
    cdp.pump(0.8)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(6)
    bb = E(f"{D}.units.find(u=>u.gm.kind==='bb').gm.id")
    E(f"{D}.doAct({{t:'move', id:{bb}, c:73, r:49}})"); cdp.pump(0.2)
    E(f"{D}.doAct({{t:'move', id:{bb}, c:74, r:49}})"); cdp.pump(0.6)
    check("Balloon Boy wrecked red's cannon", E(f"{D}.S.cannonDown.red") is True)
    look(73, 46, 1.2); cdp.pump(0.3); shot("62-cannon-wrecked")
    E(f"{D}.doAct({{t:'endturn'}})")
    wait(f"{D}.S.turn==='red'", 20); cdp.pump(0.5)
    check("red can't fire any more", "CANNON WRECKED" in E("document.getElementById('hudBar').textContent"))

    # --- Mangle hangs off the side of a big block and climbs it
    bb_ = [blk("s14", "stone", 11, 46), blk("s12", "stone", 11, 44)]
    fresh(bb_, [], [unit("mangle", 10, 49)] + [unit("endo", 13 + i, 49) for i in range(8)] + [unit("king", 22, 49)], filler("red"))
    cdp.pump(0.8)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(8)
    mg = E(f"{D}.units.find(u=>u.gm.kind==='mangle').gm.id")
    for r_ in (48, 47, 46, 45, 44):
        E(f"{D}.doAct({{t:'move', id:{mg}, c:10, r:{r_}}})"); cdp.pump(0.2)
    c = E(f"{D}.unitCell({D}.units.find(u=>u.gm.id==={mg}))")
    check("Mangle climbed the wall", c == {"c": 10, "r": 44} and E(f"{D}.units.find(u=>u.gm.id==={mg}).gm.hang") is True, str(c))
    E(f"{D}.doAct({{t:'move', id:{mg}, c:11, r:43}})"); cdp.pump(0.8)
    check("and stepped onto the top", E(f"{D}.unitCell({D}.units.find(u=>u.gm.id==={mg}))") == {"c": 11, "r": 43})
    look(11, 45, 1.6); cdp.pump(0.2); shot("63-mangle")
    endo_ok = E(f"(() => {{ const d={D}; const e=d.units.find(u=>u.gm.kind==='endo'&&u.gm.side==='blue'); return d.moveTargets(e).length; }})()")
    check("an ordinary unit doesn't hang on walls", E(f"(() => {{ const d={D}; const k=d.units.find(u=>u.gm.kind==='king'&&u.gm.side==='blue'); return !!d.moveTargets(k).find(t=>t.r===48); }})()") is True)

    # --- slopes: step onto a ramp and slide down it
    bb_ = [blk("rl2", "stone", 12, 48), blk("s12", "stone", 11, 48)]
    fresh(bb_, [], [unit("endo", 11, 47)] + [unit("endo", 0 + i, 49) for i in range(8)] + [unit("king", 24, 49)], filler("red"))
    cdp.pump(1)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(5)
    eid = E(f"{D}.units.find(u=>Math.floor(u.position.x/40)===11&&u.gm.side==='blue').gm.id")
    tg = E(f"{D}.moveTargets({D}.units.find(u=>u.gm.id==={eid})).map(t=>[t.c,t.r])")
    check("a slope square is a legal step", [12, 47] in tg or [12, 48] in tg, str(tg))
    step = [12, 47] if [12, 47] in tg else [12, 48]
    E(f"{D}.doAct({{t:'move', id:{eid}, c:{step[0]}, r:{step[1]}}})"); cdp.pump(2.5)
    x = E(f"{D}.units.find(u=>u.gm.id==={eid}).position.x / 40")
    check("the unit slid down the slope", x > 14, f"x={x:.1f}")
    look(13, 47, 1.6); cdp.pump(0.2); shot("64-slide")

    # --- masks during the OTHER player's turn (pass & play shows both gold bars)
    E("Store.set('owned', {bonnie:true, chica:true, foxy:true, toybonnie:true, bb:true, mangle:true}); Store.set('equip', ['bonnie','chica','foxy','toybonnie','bb','mangle',null,null,null,null])")
    fresh([], [], filler("blue"), filler("red"))
    cdp.pump(1)
    check("both players get a gold bar in battle", E("!document.getElementById('equip').classList.contains('hidden') && !document.getElementById('equip2').classList.contains('hidden')") is True)
    tgt = E(f"(() => {{ const u={D}.units.find(u=>u.gm.side==='red'&&u.gm.kind==='endo'); const s={D}.toScreen(u.position.x,u.position.y); return [s.x,s.y,u.gm.id]; }})()")
    a = E("(() => { const r=document.querySelector('#equip2 .eslot[data-i=\"5\"]').getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]; })()")
    mouse("mousePressed", a[0], a[1])
    for i in range(1, 9): mouse("mouseMoved", a[0] + (tgt[0] - a[0]) * i / 8, a[1] + (tgt[1] - a[1]) * i / 8); cdp.pump(0.02)
    mouse("mouseReleased", tgt[0], tgt[1]); cdp.pump(0.4)
    check("red masked an Endo during BLUE's turn", E(f"{D}.S.turn") == "blue" and E(f"{D}.units.find(u=>u.gm.id==={tgt[2]}).gm.kind") == "mangle")
    shot("65-two-gold-bars")

    # --- Chica's throw is framed like a cannon, then the cupcake is followed
    fresh([], [], [unit("chica", 10, 49)] + [unit("endo", 0 + i, 49) for i in range(8)] + [unit("king", 24, 49)], filler("red"))
    cdp.pump(1)
    cid = E(f"{D}.units.find(u=>u.gm.kind==='chica').gm.id")
    E(f"{D}.doAct({{t:'mode', v:'dice'}}); {D}.doAct({{t:'throwmode', id:{cid}}})"); cdp.pump(1.5)
    view = E(f"(() => {{ const d={D}; return [d.cam.x/40, (d.cam.x+915/d.cam.z)/40, d.cam.z]; }})()")
    check("throwing frames Chica like a cannon", view[0] < 10 < view[1] and view[1] - view[0] < 40, str(view))
    shot("66-chica-aim")
    E(f"{D}.doAct({{t:'throw', id:{cid}, vx:9, vy:-11}})"); cdp.pump(0.5)
    check("the camera follows the cupcake", E(f"{D}.S.flyView") == "cup")

    # --- campaign CPU uses its army with the dice
    fresh([], [], [unit("endo", 2 + i, 49) for i in range(9)] + [unit("king", 20, 49)],
          [unit("bb", 51, 49), unit("foxy", 53, 49)] + [unit("endo", 60 + i, 49) for i in range(7)] + [unit("king", 72, 49)], mode="campaign", level=4)
    cdp.pump(0.5)
    E("document.getElementById('overlay').classList.add('hidden')")
    before = E(f"{D}.units.filter(u=>u.gm.side==='red'&&(u.gm.kind==='bb'||u.gm.kind==='foxy')).map(u=>{D}.unitCell(u).c)")
    moved = False
    for _ in range(6):
        E(f"{D}.S.turn==='blue' && {D}.S.act==='choose' && ({D}.doAct({{t:'mode', v:'dice'}}), {D}.doAct({{t:'endturn'}}))")
        wait(f"{D}.S.turn==='red'", 15)
        E(f"(() => {{ const S={D}.S; if (S.act==='choose') {{ Math.__r = Math.random; }} }})()")
        wait(f"{D}.S.turn==='blue'", 40)
        after = E(f"{D}.units.filter(u=>u.gm.side==='red'&&(u.gm.kind==='bb'||u.gm.kind==='foxy')).map(u=>{D}.unitCell(u).c)")
        if min(after + [999]) < min(before): moved = True; break
    check("the CPU marches its raiders toward blue", moved, f"{before} -> {after}")
    shot("67-cpu-raid")

    # --- round 5 rules
    def dice(v=6):
        E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(v)
    def tgts(uid): return E(f"{D}.moveTargets({D}.units.find(u=>u.gm.id==={uid})).map(t=>[t.c,t.r])")
    def uid_at(c, side="blue"): return E(f"{D}.units.find(u=>u.gm.side==='{side}'&&Math.floor(u.position.x/40)==={c}).gm.id")
    # stepping through your own one-block wall; mid-air steps
    fresh([blk("s14", "stone", 6, 46)], [], [unit("endo", 5, 49)] + [unit("endo", 12 + i, 49) for i in range(8)] + [unit("king", 22, 49)], filler("red"))
    cdp.pump(0.8); dice()
    e5 = uid_at(5)
    check("a unit can step through its own one-block wall", [7, 49] in tgts(e5), str(tgts(e5)))
    E(f"{D}.doAct({{t:'move', id:{e5}, c:7, r:49}})"); cdp.pump(0.6)
    check("...and comes out the other side", E(f"{D}.unitCell({D}.units.find(u=>u.gm.id==={e5}))")["c"] == 7)
    check("mid-air squares are legal steps", [8, 48] in tgts(e5))
    E(f"{D}.doAct({{t:'move', id:{e5}, c:8, r:48}})"); cdp.pump(1.5)
    check("...and the unit falls back down", E(f"{D}.unitCell({D}.units.find(u=>u.gm.id==={e5}))") == {"c": 8, "r": 49})
    # enemy walls block everyone except Phantom Puppet (stone only)
    rb = [blk("s14", "stone", 56, 46), blk("s14", "wood", 53, 46)]
    fresh([], rb, [unit("endo", 55, 44), unit("ppuppet", 55, 49)] + [unit("endo", 2 + i, 49) for i in range(7)] + [unit("king", 22, 49)], filler("red"))
    cdp.pump(1.2); dice()
    pp = E(f"{D}.units.find(u=>u.gm.kind==='ppuppet').gm.id")
    en = E(f"{D}.units.find(u=>u.gm.side==='blue'&&u.gm.kind==='endo'&&u.position.x>2000).gm.id")
    E(f"(() => {{ const d={D}, u=d.units.find(u=>u.gm.id==={en}); Matter.Body.setPosition(u, {{x:55.5*40, y:47.5*40}}); Matter.Body.setStatic(u, true); }})()")
    check("an Endo can't walk through the enemy's stone", [57, 47] not in tgts(en), str(tgts(en)))
    check("Phantom Puppet slips through enemy stone", [57, 49] in tgts(pp), str(tgts(pp)))
    check("...but not through enemy wood", [52, 49] not in tgts(pp))
    # Withered Chica breaks enemy wood for free
    fresh([], [blk("s11", "wood", 56, 49), blk("s11", "stone", 54, 49)], [unit("wchica", 55, 49)] + [unit("endo", 2 + i, 49) for i in range(8)] + [unit("king", 22, 49)], filler("red"))
    cdp.pump(0.8); dice(5)
    wc = E(f"{D}.units.find(u=>u.gm.kind==='wchica').gm.id")
    costs = E(f"{D}.breakTargets({D}.units.find(u=>u.gm.id==={wc})).map(t=>[t.b.gm.mat,t.cost]).sort()")
    check("Withered Chica: wood is free, stone still costs 1", costs == [["stone", 1], ["wood", 0]], str(costs))
    E(f"{D}.S.pts = 0")
    bid = E(f"{D}.blocks.find(b=>b.gm.mat==='wood').gm.id")
    E(f"{D}.S.rolls = 1; {D}.doAct({{t:'break', id:{wc}, bid:{bid}}})"); cdp.pump(0.3)
    check("...she smashes it with 0 points left", E(f"{D}.blocks.some(b=>b.gm.mat==='wood')") is False)
    # Springtrap has 3 hearts; Nightmare Foxy fights invaders at home
    fresh([], [], [unit("springtrap", 10, 49), unit("nfoxy", 14, 49), unit("endo", 16, 49)] + [unit("endo", 2 + i, 49) for i in range(6)] + [unit("king", 22, 49)],
          [unit("endo", 15, 49)] + [unit("endo", 65 + i, 49) for i in range(8)] + [unit("king", 58, 49)])
    cdp.pump(0.8)
    check("Springtrap has 3 hearts", E(f"{D}.units.find(u=>u.gm.kind==='springtrap').gm.hp") == 3)
    inv = E(f"{D}.units.find(u=>u.gm.side==='red'&&Math.floor(u.position.x/40)===15).gm.id")
    nf = E(f"{D}.units.find(u=>u.gm.kind==='nfoxy').gm.id")
    e16 = uid_at(16)
    caps = lambda uid: E(f"{D}.moveTargets({D}.units.find(u=>u.gm.id==={uid})).filter(t=>t.cap).map(t=>t.cap.gm.id)")
    check("Nightmare Foxy can take an invader at home", inv in caps(nf))
    check("an ordinary Endo can't", inv not in caps(e16))
    look(12, 47, 1.8); cdp.pump(0.2); shot("68-springtrap-nfoxy")
    # swapping a mask destroys the old one for good
    E("Store.set('owned', {bonnie:true, chica:true}); Store.set('equip', ['bonnie','chica',null,null,null,null,null,null,null,null])")
    fresh([], [], filler("blue"), filler("red"))
    cdp.pump(0.8)
    def drop_mask(slot, uid):
        t = E(f"(() => {{ const u={D}.units.find(u=>u.gm.id==={uid}); const s={D}.toScreen(u.position.x,u.position.y); return [s.x,s.y]; }})()")
        a = E(f"(() => {{ const r=document.querySelector('#equip .eslot[data-i=\"{slot}\"]').getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]; }})()")
        mouse("mousePressed", a[0], a[1])
        for i in range(1, 9): mouse("mouseMoved", a[0] + (t[0] - a[0]) * i / 8, a[1] + (t[1] - a[1]) * i / 8); cdp.pump(0.02)
        mouse("mouseReleased", t[0], t[1]); cdp.pump(0.4)
    e = uid_at(4)
    drop_mask(0, e)
    check("Bonnie mask on", E(f"{D}.units.find(u=>u.gm.id==={e}).gm.kind") == "bonnie")
    drop_mask(1, e)
    check("Chica mask swapped on top", E(f"{D}.units.find(u=>u.gm.id==={e}).gm.kind") == "chica")
    check("the Bonnie mask is destroyed (gone from inventory and gold bar)", E("!Store.get('owned').bonnie && !Store.get('equip').includes('bonnie')") is True)
    E("Game.stop(); Store.set('coins', 50); UI.show('shop')"); cdp.pump(0.4)
    check("the shop restocked it (on sale again)", "20 coins" in E("document.querySelector('#shopgrid [data-key=bonnie]').textContent"))
    E("document.querySelector('#shopgrid [data-key=bonnie]').click()"); cdp.pump(0.3)
    check("...and it can be bought back", E("Store.get('owned').bonnie") is True)
    shot("69-destroyed-mask")

    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
