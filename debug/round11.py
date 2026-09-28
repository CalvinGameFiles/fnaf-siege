"""v0.2.0: ropes tie under each other into long ropes (build rules, erasing, climbing, falling in battle).
(The LOCAL lobby's SEARCH button and the self-healing host are tested in online.py.)
Run:  python debug/round11.py      (screenshots in debug/shots/)
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
proc, cdp = harness.launch_chrome("chrome-fnafsiege-r11")
D = "Game.debug"; E = cdp.eval
def look(x, y, z=1.0):
    E(f"(() => {{ const d={D}; d.cam.lock=false; d.cam.t=null; d.cam.z={z}; d.cam.x={x}*40-915/2/{z}; d.cam.y={y}*40-412/2/{z}; }})()")
def place(mat, shape, c, r):                 # (c, r) = the bottom-left square, like a tap
    E(f"(() => {{ const S={D}.S; S.tool='block'; S.mat='{mat}'; S.shape='{shape}'; {D}.buildTap({c}, {r}); }})()")
def ropes(): return E(f"{D}.S.layouts.blue.blocks.filter(b=>b.mat==='rope').map(b=>[b.r, b.r + ({{r2:2,r3:3,r4:4,r6:6}})[b.shape] - 1])")
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('field')")

    # --- building: a cloud up high, then three ropes tied one under the other, reaching almost to the ground
    place("cloud", "c31", 3, 30)
    place("rope", "r6", 4, 36)               # rows 31-36, hangs under the cloud
    place("rope", "r6", 4, 42)               # rows 37-42, tied under the first rope
    place("rope", "r6", 4, 48)               # rows 43-48, tied under the second (nothing else holds it)
    check("three ropes tie into one long rope", ropes() == [[31, 36], [37, 42], [43, 48]], str(ropes()))
    place("rope", "r4", 12, 30)
    check("a rope hanging from nothing still can't be placed", len(ropes()) == 3 and "must hang" in E("document.getElementById('toast').textContent"))
    look(8, 40, 0.55); cdp.pump(0.2); shot("120-rope-chain-build")
    # erasing the top rope lets the ropes tied under it fall away too
    E(f"(() => {{ const S={D}.S; S.tool='erase'; {D}.buildTap(4, 33); }})()")
    check("erasing the top rope drops the ropes tied under it", ropes() == [], str(ropes()))
    place("rope", "r6", 4, 36); place("rope", "r6", 4, 42); place("rope", "r6", 4, 48)
    check("...and they can be tied back on", len(ropes()) == 3)

    # --- battle: the chain holds, a unit climbs the whole thing, and it falls when the top rope goes
    E(f"(() => {{ const S={D}.S; S.layouts.blue.units = [{json.dumps({'id': 30001, 'kind': 'endo', 'c': 4, 'r': 49})}]"
      f".concat(Array.from({{length: 8}}, (_, i) => ({{id: 30010 + i, kind: 'endo', c: 12 + i, r: 49}}))).concat([{{id: 30030, kind: 'king', c: 22, r: 49}}]);"
      f" S.layouts.red = {{ blocks: [], units: Array.from({{length: 9}}, (_, i) => ({{id: 30040 + i, kind: 'endo', c: 64 + i, r: 49}})).concat([{{id: 30060, kind: 'king', c: 60, r: 49}}]) }}; }})()")
    E(f"{D}.readyUp('blue'); {D}.readyUp('red'); document.getElementById('overlay').classList.add('hidden')")
    cdp.pump(1.0)
    E(f"{D}.checkSpecials()")
    check("in battle the tied ropes stay up", E(f"{D}.specials.filter(s=>s.mat==='rope').length") == 3)
    E(f"{D}.doAct({{t:'mode', v:'dice'}})")
    climbed = True
    for r in range(48, 30, -1):
        E(f"{D}.S.pts = 5; {D}.S.rolling = 0")
        E(f"{D}.doAct({{t:'move', id:30001, c:4, r:{r}}})"); cdp.pump(0.12)
        at = E(f"{D}.unitCell({D}.units.find(u=>u.gm.id===30001))")
        if at != {"c": 4, "r": r}: climbed = False; print("   stuck at", at, "wanted row", r); break
    check("a unit climbs the whole tied rope, from row 48 up to row 31", climbed and E(f"{D}.units.find(u=>u.gm.id===30001).gm.hang") is True)
    look(6, 40, 0.55); cdp.pump(0.2); shot("121-rope-chain-climb")
    E(f"(() => {{ const sp={D}.specials; sp.splice(sp.findIndex(s=>s.mat==='rope'&&s.r===31), 1); {D}.checkSpecials(); }})()")
    cdp.pump(1.5)
    check("when the top rope goes, the ropes tied under it fall", E(f"{D}.specials.filter(s=>s.mat==='rope').length") == 0)
    check("...and the climber drops", E(f"{D}.units.find(u=>u.gm.id===30001).gm.hang") is False)

    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
