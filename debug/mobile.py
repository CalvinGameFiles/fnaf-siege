"""Phone check: every menu and every battle bar at phone sizes (landscape), with touch.
Flags anything off-screen, overlapping the bottom bar, or too small to tap.
Run:  python debug/mobile.py      (screenshots in debug/shots/mobile-*.png)
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
    open(os.path.join(HERE, "shots", f"mobile-{name}.png"), "wb").write(base64.b64decode(r["result"]["data"]))

s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(["node", "server.js"], cwd=ROOT, env={**os.environ, "PORT": str(port)}, stdout=subprocess.DEVNULL)
time.sleep(0.8)
proc, cdp = harness.launch_chrome("chrome-fnafsiege-mobile")
D = "Game.debug"; E = cdp.eval
nid = [20000]
def unit(kind, c, r, **kw):
    nid[0] += 1; return {"id": nid[0], "kind": kind, "c": c, "r": r, **kw}

# every visible, tappable thing: must be fully on screen and at least MIN px tall and wide
MIN = 30
AUDIT = """(() => {
  const W = innerWidth, H = innerHeight, bad = [];
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && el.offsetParent !== null; };
  const scope = document.querySelector('.screen.active') || document.getElementById('hud');
  const els = [...scope.querySelectorAll('button, .tb, .lvl, .shopitem, .item, .slot, .eslot, .sw, .mbtn, .sbtn')].filter(vis);
  if (!document.getElementById('overlay').classList.contains('hidden')) els.push(...[...document.querySelectorAll('#overlay button')].filter(vis));
  for (const el of els) {
    const r = el.getBoundingClientRect(), name = (el.textContent || el.className).trim().slice(0, 24);
    const scrolls = el.closest('.screen') && el.closest('.screen').scrollHeight > el.closest('.screen').clientHeight;
    // inside a bar row that swipes sideways: fine, as long as the row is on screen and can scroll far enough to show it
    const row = el.closest('#hudBar .row'), rr = row && row.getBoundingClientRect();
    const swipe = row && getComputedStyle(row).overflowX === 'auto' && rr.left >= -1 && rr.right <= W + 1
      && (r.right - rr.left + row.scrollLeft) <= row.scrollWidth + 1;
    if ((!swipe && (r.left < -1 || r.right > W + 1)) || (!scrolls && (r.top < -1 || r.bottom > H + 1))) bad.push('OFF ' + name + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
    if (r.height < MIN || r.width < MIN) bad.push('SMALL ' + name + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  for (const row of document.querySelectorAll('#hudBar .row')) { const rr = row.getBoundingClientRect(); if (vis(row) && (rr.left < -1 || rr.right > W + 1)) bad.push('ROW WIDER THAN THE SCREEN'); }
  // the bottom bar must fit on screen, and must not cover the gold equipment bars
  const bar = document.getElementById('hudBar');
  if (bar && vis(bar)) {
    const br = bar.getBoundingClientRect();
    if (br.top < H * 0.45) bad.push('BAR TOO TALL ' + Math.round(H - br.top) + 'px of ' + H);
    for (const id of ['equip', 'equip2']) { const e = document.getElementById(id); if (e && vis(e)) { const er = e.getBoundingClientRect(); if (er.bottom > br.top + 2 && er.right > br.left && er.left < br.right) bad.push('GOLD BAR UNDER THE BOTTOM BAR ' + id); } }
  }
  return bad;
})()""".replace("MIN", str(MIN))

def audit(label):
    cdp.pump(0.35)
    bad = E(AUDIT)
    check(f"{label}: everything on screen and big enough to tap", not bad, "; ".join(bad[:6]) if bad else "")
    shot(label)

def start_hotseat(bu, ru, owned=None):
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop()")
    if owned: E(f"Store.set('owned', {json.dumps({k: True for k in owned})}); Store.set('equip', {json.dumps((owned + [None] * 10)[:10])})")
    E("Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('field')")
    E(f"(() => {{ const S={D}.S; S.layouts.blue={{blocks:[],units:{json.dumps(bu)}}}; S.layouts.red={{blocks:[],units:{json.dumps(ru)}}}; }})()")
    E(f"{D}.readyUp('blue'); {D}.readyUp('red'); document.getElementById('overlay').classList.add('hidden')")

try:
    for (w, h) in [(800, 360), (640, 360), (915, 412)]:
        tag = f"{w}x{h}"
        cdp.send("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": 2, "mobile": True, "screenOrientation": {"type": "landscapePrimary", "angle": 90}})
        cdp.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
        cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)
        E("Store.set('coins', 120); Store.set('owned', {bonnie:true, chica:true, foxy:true, toybonnie:true, bb:true}); Store.set('equip', ['bonnie','chica','foxy','toybonnie','bb',null,null,null,null,null])")
        for scr in ["menu", "mode", "campaign", "shop", "options", "guide", "local"]:
            E(f"UI.show('{scr}')"); audit(f"{tag}-{scr}")
        # build phase (pass & play), units phase
        E("UI.show('mode'); document.getElementById('hotseatBtn').click()"); cdp.pump(0.5)
        audit(f"{tag}-pass-overlay")
        E("document.querySelector('#overlay [data-o=build]').click()"); cdp.pump(0.4)
        audit(f"{tag}-build")
        E(f"{D}.onBar('mat','cloud')"); audit(f"{tag}-build-cloud")
        E(f"{D}.onBar('autofort')"); E(f"{D}.onBar('tounits')"); audit(f"{tag}-units")
        # battle: a crowded dice bar (every kind of ability button at once)
        kinds = ["chica", "toybonnie", "burntfoxy", "mmangle", "cbonnie", "djmm", "pbennard", "fmangle"]
        start_hotseat([unit(k, 3 + 2 * i, 49) for i, k in enumerate(kinds)] + [unit("endo", 20, 49), unit("king", 22, 49, up="dread")],
                      [unit("endo", 64 + i, 49) for i in range(9)] + [unit("king", 60, 49, up="funtime")],
                      owned=["bonnie", "chica", "foxy", "toybonnie", "bb"])
        cdp.pump(0.6)
        audit(f"{tag}-battle-choose")
        E(f"{D}.onBar('cannon')"); audit(f"{tag}-battle-aim")
        E(f"{D}.onBar('back'); {D}.onBar('dice')"); audit(f"{tag}-battle-dice")
        E(f"{D}.doAct({{t:'roll', v:7}})"); cdp.pump(1.0); audit(f"{tag}-battle-dice-rolled")
        cid = E(f"{D}.units.find(u=>u.gm.kind==='chica').gm.id")
        E(f"{D}.doAct({{t:'throwmode', id:{cid}}})"); audit(f"{tag}-battle-throw")
        E(f"{D}.onBar('throwcancel')")
        E("document.getElementById('hudMenu').click()"); audit(f"{tag}-pause")
        E("document.querySelector('#overlay [data-o=close]').click()")
        E("Game.stop()")

    # --- real finger gestures on an 800x360 phone
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 800, "height": 360, "deviceScaleFactor": 2, "mobile": True, "screenOrientation": {"type": "landscapePrimary", "angle": 90}})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)
    def touch(kind, pts):
        cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})
    def finger(path, step=0.03):                     # one finger: down, move along the path, up
        touch("touchStart", [path[0]]); cdp.pump(step)
        for p in path[1:]: touch("touchMove", [p]); cdp.pump(step)
        touch("touchEnd", []); cdp.pump(0.2)
    E("UI.show('mode'); document.getElementById('hotseatBtn').click()"); cdp.pump(0.4)
    E("document.querySelector('#overlay [data-o=build]').click()"); cdp.pump(0.4)
    finger([(400, 170)])                                # the middle of the build view is always your own land
    check("a finger tap places a block", E(f"{D}.S.layouts.blue.blocks.length") == 1)
    z0 = E(f"{D}.cam.z")
    touch("touchStart", [(350, 180), (450, 180)]); cdp.pump(0.05)
    for k in range(1, 8): touch("touchMove", [(350 - k * 15, 180), (450 + k * 15, 180)]); cdp.pump(0.03)
    touch("touchEnd", []); cdp.pump(0.2)
    check("two fingers pinch-zoom while building", E(f"{D}.cam.z") > z0 * 1.3, f"{z0:.2f} -> {E(f'{D}.cam.z'):.2f}")
    check("...and the pinch didn't place blocks", E(f"{D}.S.layouts.blue.blocks.length") == 1)
    # swiping a bar row sideways scrolls it and presses nothing
    row = E("(() => { const r = document.querySelectorAll('#hudBar .row')[1].getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()")
    mat0, ph0 = E(f"[{D}.S.mat, {D}.S.phase]")
    y = (row[1] + row[3]) / 2
    finger([(row[2] - 40, y), (row[2] - 120, y), (row[2] - 220, y), (row[2] - 320, y)])
    sl = E("document.querySelectorAll('#hudBar .row')[1].scrollLeft")
    check("a sideways swipe scrolls the button row", sl > 50, f"scrollLeft {sl}")
    check("...without pressing a button", E(f"[{D}.S.mat, {D}.S.phase]") == [mat0, ph0])
    # battle: drag back anywhere and let go to fire
    start_hotseat([unit("endo", 2 + i, 49) for i in range(9)] + [unit("king", 20, 49)], [unit("endo", 64 + i, 49) for i in range(9)] + [unit("king", 60, 49)])
    cdp.pump(0.8)
    E(f"{D}.onBar('cannon')"); cdp.pump(0.3)
    finger([(400, 150), (360, 190), (300, 240), (250, 270)])
    check("dragging back with a finger fires the cannon", E(f"{D}.S.act") == "fly", E(f"{D}.S.act"))
    shot("gesture-fired")

    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED")
