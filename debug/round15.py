"""v0.5.1: a miss always gets its one more try (even on the shot that overheats the cannon); leaving a campaign
level costs nothing but losing one costs 10; OFFER DRAW in Local matches (+5 each); the bots use their fighters' powers.
Run:  python debug/round15.py
"""
import os, sys, json, time, subprocess, socket, base64
sys.path.insert(0, r"C:\Users\JesusFam\slayerfiles-debug")
import harness

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
fails = []
def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  ({extra})" if extra else ""))
    if not ok: fails.append(name)

s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(["node", "server.js"], cwd=ROOT, env={**os.environ, "PORT": str(port)}, stdout=subprocess.DEVNULL)
time.sleep(0.8)
proc, cdp = harness.launch_chrome("chrome-fnafsiege-r15")
D = "Game.debug"; E = cdp.eval
nid = [70000]
def unit(kind, c, r, **kw):
    nid[0] += 1; return {"id": nid[0], "kind": kind, "c": c, "r": r, **kw}
def fresh(bu, ru, mode="hotseat", level=None):
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop()")
    E(f"Game.start({{mode:'{mode}'" + (f", level:{level}" if level is not None else "") + "}); document.getElementById('overlay').classList.add('hidden')")
    E(f"{D}.setMap('field')")
    E(f"(() => {{ const S={D}.S; S.layouts.blue={{blocks:[],units:{json.dumps(bu)}}}; S.layouts.red={{blocks:[],units:{json.dumps(ru)}}}; S.ready.red=false; }})()")
    E(f"{D}.readyUp('blue'); {D}.S.phase !== 'battle' && {D}.readyUp('red'); document.getElementById('overlay').classList.add('hidden')")
def wait(cond, t=25):
    end = time.time() + t
    while time.time() < end:
        if E(cond): return True
        cdp.pump(0.2)
    return False
blue10 = lambda: [unit("endo", 2 + i, 49) for i in range(9)] + [unit("king", 20, 49)]
red10 = lambda: [unit("endo", 64 + i, 49) for i in range(9)] + [unit("king", 74, 49)]
try:
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 2, "mobile": True})
    cdp.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"}); cdp.pump(1.5)

    # --- 1. a miss gets its one more try even when that shot overheats the cannon
    fresh(blue10(), red10()); cdp.pump(0.6)
    E(f"{D}.S.heat.blue = 2")                                        # two cannon turns in a row already
    E(f"{D}.onBar('cannon'); {D}.doAct({{t:'shot', vx:-2, vy:-2}})")
    check("a missed shot that overheats the cannon still gets one more try", wait(f"{D}.S.act==='aim' && {D}.S.retried && {D}.S.turn==='blue'"))
    check("...the cannon cools down from next turn", E(f"{D}.S.cool.blue") == 2)
    E(f"{D}.doAct({{t:'shot', vx:-2, vy:-2}})")
    check("...and the try itself doesn't add heat", wait(f"{D}.S.turn==='red'") and E(f"{D}.S.heat.blue") == 0)

    # --- 2. campaign: leaving costs nothing, losing to the bot costs 10
    E("Store.set('coins', 50); Store.set('activeMatch', false)")
    fresh(blue10(), red10(), mode="campaign", level=0); cdp.pump(0.5)
    check("a campaign level isn't tracked as a match you can be punished for leaving", E("Store.get('activeMatch')") is False)
    E("document.getElementById('hudMenu').click()"); cdp.pump(0.2)
    check("...the pause menu has no draw offer in the campaign", "OFFER DRAW" not in E("document.getElementById('overlay').textContent"))
    E("document.querySelector('[data-o=quit]').click()"); cdp.pump(0.5)
    check("leaving a campaign level costs nothing", E("Store.get('coins')") == 50)
    fresh(blue10(), red10(), mode="campaign", level=0); cdp.pump(0.5)
    E(f"(() => {{ {D}.S.cannonDown.blue = true; for (const u of {D}.units.filter(u=>u.gm.side==='blue')) {D}.damageUnit(u, 9, 'test'); }})()")
    E(f"{D}.doAct({{t:'mode', v:'dice'}}); {D}.doAct({{t:'endturn'}})")      # no soldiers and no cannon: that's a loss
    wait(f"{D}.S.result", 40)
    check("losing a campaign level to the bot costs 10", E(f"{D}.S.result") == "red" and E("Store.get('coins')") == 40, f"result {E(f'{D}.S.result')}, coins {E(chr(83)+'tore.get(\"coins\")')}")

    # --- 3. OFFER DRAW in a Local match
    E("document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); Game.running && Game.stop(); Store.set('coins', 20)")
    E("Game.start({mode:'online', mySide:'blue'}); document.getElementById('overlay').classList.add('hidden')"); cdp.pump(0.3)
    check("a Local match counts as one you'd lose by leaving", E("Store.get('activeMatch')") is True)
    E("document.getElementById('hudMenu').click()"); cdp.pump(0.2)
    check("the pause menu offers a draw in a Local match", "OFFER DRAW" in E("document.getElementById('overlay').textContent"))
    E("document.querySelector('[data-o=offerdraw]').click()"); cdp.pump(0.2)
    E("Game.netMsg({type:'drawreply', ok:false})"); cdp.pump(0.2)
    check("if they say no, the match goes on", E(f"{D}.S.result") is None and "keep playing" in E("document.getElementById('toast').textContent"))
    E("Game.netMsg({type:'drawoffer'})"); cdp.pump(0.3)
    check("an offered draw asks the other player", "ACCEPT DRAW" in E("document.getElementById('overlay').textContent"))
    E("document.querySelector('[data-o=drawyes]').click()"); cdp.pump(1.5)
    check("accepting ends the match as a draw, +5 coins", E(f"{D}.S.result") == "draw" and E("Store.get('coins')") == 25 and E("Store.get('activeMatch')") is False)
    check("...and shows the DRAW screen", "DRAW" in E("document.getElementById('overlay').textContent"))

    # --- 4. the bots use their fighters' powers
    def bot_power(red, label, cond, t=10):
        fresh(blue10(), red, mode="campaign", level=10); cdp.pump(0.8)
        E(f"{D}.S.turn = 'red'; {D}.S.cpu = 'red'; {D}.doAct({{t:'mode', v:'dice'}}); {D}.S.rolls = 3; {D}.S.pts = 0")
        ok = False
        for _ in range(6):
            E(f"{D}.cpuPower(new Set())"); cdp.pump(0.3)
            if wait(cond, t): ok = True; break
            E(f"{D}.S.act = 'dice'; {D}.S.rolls = 3; {D}.S.pts = 0")
        check(label, ok)
    others = lambda: [unit("endo", 64 + i, 49) for i in range(8)] + [unit("king", 74, 49)]
    bot_power([unit("toybonnie", 60, 49)] + others(), "the bot launches Toy Bonnie into your land",
              f"{D}.units.some(u=>u.gm.kind==='toybonnie' && Math.floor(u.position.x/40) < 50)")
    bot_power([unit("chica", 60, 49)] + others(), "the bot throws Chica's cupcake", f"{D}.units.some(u=>u.gm.kind==='cupcake')")
    bot_power([unit("burntfoxy", 55, 49)] + others(), "the bot's Burnt Foxy shoots a fireball", f"{D}.balls.some(b=>b.gm.shot==='fire') || {D}.S.magic > 0")
    bot_power([unit("djmm", 60, 49), unit("foxy", 61, 49)] + others()[:7] + [unit("king", 74, 49)], "the bot's DJ Music Man throws a comrade over",
              f"{D}.units.some(u=>u.gm.kind==='foxy' && Math.floor(u.position.x/40) < 50)")
    bot_power([unit("pbennard", 72, 49), unit("endo", 40, 49)] + others()[:7] + [unit("king", 74, 49)], "the bot's Pitch Black Ennard teleports up to its raider",
              f"Math.abs({D}.units.find(u=>u.gm.kind==='pbennard').position.x/40 - 40.5) < 2.5")

    errs = [e for e in cdp.events if e["method"] == "Runtime.exceptionThrown"]
    check("no JS errors", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(proc); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
