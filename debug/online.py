"""LOCAL play test over PeerJS: two separate browsers; one hosts, the other finds it in the Wi-Fi list and joins; they build and trade turns.
Needs internet (PeerJS broker + ipify). Run:  python debug/online.py
"""
import os, sys, time, subprocess, socket, base64, json, urllib.request
sys.path.insert(0, r"C:\Users\JesusFam\slayerfiles-debug")
import harness, websocket

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
fails = []
def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  ({extra})" if extra else ""))
    if not ok: fails.append(name)
def shot(c, name):
    r = c.send("Page.captureScreenshot", {"format": "png"}); open(os.path.join(HERE, "shots", name + ".png"), "wb").write(base64.b64decode(r["result"]["data"]))
def launch(profile):
    # like harness.launch_chrome, plus a flag so WebRTC uses plain local addresses between two headless browsers
    port = harness.free_port()
    proc = subprocess.Popen([harness.CHROME, "--headless=new", "--disable-gpu", "--mute-audio", "--no-first-run", "--no-default-browser-check",
        "--disable-extensions", "--disable-features=WebRtcHideLocalIpsWithMdns", f"--remote-debugging-port={port}",
        f"--user-data-dir={os.path.join(harness.SCRATCH, profile)}", "--remote-allow-origins=*", "--window-size=915,412", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(120):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=1) as r:
                pages = [t for t in json.load(r) if t.get("type") == "page"]
            if pages: break
        except Exception: pass
        time.sleep(0.15)
    c = harness.CDP(websocket.create_connection(pages[0]["webSocketDebuggerUrl"], timeout=25))
    c.send("Runtime.enable"); c.send("Page.enable")
    return proc, c

s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(["node", "server.js"], cwd=ROOT, env={**os.environ, "PORT": str(port)}, stdout=subprocess.DEVNULL)
time.sleep(0.8)
pa, A = launch("chrome-fnafsiege-a"); pb, B = launch("chrome-fnafsiege-b")
D = "Game.debug"
def pump(t):
    end = time.time() + t
    while time.time() < end: A.pump(0.1); B.pump(0.1)
def until(cond, t=25):
    end = time.time() + t
    while time.time() < end:
        try:
            if cond(): return True
        except Exception: pass
        pump(0.3)
    return False
try:
    for c in (A, B):
        c.send("Emulation.setDeviceMetricsOverride", {"width": 915, "height": 412, "deviceScaleFactor": 1, "mobile": True})
        c.send("Page.navigate", {"url": f"http://127.0.0.1:{port}/"})
    pump(1.5)
    A.eval("Store.set('name','HOSTY'); document.getElementById('nameIn').value='HOSTY'; UI.show('local')")
    pump(0.5)
    A.eval("document.getElementById('hostBtn').click()")
    check("A is hosting (waiting screen)", until(lambda: A.eval("document.getElementById('waiting').classList.contains('active')"), 20))
    B.eval("UI.show('local')")
    check("B finds A's game on the network", until(lambda: "HOSTY" in (B.eval("document.getElementById('roomList').textContent") or ""), 30),
          B.eval("document.getElementById('roomList').textContent"))
    shot(B, "20-local-list")
    # the SEARCH button runs a search right away
    B.eval("document.getElementById('searchBtn').click()"); pump(0.2)
    check("SEARCH FOR GAMES searches", "SEARCHING" in B.eval("document.getElementById('searchBtn').textContent"))
    check("...and the game is still listed after it", until(lambda: "SEARCH FOR GAMES" in B.eval("document.getElementById('searchBtn').textContent") and "HOSTY" in B.eval("document.getElementById('roomList').textContent"), 15))
    # the host drops off the matchmaking server (like a phone's Wi-Fi blipping): it reconnects by itself
    A.eval("Net._drop()")
    check("the host reconnects by itself after dropping off", until(lambda: A.eval("Net._peer && Net._peer.open && !Net._peer.disconnected") is True, 20))
    check("...its waiting screen says the game is up", until(lambda: "is up" in A.eval("document.getElementById('hostStatus').textContent"), 10))
    # the host's game name is lost completely: it hosts again
    A.eval("Net._peer.destroy()")
    check("a lost game is hosted again automatically", until(lambda: A.eval("!!(Net._peer && Net._peer.open && !Net._peer.destroyed)") is True, 25))
    pump(3)
    check("B still sees A's game after all that", until(lambda: "HOSTY" in B.eval("document.getElementById('roomList').textContent"), 30),
          B.eval("document.getElementById('roomList').textContent"))
    # the bug from the real phones: only the FIRST search found the game (an empty slot's "nobody here" error
    # destroyed the searching peer). Every search must find it, not just the list remembering it.
    hits = [B.eval("Net.list().then(r => r.some(g => g.name === 'HOSTY'))", 40) for _ in range(4)]
    check("four searches in a row each find the game", hits == [True] * 4, str(hits))
    # a join that fails (the game it tried is gone) must not spoil the next join
    t0 = time.time()
    err = B.eval("Net.join('fnafsiege-v2-nosuchgame-9', 'X').then(() => 'joined?!').catch(e => e.message)", 60)
    check("joining a game that's gone fails quickly with a clear message", "gone" in err and time.time() - t0 < 25, f"{err} ({time.time() - t0:.0f}s)")
    # both phones show the same network code
    ca, cb = A.eval("document.getElementById('netCode2').textContent"), B.eval("document.getElementById('netCode').textContent")
    check("both phones show the same network code", ca == cb and len(ca) == 4 and ca != "....", f"{ca} / {cb}")
    # a phone that connects but never finishes joining (what went wrong on the real phones) must NOT start the
    # host's match: the host keeps waiting and its game stays in the list
    hid = A.eval("Net._peer.id")
    B.eval(f"window.__ghost = new Peer({{debug:0}}); __ghost.on('open', () => {{ window.__gc = __ghost.connect('{hid}', {{ metadata: {{ name: 'GHOST' }}, reliable: true }}); }})")
    check("a half-finished join reaches the host", until(lambda: B.eval("!!(window.__gc && window.__gc.open)") is True, 20))
    pump(1.0)
    check("...but the host does NOT start a match with it", A.eval("document.getElementById('waiting').classList.contains('active') && !Game.running") is True)
    pump(12.5)
    check("...and after it times out the host is still waiting", A.eval("document.getElementById('waiting').classList.contains('active') && !Game.running") is True)
    B.eval("__ghost.destroy()")
    check("...and its game is still in the list", until(lambda: "HOSTY" in B.eval("document.getElementById('roomList').textContent"), 20))
    B.eval("document.querySelector('.room').click()")
    check("both in a match", until(lambda: A.eval("Game.running") and B.eval("Game.running"), 20))
    check("A is blue, B is red", A.eval(f"{D}.S.mySide") == "blue" and B.eval(f"{D}.S.mySide") == "red")
    A.eval(f"{D}.onBar('autofort'); {D}.onBar('tounits'); {D}.onBar('ready')")
    check("B hears A is ready", until(lambda: B.eval(f"{D}.S.ready.blue") is True, 10))
    B.eval(f"{D}.onBar('autofort'); {D}.onBar('tounits'); {D}.onBar('ready')")
    check("both battles start", until(lambda: A.eval(f"{D}.S.phase") == "battle" and B.eval(f"{D}.S.phase") == "battle", 10))
    check("same world on both", A.eval(f"{D}.blocks.length") == B.eval(f"{D}.blocks.length"))
    for c in (A, B): c.eval("document.getElementById('overlay').classList.add('hidden')")
    pump(1.5)
    check("B watches blue's side during blue's turn", B.eval(f"{D}.cam.x + 457/{D}.cam.z") < 55 * 40)
    check("both phones play the same map", A.eval(f"{D}.S.map + {D}.S.high") == B.eval(f"{D}.S.map + {D}.S.high"), A.eval(f"{D}.S.map + ' ' + {D}.S.high"))
    A.eval(f"{D}.onBar('cannon'); {D}.doAct({{t:'shot', vx:32, vy:-30}})")
    check("B sees the ball flying", until(lambda: B.eval(f"{D}.balls.length") >= 1, 5))
    check("turn passes to red on both", until(lambda: A.eval(f"{D}.S.turn") == "red" and B.eval(f"{D}.S.turn") == "red", 30))
    pump(0.5)
    sa = A.eval(f"JSON.stringify({D}.snapshot().units.map(u=>[u[0],Math.round(u[3]),Math.round(u[4])]))")
    sb = B.eval(f"JSON.stringify({D}.snapshot().units.map(u=>[u[0],Math.round(u[3]),Math.round(u[4])]))")
    check("unit positions identical after sync", sa == sb)
    B.eval(f"{D}.onBar('dice'); {D}.doAct({{t:'roll', v:4}})")
    check("A sees red's roll", until(lambda: A.eval(f"{D}.S.pts") == 4, 5))
    B.eval(f"{D}.doAct({{t:'endturn'}})")
    check("back to blue on both", until(lambda: A.eval(f"{D}.S.turn") == "blue" and B.eval(f"{D}.S.turn") == "blue", 20))
    B.eval("document.getElementById('hudMenu').click()"); pump(0.3); B.eval("document.querySelector('[data-o=quit]').click()")
    check("A told the opponent left", until(lambda: "MATCH OVER" in (A.eval("document.getElementById('overlay').textContent") or ""), 10))
    for c, n in ((A, "A"), (B, "B")):
        errs = [e for e in c.events if e["method"] == "Runtime.exceptionThrown"]
        check(f"no JS errors on {n}", not errs, str([e["params"]["exceptionDetails"].get("exception", {}).get("description") for e in errs][:3]))
finally:
    harness.kill_chrome(pa); harness.kill_chrome(pb); srv.kill()
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED: {fails}")
