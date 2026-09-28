"""Round 10: prices + the five rarity sections, a fresh save (forts kept), locked levels, Bidybab launches once,
the cannonball powers (Swamp BB / The Sun / The Moon), and the five new Auto Fort styles.
Run:  python debug/round10.py      (screenshots in debug/shots/)
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
proc, cdp = harness.launch_chrome("chrome-fnafsiege-r10")
D = "Game.debug"; E = cdp.eval
nid = [15000]
def blk(shape, mat, c, r, **kw):
    nid[0] += 1; return {"id": nid[0], "shape": shape, "mat": mat, "c": c, "r": r, **kw}
def unit(kind, c, r, **kw):
    nid[0] += 1; return {"id": nid[0], "kind": kind, "c": c, "r": r, **kw}
def fresh(bb, rb, bu, ru, looks=None):
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop()")
    E("Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('field')")
    if looks: E(f"{D}.S.looks.blue = {json.dumps(looks)}")
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
def wait(cond, t=20):
    end = time.time() + t
    while time.time() < end:
        if E(cond): return True
        cdp.pump(0.25)
    return False
def bar(): return E("document.getElementById('hudBar').textContent")
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)

    # --- an old save: coins, items and levels are wiped, the saved fort and settings stay
    E("localStorage.removeItem('fnafsiege_v2'); localStorage.setItem('fnafsiege_v1', JSON.stringify({coins: 999, owned: {bonnie: true, 'stone:black': true}, beaten: [1,2,3], "
      "forts: [{name: 'My Fort 1', blocks: [{id: 1, shape: 's11', mat: 'stone', c: 3, r: -1}], units: []}], aimColor: '#ff4a4a', volume: 0.4}))")
    cdp.send("Page.reload", {}); cdp.pump(1.8)
    st = E("[Store.get('coins'), Object.keys(Store.get('owned')).length, Store.get('beaten').length, Store.get('forts').length, Store.get('aimColor'), Store.get('volume'), localStorage.getItem('fnafsiege_v1')]")
    check("an old save starts fresh: 0 coins, no items, no levels beaten", st[:3] == [0, 0, 0], str(st))
    check("...but keeps the saved fort and the settings", st[3:6] == [1, "#ff4a4a", 0.4], str(st))
    check("...and the old save is gone", st[6] is None)

    # --- only level 1 open; beating a level opens the next
    E("UI.show('campaign')"); cdp.pump(0.3)
    lk = E("[...document.querySelectorAll('#levels .lvl')].map(l=>l.classList.contains('locked'))")
    check("only level 1 is open", lk[0] is False and all(lk[1:]), str(lk))
    E("Store.set('beaten', [1]); UI.show('campaign')"); cdp.pump(0.3)
    lk = E("[...document.querySelectorAll('#levels .lvl')].map(l=>l.classList.contains('locked'))")
    check("beating level 1 opens level 2 (only)", lk[:3] == [False, False, True], str(lk[:3]))
    E("Store.set('beaten', [])")

    # --- prices and the five sections
    want = {"bonnie": 20, "chica": 40, "mangle": 60, "gfreddy": 80, "chipper": 100, "gendo": 90, "funtime": 80, "dmangle": 30}
    got = E("(" + json.dumps(want) + ", Object.fromEntries(Object.keys(" + json.dumps(want) + ").map(k => [k, ITEMS[k].price])))")
    check("mask prices are set", got == want, str(got))
    check("look prices are set", E("[COSMETICS.team.items.green[1], COSMETICS.stone.items.bluebrick[1], COSMETICS.cannon.items.phantom[1], COSMETICS.glass.items.pink[1], COSMETICS.ball.items.swamp[1]]") == [10, 80, 90, 70, 100])
    E("UI.show('shop')"); cdp.pump(0.4)
    sections = []
    for i in range(5):
        sections.append(E("[document.getElementById('rarName').textContent, [...document.querySelectorAll('#shopgrid .shopitem')].map(d => d.dataset.key), [...document.querySelectorAll('#shopgrid .shopitem')].every(d => d.className.includes('r-'))]"))
        if i == 0: page_shot("110-shop-common")
        if i == 4: page_shot("111-shop-legendary")
        E("document.getElementById('rarNext').click()"); cdp.pump(0.2)
    check("five sections in order", [x[0] for x in sections] == ["COMMON", "UNCOMMON", "RARE", "ULTRA RARE", "LEGENDARY"], str([x[0] for x in sections]))
    check("Common has Bonnie (20) but not Chica (40)", "bonnie" in sections[0][1] and "chica" not in sections[0][1] and "chica" in sections[1][1])
    check("Legendary has Chipper, Glamrock Endo, Phantom Boom, The Sun, Swamp BB", all(k in sections[4][1] for k in ["chipper", "gendo", "cannon:phantom", "ball:sun", "ball:swamp"]), str(sections[4][1]))
    check("every item is in exactly one section", sum(len(x[1]) for x in sections) == E("Object.keys(ITEMS).length + Object.values(COSMETICS).reduce((n, c) => n + Object.keys(c.items).length, 0)"))
    check("every card is coloured by its rarity", all(x[2] for x in sections))
    # buying: not enough coins, then enough
    # (five clicks brought it back round to Common)
    E("Store.set('coins', 15); UI.show('shop')"); cdp.pump(0.2)
    E("document.querySelector('#shopgrid [data-key=bonnie]').click()"); cdp.pump(0.2)
    check("can't buy Bonnie with 15 coins", E("!Store.get('owned').bonnie && Store.get('coins') === 15") is True)
    E("Store.set('coins', 25); UI.show('shop')"); cdp.pump(0.2)
    E("document.querySelector('#shopgrid [data-key=bonnie]').click()"); cdp.pump(0.2)
    check("with 25 coins Bonnie costs 20", E("Store.get('owned').bonnie === true && Store.get('coins') === 5") is True)

    # --- Bidybab can only be launched once (and her clone can't be launched at all)
    fresh([], [], [unit("bidybab", 10, 49)] + blue8(12)[:7] + [unit("king", 22, 49)], red10())
    cdp.pump(0.8)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})"); roll(8)
    bid = E(f"{D}.units.find(u=>u.gm.kind==='bidybab').gm.id")
    E(f"{D}.doAct({{t:'throwmode', id:{bid}, kind:'self'}}); {D}.doAct({{t:'throw', id:{bid}, kind:'self', vx:12, vy:-14}})")
    wait(f"!{D}.balls.length", 15); cdp.pump(0.5)
    bb = E(f"{D}.units.filter(u=>u.gm.kind==='bidybab').map(u=>u.gm.spent)")
    check("she split into two", len(bb) == 2, str(bb))
    check("...and both are spent", all(bb))
    check("no Launch button for them any more", "Launch" not in bar())
    E(f"{D}.doAct({{t:'endturn'}})"); wait(f"{D}.S.turn==='red'", 20)
    E(f"{D}.onBar('dice'); {D}.onBar('endturn')"); wait(f"{D}.S.turn==='blue' && {D}.S.act==='choose'", 20)
    E(f"{D}.onBar('cannon')"); cdp.pump(0.3)
    check("...and the cannon doesn't offer them as ammo", "Bidybab" not in bar())

    # --- cannonball powers: The Sun burns away ALL red's wood, once a match
    rb = [blk("s14", "wood", 52, 46), blk("s14", "wood", 56, 46), blk("s14", "stone", 54, 46), blk("s11", "glass", 58, 49), blk("s11", "wood", 60, 49)]
    fresh([], rb, blue8() + [unit("king", 20, 49)], [unit("endo", 70 + i, 49) for i in range(5)] + [unit("king", 69, 49)], looks={"ball": "sun"})
    cdp.pump(1.0)
    E(f"{D}.onBar('cannon')"); cdp.pump(0.3)
    check("the cannon offers The Sun", "The Sun" in bar())
    E(f"{D}.onBar('ammo','power')")
    v = {'vx': 20.1, 'vy': -20.1}              # lands on open ground at about column 66
    E(f"{D}.doAct({{t:'shot', vx:{v['vx']}, vy:{v['vy']}, power:true}})"); cdp.pump(0.6)
    check("The Sun flies", E(f"{D}.balls.some(b=>b.gm.pw==='sun')") is True)
    look(40, 40, 0.5); cdp.pump(0.1); shot("112-the-sun")
    wait(f"!{D}.balls.length", 15); cdp.pump(0.5)
    mats = E(f"{D}.blocks.filter(b=>b.gm.side==='red').map(b=>b.gm.mat).sort()")
    check("all of red's wood is gone, stone and glass stay", mats == ["glass", "stone"], str(mats))
    check("...and it's used up for this match", E(f"{D}.S.powerUsed.blue") is True and E(f"{D}.powerOf('blue')") is None)
    look(63, 47, 1.0); cdp.pump(0.1); shot("113-after-the-sun")

    # --- the 10 Auto Fort styles + the saved fort
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop(); Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('field')"); cdp.pump(0.3)
    names = []
    for i in range(11):
        E(f"{D}.onBar('autofort')"); cdp.pump(0.05)
        names.append(E("document.getElementById('toast').textContent"))
    check("Auto Fort cycles 10 styles plus the saved fort", any("Floating Islands" in n for n in names) and any("Ziggurat" in n for n in names) and any("My Fort 1" in n for n in names) and "(11/11)" in " ".join(names), str([n.split(' (')[0] for n in names]))
    for st_ in ["skyline", "castle", "islands", "ziggurat", "stilts"]:
        E(f"{D}.S.layouts.blue = {D}.genFort('blue', {{style:'{st_}'}})")
        n = E(f"[{D}.S.layouts.blue.units.length, {D}.S.layouts.blue.blocks.length]")
        check(f"{st_}: 10 units and a real fort", n[0] == 10 and n[1] > 12, str(n))
        E(f"(() => {{ const d={D}; d.cam.x=-420; d.cam.y=({D}.H-26*40); d.cam.z=0.44; }})()"); cdp.pump(0.2)
        page_shot(f"114-fort-{st_}")

    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
