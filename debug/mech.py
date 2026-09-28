"""Mechanics test: cannonball 3 damage + penetration, falling blocks, capture rules, doors, ropes, clouds, arrows, Chica's cupcake.
Run:  python debug/mech.py      (close-up screenshots in debug/shots/)
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
proc, cdp = harness.launch_chrome("chrome-fnafsiege-mech")
D = "Game.debug"; E = cdp.eval
nid = [1000]
def blk(shape, mat, c, r, **kw):
    nid[0] += 1; return {"id": nid[0], "shape": shape, "mat": mat, "c": c, "r": r, **kw}
def unit(kind, c, r):
    nid[0] += 1; return {"id": nid[0], "kind": kind, "c": c, "r": r}
def fresh(bb, rb, bu, ru, map_="'field'"):
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop(); Game.start({mode:'hotseat'}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap({map_})")
    E(f"(() => {{ const S={D}.S; S.layouts.blue={{blocks:{json.dumps(bb)},units:{json.dumps(bu)}}}; S.layouts.red={{blocks:{json.dumps(rb)},units:{json.dumps(ru)}}}; }})()")
    E(f"{D}.readyUp('blue'); {D}.readyUp('red'); document.getElementById('overlay').classList.add('hidden')")
def filler(side, n=9, king=True):
    xs = range(2, 2 + n) if side == "blue" else range(74 - n, 74)
    out = [unit("endo", x, 49) for x in xs]
    if king: out.append(unit("king", 20 if side == "blue" else 58, 49))
    return out
def look(x, y, z=1.5):
    E(f"(() => {{ const d={D}; d.cam.t={{cx:{x}*40, cy:{y}*40, z:{z}}}; d.cam.cx={x}*40; d.cam.cy={y}*40; d.cam.z={z}; }})()")
def ball(x, y, vx, vy, side="blue"):
    mask = "0xFFFFFFFF ^ 4 ^ " + ("0x10" if side == "blue" else "0x20")
    E(f"(() => {{ const d={D}; d.S.act='fly'; d.S.lastMode='cannon'; const b = Matter.Bodies.circle({x}*40, {y}*40, 14, {{density:0.012, frictionAir:0, restitution:0.3, collisionFilter:{{category:1, mask:{mask}}}}});"
      f" b.gm={{type:'ball', power:10, live:true, still:0, age:0, side:'{side}'}}; Matter.Composite.add(d.engine.world, b); Matter.Body.setVelocity(b, {{x:{vx}, y:{vy}}}); d.balls.push(b); }})()")
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)

    # --- cannonball: 3 damage kills Bonnie (2 hearts) and King Freddy
    ru = [unit("bonnie", 52, 49), unit("king", 56, 49)] + filler("red", 8, False)
    fresh([], [], filler("blue"), ru)
    cdp.pump(1)
    ball(50, 48.5, 12, 0); cdp.pump(1.2)
    ball(54, 48.5, 12, 0); cdp.pump(1.2)
    kinds = E(f"{D}.units.filter(u=>u.gm.side==='red').map(u=>u.gm.kind)")
    check("a cannonball kills Bonnie (3 dmg vs 2 hearts)", "bonnie" not in kinds, str(kinds))
    check("a cannonball kills King Freddy", "king" not in kinds)

    # --- falling blocks: stone kills, glass does nothing
    red_units = [unit("endo", 60, 49), unit("endo", 64, 49)] + filler("red", 7)
    fresh([], [blk("s11", "stone", 60, 40), blk("s11", "glass", 64, 40)], filler("blue"), red_units)
    cdp.pump(3)
    xs = E(f"{D}.units.filter(u=>u.gm.side==='red').map(u=>Math.floor(u.position.x/40))")
    check("stone falling kills an endo", 60 not in xs, str(xs))
    check("glass falling does nothing", 64 in xs)

    # --- doors: gold door on a block, red door elsewhere; stepping in teleports
    bb = [blk("s41", "stone", 10, 49), blk("d1", "door", 11, 48, color="gold", link=2001), blk("s41", "stone", 18, 49),
          {"id": 2001, "shape": "d1", "mat": "door", "c": 19, "r": 48, "color": "red", "link": 0}]
    bb[1]["id"] = 1999; bb[3]["link"] = 1999; bb[1]["link"] = 2001
    bu = [unit("endo", 10, 48)] + [unit("endo", 1 + i, 49) for i in range(8)] + [unit("king", 23, 49)]
    fresh(bb, [], bu, filler("red"))
    cdp.pump(1.5)
    E(f"{D}.doAct({{t:'mode', v:'dice'}}); {D}.doAct({{t:'roll', v:3}})"); cdp.pump(1)
    u0 = E(f"{D}.units.find(u=>Math.floor(u.position.x/40)===10).gm.id")
    tg = E(f"{D}.moveTargets({D}.units.find(u=>u.gm.id==={u0})).find(t=>t.c===11&&t.r===48)")
    check("the gold door is a teleport target", tg is not None and tg.get("tele") == {"c": 19, "r": 48}, str(tg))
    E(f"{D}.doAct({{t:'move', id:{u0}, c:11, r:48}})"); cdp.pump(0.8)
    c = E(f"{D}.unitCell({D}.units.find(u=>u.gm.id==={u0}))")
    check("unit came out of the red door", c == {"c": 19, "r": 48}, str(c))
    look(14, 46, 1.2); cdp.pump(0.2); shot("40-doors")

    # --- rope: stands on the ground beside a ledge; a unit climbs it and steps across onto the ledge
    bb = [blk("s41", "wood", 20, 44), blk("s14", "stone", 23, 45), blk("s11", "stone", 23, 49), blk("s14", "stone", 20, 45), blk("s11", "stone", 20, 49), blk("r6", "rope", 19, 44)]
    bu = [unit("endo", 18, 49)] + [unit("endo", 2 + i, 49) for i in range(8)] + [unit("king", 12, 49)]
    fresh(bb, [], bu, filler("red"))
    cdp.pump(1.5)
    E(f"{D}.doAct({{t:'mode', v:'dice'}}); {D}.doAct({{t:'roll', v:6}})"); cdp.pump(1); E(f"{D}.S.pts = 7")
    uid = E(f"{D}.units.find(u=>Math.floor(u.position.x/40)===18).gm.id")
    for (c_, r_) in [(19, 49), (19, 48), (19, 47), (19, 46), (19, 45), (19, 44)]:
        E(f"{D}.doAct({{t:'move', id:{uid}, c:{c_}, r:{r_}}})"); cdp.pump(0.25)
    cdp.pump(0.8)
    check("unit hangs on the rope in mid-air", E(f"{D}.unitCell({D}.units.find(u=>u.gm.id==={uid}))") == {"c": 19, "r": 44} and E(f"{D}.units.find(u=>u.gm.id==={uid}).gm.hang") is True)
    E(f"{D}.doAct({{t:'move', id:{uid}, c:20, r:43}})"); cdp.pump(1)
    c = E(f"{D}.unitCell({D}.units.find(u=>u.gm.id==={uid}))")
    check("unit stepped off the rope onto the ledge", c == {"c": 20, "r": 43}, str(c) + " pts " + str(E(f"{D}.S.pts")))
    look(21, 45, 1.3); cdp.pump(0.2); shot("41-rope")

    # --- cloud: a tower hangs under it; a cannonball knocks the link out and the rest falls
    bb = [blk("c42", "cloud", 20, 20), blk("s12", "wood", 21, 22), blk("s41", "wood", 20, 24), blk("s11", "glass", 20, 23)]
    bu = [unit("endo", 23, 23)] + [unit("endo", 2 + i, 49) for i in range(8)] + [unit("king", 12, 49)]
    fresh(bb, [], bu, filler("red"))
    cdp.pump(2)
    ys = E(f"{D}.blocks.filter(b=>b.gm.mat!=='cloud').map(b=>Math.round(b.position.y))")
    check("the tower hangs under the cloud", all(y < 1100 for y in ys) and E(f"{D}.blocks.every(b=>b.gm.stuck)") is True, str(ys))
    check("the unit stands on the hanging plank", E(f"{D}.unitCell({D}.units.find(u=>Math.floor(u.position.x/40)===23))")["r"] == 23)
    look(22, 23, 1.3); cdp.pump(0.2); shot("42-cloud")
    ball(15, 22.9, 16, -0.3, "red"); cdp.pump(3)
    left = E(f"{D}.blocks.map(b=>[b.gm.stuck, Math.round(b.position.y)])")
    check("after the link is shot away nothing is left hanging", all(not st and y > 1800 for st, y in left), str(left))
    look(22, 40, 0.6); cdp.pump(0.2); shot("43-cloud-fell")

    # --- arrows: moving platform between two arrows, carrying a unit
    bb = [blk("a1", "arrow", 10, 38, dir=1), blk("s31", "stone", 11, 38), blk("a1", "arrow", 22, 38, dir=-1)]
    bu = [unit("endo", 12, 37)] + [unit("endo", 2 + i, 49) for i in range(8)] + [unit("king", 24, 49)]
    fresh(bb, [], bu, filler("red"))
    x0 = E(f"{D}.blocks[0].position.x"); ux0 = E(f"{D}.units.find(u=>u.gm.side==='blue'&&u.position.y<1600).position.x")
    cdp.pump(3)
    x1 = E(f"{D}.blocks[0].position.x"); ux1 = E(f"{D}.units.find(u=>u.gm.side==='blue'&&u.position.y<1600).position.x")
    check("the platform moves right", x1 > x0 + 60, f"{x0}->{x1}")
    check("the unit rides along", abs((ux1 - ux0) - (x1 - x0)) < 20, f"{ux0}->{ux1}")
    look(16, 38, 1.3); cdp.pump(0.2); shot("44-arrows")
    cdp.pump(9)
    xs = [E(f"{D}.blocks[0].position.x")]
    for _ in range(12): cdp.pump(0.5); xs.append(E(f"{D}.blocks[0].position.x"))
    check("it turns around at the far arrow and stays between them", max(xs) < 22 * 40 and min(xs) > 11 * 40, f"{min(xs):.0f}..{max(xs):.0f}")
    E(f"{D}.doAct({{t:'flip', id:{E(f'{D}.specials[0].id')}}})")
    check("tapping flips an arrow", E(f"{D}.specials[0].dir") == -1)

    # --- Chica: spend a roll to throw the cupcake, which becomes a unit
    bu = [unit("chica", 10, 49)] + [unit("endo", 0 + i, 49) for i in range(8)] + [unit("king", 24, 49)]
    fresh([], [], bu, filler("red"))
    cdp.pump(1)
    cid = E(f"{D}.units.find(u=>u.gm.kind==='chica').gm.id")
    E(f"{D}.doAct({{t:'mode', v:'dice'}}); {D}.doAct({{t:'throwmode', id:{cid}}})")
    check("throwing costs a roll", E(f"{D}.S.rolls") == 2 and E(f"{D}.S.act") == "throw")
    E(f"{D}.doAct({{t:'throw', id:{cid}, vx:8, vy:-10}})"); cdp.pump(3)
    cup = E(f"(() => {{ const c={D}.units.find(u=>u.gm.kind==='cupcake'); return c ? [c.gm.side, Math.floor(c.position.x/40), c.gm.hp] : null; }})()")
    check("the cupcake landed as a blue unit", cup is not None and cup[0] == "blue" and cup[1] > 12, str(cup))
    E(f"{D}.doAct({{t:'roll', v:2}})"); cdp.pump(1)
    cu = E(f"{D}.units.find(u=>u.gm.kind==='cupcake').gm.id")
    n = E(f"{D}.moveTargets({D}.units.find(u=>u.gm.id==={cu})).length")
    check("the cupcake can be moved with the dice", n > 0, str(n))
    check("Chica can't throw twice", E(f"{D}.units.find(u=>u.gm.kind==='chica').gm.threw") is True)
    look(14, 47, 1.6); cdp.pump(0.2); shot("45-cupcake")

    # --- friendly fire: a blue ball flies through blue blocks and blue units
    bb = [blk("s14", "wood", 14, 45), blk("s14", "stone", 16, 45)]
    bu = [unit("endo", 18, 49)] + [unit("endo", 2 + i, 49) for i in range(8)] + [unit("king", 22, 49)]
    fresh(bb, [], bu, filler("red"))
    cdp.pump(1)
    ball(11, 48.5, 30, -1.2); cdp.pump(2.5)
    check("own cannonball passes through own blocks", E(f"{D}.blocks.filter(b=>b.gm.side==='blue').length") == 2)
    check("own cannonball passes through own units", E(f"{D}.units.filter(u=>u.gm.side==='blue').length") == 10)

    # --- ropes: a ball flies through the rope but still kills the enemy hanging on it
    rb = [blk("s41", "wood", 60, 38), blk("s14", "stone", 63, 39), blk("s14", "stone", 63, 43), blk("s13", "stone", 63, 47),
          blk("r6", "rope", 60, 39), blk("s14", "stone", 59, 39), blk("s14", "stone", 59, 43), blk("s13", "stone", 59, 47)]
    ru = [unit("king", 60, 40)] + [unit("endo", 65 + i, 49) for i in range(9)]
    fresh([], rb, filler("blue"), ru)
    cdp.pump(1)
    check("King Freddy hangs on the rope", E(f"{D}.units.some(u=>u.gm.kind==='king'&&u.gm.side==='red'&&u.gm.hang)") is True)
    look(60, 42, 1.4); cdp.pump(0.2); shot("48a-rope-king")
    E(f"(() => {{ const d={D}; d.blocks.filter(b=>b.gm.shape==='s14'&&Math.floor(b.position.x/40)===59&&b.position.y<1700).forEach(b=>{{b.gm.dead=true; Matter.Composite.remove(d.engine.world,b);}}); }})()")
    ball(56, 40.5, 12, 0); cdp.pump(1.5)
    check("the ball kills the unit on the rope", E(f"{D}.units.some(u=>u.gm.kind==='king'&&u.gm.side==='red')") is False)
    check("the rope itself is untouched", E(f"{D}.specials.filter(s=>s.mat==='rope').length") == 1)

    # --- breaking in: a blue unit inside red land smashes red blocks (stone 1, wood 2, glass 3)
    rb = [blk("s11", "stone", 56, 49), blk("s11", "wood", 54, 49), blk("s11", "glass", 55, 48)]
    fresh([], rb, [unit("endo", 55, 49)] + [unit("endo", 2 + i, 49) for i in range(8)] + [unit("king", 20, 49)], filler("red"))
    cdp.pump(1)
    E(f"{D}.doAct({{t:'mode', v:'dice'}}); {D}.doAct({{t:'roll', v:6}})"); cdp.pump(1)
    uid = E(f"{D}.units.find(u=>Math.floor(u.position.x/40)===55).gm.id")
    costs = E(f"{D}.breakTargets({D}.units.find(u=>u.gm.id==={uid})).map(t=>[t.b.gm.mat,t.cost]).sort()")
    check("break prices: glass 3, stone 1, wood 2", costs == [["glass", 3], ["stone", 1], ["wood", 2]], str(costs))
    look(55, 47, 1.8); E(f"{D}.S.sel={uid}"); cdp.pump(0.3); shot("48-break-prices")
    for mat in ("stone", "wood"):
        bid = E(f"{D}.blocks.find(b=>b.gm.mat==='{mat}').gm.id")
        E(f"{D}.doAct({{t:'break', id:{uid}, bid:{bid}}})"); cdp.pump(0.2)
    check("smashed stone + wood for 3 points", E(f"{D}.S.pts") == 3 and E(f"{D}.blocks.length") == 1, f"pts {E(f'{D}.S.pts')}")
    bid = E(f"{D}.blocks[0].gm.id"); E(f"{D}.doAct({{t:'break', id:{uid}, bid:{bid}}})"); cdp.pump(0.2)
    check("glass costs the last 3 points", E(f"{D}.S.pts") == 0 and E(f"{D}.blocks.length") == 0)
    fresh([blk("s11", "stone", 11, 49)], [], [unit("endo", 10, 49)] + [unit("endo", 12 + i, 49) for i in range(8)] + [unit("king", 22, 49)], filler("red"))
    cdp.pump(1)
    check("no breaking outside enemy land", E(f"{D}.breakTargets({D}.units.find(u=>Math.floor(u.position.x/40)===10)).length") == 0)

    # --- Foxy: two squares for each point, attacks only next to him
    fresh([], [], [unit("foxy", 10, 49)] + [unit("endo", 0 + i, 49) for i in range(8)] + [unit("king", 22, 49)], filler("red"))
    cdp.pump(1)
    E(f"{D}.doAct({{t:'mode', v:'dice'}}); {D}.doAct({{t:'roll', v:2}})"); cdp.pump(1)
    for _ in range(20):
        if E(f"{D}.S.rolling") == 0: break
        cdp.pump(0.2)
    fid = E(f"{D}.units.find(u=>u.gm.kind==='foxy').gm.id")
    for c_ in (11, 12, 13, 14):
        E(f"{D}.doAct({{t:'move', id:{fid}, c:{c_}, r:49}})"); cdp.pump(0.2)
    fc = E(f"{D}.unitCell({D}.units.find(u=>u.gm.id==={fid}))")
    check("Foxy moved 4 squares on 2 points", fc["c"] == 14 and E(f"{D}.S.pts") == 0, str(fc))
    n = E(f"(() => {{ const d={D}; return Math.max(...d.moveTargets(d.units.find(u=>u.gm.kind==='foxy')).map(t=>Math.abs(t.c-14))); }})()")
    check("Foxy's targets are only the squares next to him", n == 1, str(n))

    # --- desert: red on the plateau; a blue unit can climb the staircase all the way up
    fresh([], [], [unit("endo", 26, 49)] + [unit("endo", 2 + i, 49) for i in range(8)] + [unit("king", 20, 49)],
          [unit("endo", 62 + i, 41) for i in range(9)] + [unit("king", 56, 41)], "'desert', 'red'")
    cdp.pump(1.5)
    rows = E(f"{D}.units.filter(u=>u.gm.side==='red').map(u=>{D}.unitCell(u).r)")
    check("red units stand on the plateau", all(r == 41 for r in rows), str(rows))
    E(f"{D}.doAct({{t:'mode', v:'dice'}}); {D}.doAct({{t:'roll', v:6}})"); cdp.pump(1)
    uid = E(f"{D}.units.find(u=>Math.floor(u.position.x/40)===26).gm.id")
    moved = 0
    for step in range(40):
        E(f"{D}.S.pts = 5")
        t = E(f"(() => {{ const d={D}, u=d.units.find(u=>u.gm.id==={uid}); const c0=d.unitCell(u).c; const ts=d.moveTargets(u).filter(t=>!t.cap&&t.c>c0); ts.sort((a,b)=>(a.r-b.r)); return ts[0] || null; }})()")
        if not t: break
        E(f"{D}.doAct({{t:'move', id:{uid}, c:{t['c']}, r:{t['r']}}})"); cdp.pump(0.15); moved += 1
        if E(f"{D}.unitCell({D}.units.find(u=>u.gm.id==={uid})).c") >= 51: break
    cdp.pump(0.8)
    c = E(f"{D}.unitCell({D}.units.find(u=>u.gm.id==={uid}))")
    check("a blue unit climbs the slope onto red's plateau", c["c"] >= 47 and c["r"] == 41, f"{c} after {moved} steps")
    look(39, 45, 0.9); cdp.pump(0.3); shot("49-desert-climb")

    # --- heads close-up, some mid-blink
    fresh([], [], [unit("endo", 10, 49), unit("king", 11, 49), unit("bonnie", 12, 49), unit("chica", 13, 49), unit("cupcake", 14, 49), unit("foxy", 15, 49)] + [unit("endo", 20 + i, 49) for i in range(5)], filler("red"))
    cdp.pump(1)
    look(12.5, 48.3, 2.2); cdp.pump(0.2); shot("46-heads-open")
    url = E(f"(() => {{ {D}.units.forEach(u=>{{u.gm.blink=-0.08;}}); {D}.frameNow(); return document.getElementById('game').toDataURL('image/png'); }})()")
    open(os.path.join(HERE, "shots", "47-heads-blink.png"), "wb").write(base64.b64decode(url.split(",", 1)[1]))

    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
