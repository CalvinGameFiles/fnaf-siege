"""v0.3.0: a loss costs 10 coins, RED / BLUE team colours in the shop (the other player switches), and the cannon looks'
kill effects + powers (Frost freeze, Red Samurai, The Torch, Blue Storm, Shadow Phantom Boom).
Run:  python debug/round12.py      (screenshots in debug/shots/)
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
proc, cdp = harness.launch_chrome("chrome-fnafsiege-r12")
D = "Game.debug"; E = cdp.eval
nid = [40000]
def blk(shape, mat, c, r):
    nid[0] += 1; return {"id": nid[0], "shape": shape, "mat": mat, "c": c, "r": r}
def unit(kind, c, r, **kw):
    nid[0] += 1; return {"id": nid[0], "kind": kind, "c": c, "r": r, **kw}
def fresh(rb, ru, looks=None, bu=None):
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop()")
    E("Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('field')")
    if looks is not None: E(f"{D}.S.looks.blue = {json.dumps(looks)}; {D}.applyTeamLooks()")
    bu = bu or [unit("endo", 2 + i, 49) for i in range(9)] + [unit("king", 20, 49)]
    E(f"(() => {{ const S={D}.S; S.layouts.blue={{blocks:[],units:{json.dumps(bu)}}}; S.layouts.red={{blocks:{json.dumps(rb)},units:{json.dumps(ru)}}}; }})()")
    E(f"{D}.readyUp('blue'); {D}.readyUp('red'); document.getElementById('overlay').classList.add('hidden')")
def look(x, y, z=1.5):
    E(f"(() => {{ const d={D}; d.cam.lock=false; d.cam.t=null; d.cam.z={z}; d.cam.x={x}*40-915/2/{z}; d.cam.y={y}*40-412/2/{z}; }})()")
def wait(cond, t=20):
    end = time.time() + t
    while time.time() < end:
        if E(cond): return True
        cdp.pump(0.2)
    return False
def red_at(c): return E(f"{D}.units.find(u=>u.gm.side==='red'&&Math.floor(u.position.x/40)==={c}).gm.id")
def U(i): return f"{D}.units.find(u=>u.gm.id==={i})"
red9 = lambda: [unit("endo", 64 + i, 49) for i in range(9)] + [unit("king", 74, 49)]
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)

    # --- coins: a loss costs 10, never below 0
    got = E("(() => { Store.set('coins', 25); const a = Store.reward('loss'), c1 = Store.get('coins'); Store.set('coins', 4); const b = Store.reward('loss'), c2 = Store.get('coins'); const w = Store.reward('win'); return [a, c1, b, c2, w, Store.get('coins')]; })()")
    check("a loss costs 10 coins (25 -> 15)", got[:2] == [-10, 15], str(got))
    check("...and CAN go below 0 (4 -> -6)", got[2:4] == [-10, -6], str(got))
    check("a win still pays 10", got[4:] == [10, 4], str(got))

    # --- RED and BLUE team colours
    check("RED and BLUE are in the shop's Common section for 10 coins", E("[COSMETICS.team.items.red[1], COSMETICS.team.items.blue[1], rarityOf(10)]") == [10, 10, 0])
    def teams(lb, lr):
        E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop(); Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
        E(f"{D}.S.looks.blue = {json.dumps(lb)}; {D}.S.looks.red = {json.dumps(lr)}; {D}.applyTeamLooks()")
        return E(f"[{D}.TEAM.blue.name, {D}.TEAM.red.name]")
    check("nobody picks: player 1 BLUE, player 2 RED", teams({}, {}) == ["BLUE", "RED"])
    check("player 1 buys RED: player 2 switches to BLUE", teams({"team": "red"}, {}) == ["RED", "BLUE"])
    check("player 2 picks BLUE: player 1 switches to RED", teams({}, {"team": "blue"}) == ["RED", "BLUE"])
    check("both pick RED: player 2 switches to BLUE", teams({"team": "red"}, {"team": "red"}) == ["RED", "BLUE"])
    check("RED vs GREEN: both keep their picks", teams({"team": "red"}, {"team": "green"}) == ["RED", "GREEN"])
    check("GREEN vs nothing: player 2 stays RED", teams({"team": "green"}, {}) == ["GREEN", "RED"])
    fresh([], red9(), looks={"team": "red"})
    cdp.pump(0.8)
    check("in the match player 1's units wear red", E(f"{D}.TEAM.blue.col") == "#ff4a4a" and "RED" in E("document.getElementById('banner').textContent"))

    # --- every cannon's kill effect plays where the enemy died, and the turn waits for it
    for theme, fx in [("gold", "confetti"), ("rose", "flower"), ("jungle", "weeds"), ("scale", "spikes"), ("bone", "skull"),
                      ("frost", "icicle"), ("torch", "flames"), ("storm", "bolt"), ("phantom", "souls")]:
        fresh([], red9(), looks={"cannon": theme})
        cdp.pump(0.6)
        E(f"{D}.onBar('cannon'); {D}.doAct({{t:'shot', vx:-2, vy:-2}})")         # fire (a dud), so it's a cannon turn
        target = red_at(66)
        E(f"{D}.damageUnit({U(target)}, 3, 'cannon')")
        kinds = E(f"[...new Set({D}.parts.filter(p=>p.kfx).map(p=>p.fx || p.t))]")
        check(f"{theme}: its kill effect plays ({fx})", kinds == [fx], str(kinds))
        look(66, 47.2, 1.6); cdp.pump(0.55); shot(f"130-killfx-{theme}")
        if theme == "gold":
            t0 = time.time()
            wait(f"{D}.S.turn==='red'", 20)
            check("the turn doesn't move on until the effect is over", E(f"{D}.parts.some(p=>p.kfx)") is False and time.time() - t0 > 1.0, f"{time.time() - t0:.1f}s")
    # no effect for a kill that isn't from your cannon shot, or with the plain cannon
    fresh([], red9(), looks={"cannon": "gold"}); cdp.pump(0.5)
    E(f"{D}.doAct({{t:'mode', v:'dice'}}); {D}.damageUnit({U(red_at(66))}, 3, 'x')")
    check("no effect for a kill on a dice turn", E(f"{D}.parts.some(p=>p.kfx)") is False)
    fresh([], red9(), looks={}); cdp.pump(0.5)
    E(f"{D}.onBar('cannon'); {D}.doAct({{t:'shot', vx:-2, vy:-2}}); {D}.damageUnit({U(red_at(66))}, 3, 'cannon')")
    check("no effect with the plain iron cannon", E(f"{D}.parts.some(p=>p.kfx)") is False)

    # --- Frost: a unit it hits but doesn't kill is frozen for its side's next turn
    fresh([], red9(), looks={"cannon": "frost"}); cdp.pump(0.5)
    e = red_at(64)
    E(f"{D}.freeze({U(e)})")
    look(66, 47.5, 1.8); cdp.pump(0.2); shot("131-frozen")
    E(f"{D}.onBar('dice'); {D}.onBar('endturn')"); wait(f"{D}.S.turn==='red' && {D}.S.act==='choose'")
    E(f"{D}.doAct({{t:'mode', v:'dice'}}); {D}.doAct({{t:'roll', v:6}})"); wait(f"{D}.S.rolling===0")
    before = E(f"{D}.unitCell({U(e)})")
    E(f"{D}.doAct({{t:'move', id:{e}, c:{before['c']}, r:{before['r'] - 1}}})"); cdp.pump(0.3)
    check("a frozen unit can't move on its turn", E(f"{D}.unitCell({U(e)})") == before and E(f"{D}.isFrozen({U(e)})") is True)
    other_ = red_at(66)
    E(f"{D}.doAct({{t:'move', id:{other_}, c:66, r:48}})"); cdp.pump(0.8)
    check("...while the others still can", E(f"{D}.unitCell({U(other_)})")["c"] == 66 and E(f"{D}.S.pts") == 5)
    E(f"{D}.doAct({{t:'endturn'}})"); wait(f"{D}.S.turn==='blue' && {D}.S.act==='choose'")
    E(f"{D}.onBar('dice'); {D}.onBar('endturn')"); wait(f"{D}.S.turn==='red' && {D}.S.act==='choose'")
    check("...and it thaws after that turn", E(f"{D}.isFrozen({U(e)})") is False)
    snap = E(f"JSON.stringify({D}.snapshot())")
    E(f"{D}.freeze({U(e)})"); s2 = E(f"JSON.stringify({D}.snapshot())")
    E(f"{D}.applySnapshot(JSON.parse({json.dumps(s2)}))")
    check("the ice survives the online sync", E(f"{D}.isFrozen({D}.units.find(u=>u.gm.id==={e}))") is True)

    # --- Red Samurai: the block its stopped ball touches vanishes
    fresh([blk("s11", "wood", 60, 49), blk("s11", "stone", 58, 49)], red9(), looks={"cannon": "samurai"}); cdp.pump(0.8)
    E(f"(() => {{ const b = {D}.makeBall(60.5*40, 48.5*40 - 1, 0, 0, 'blue', {{ theme: 'samurai' }}); {D}.landBall(b); }})()"); cdp.pump(0.3)
    check("Red Samurai: the block under its stopped ball vanishes", E(f"{D}.blocks.filter(b=>!b.gm.dead).map(b=>b.gm.mat)") == ["stone"])
    # --- Blue Storm: an enemy its stopped ball touches is struck down (with a bolt)
    fresh([], red9(), looks={"cannon": "storm"}); cdp.pump(0.6)
    E(f"{D}.onBar('cannon'); {D}.doAct({{t:'shot', vx:-2, vy:-2}})")
    e = red_at(66)
    E(f"(() => {{ const u={U(e)}; const b = {D}.makeBall(u.position.x - 30, u.position.y, 0, 0, 'blue', {{ theme: 'storm' }}); {D}.landBall(b); }})()"); cdp.pump(0.2)
    check("Blue Storm: the enemy touching its stopped ball dies", E(f"!{U(e)}") is True)
    check("...and lightning strikes", E(f"{D}.parts.some(p=>p.fx==='bolt')") is True)
    # --- The Torch and the Shadow Phantom Boom: what blocks cost them
    # a ball starts right beside a 1x2 block, clear of the ground, and hits it on the next step
    def punch(theme, mat, shape="s12"):
        fresh([blk(shape, mat, 60, 48 if shape == "s12" else 48)], red9(), looks={"cannon": theme}); cdp.pump(0.8)
        E(f"window.__b = {D}.makeBall(60*40 - 20, 48.4*40, 14, 0, 'blue', {{ theme: '{theme}' }})")
        wait("window.__b.gm.dead || window.__b.gm.power < 10", 5)
        return E(f"[Math.round(window.__b.gm.power*10)/10, {D}.blocks.some(b=>b.gm.burn > 0)]")
    plain, torch = punch("default", "glass"), punch("torch", "glass")
    check("The Torch: glass costs it as much as wood", plain[0] == 8.6 and torch[0] == 5.8, f"power left: plain {plain[0]}, torch {torch[0]}")
    # a slow Torch ball that only dents the wood sets it on fire...
    fresh([blk("s12", "wood", 60, 48)], red9(), looks={"cannon": "torch"}); cdp.pump(0.8)
    E(f"window.__b = {D}.makeBall(60*40 - 20, 48.4*40, 14, 0, 'blue', {{ theme: 'torch' }}); window.__b.gm.power = 2")
    check("The Torch sets wood it hits on fire", wait(f"{D}.blocks.some(b=>b.gm.burn > 0)", 5))
    # ...and one that smashes through lights the wood touching it
    fresh([blk("s12", "wood", 60, 48), blk("s12", "wood", 61, 48)], red9(), looks={"cannon": "torch"}); cdp.pump(0.8)
    E(f"window.__b = {D}.makeBall(60*40 - 20, 48.4*40, 14, 0, 'blue', {{ theme: 'torch' }})")
    check("...and smashing through wood lights the wood next to it", wait(f"{D}.blocks.some(b=>b.gm.burn > 0 && !b.gm.dead)", 5))
    look(61, 47.5, 1.8); cdp.pump(0.3); shot("132-torch-fire")
    plain, shadow = punch("default", "stone"), punch("phantom", "stone")
    check("Shadow Phantom Boom: stone is as weak as wood", plain[0] == 3.6 and shadow[0] == 5.8, f"power left: plain {plain[0]}, shadow {shadow[0]}")

    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
