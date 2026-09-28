'use strict';
// LOCAL play: two phones on the same Wi-Fi connect straight to each other (WebRTC through PeerJS).
// Phones on one network share a public IP, so a hosted game is named after a hash of that IP plus a slot
// number; the other phone finds it by knocking on those few names. No server of our own is needed,
// which is what lets this work inside the installed app.
const Net = (() => {
  const PREFIX = 'fnafsiege-v2-', SLOTS = 6;
  let peer = null, conn = null, side = null, group = null, myName = '';
  let hosting = false, watchdog = null, rehosting = false;

  const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  async function netGroup() {
    if (group) return group;
    const r = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
    const { ip } = await r.json();
    return (group = fnv('fnafsiege:' + ip));
  }
  const slotId = (g, i) => `${PREFIX}${g}-${i}`;
  function openPeer(id) {
    return new Promise((ok, bad) => {
      const p = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
      const t = setTimeout(() => { p.destroy(); bad(new Error('timeout')); }, 10000);
      p.on('open', () => { clearTimeout(t); ok(p); });
      p.on('error', e => { clearTimeout(t); p.destroy(); bad(e); });
    });
  }
  function wire(c) {
    c.on('data', m => { if (m && m.type === 'bye') N.emit({ type: 'left', reason: 'Your opponent left the match.' }); else N.emit(m); });
    c.on('close', () => { if (conn === c) { conn = null; N.emit({ type: 'left', reason: 'Your opponent disconnected.' }); } });
  }
  // a quiet peer used only for browsing the list and joining
  let browser = null;
  async function browserPeer() {
    if (browser && !browser.destroyed && browser.open) return browser;
    browser = await openPeer(null);
    browser.on('error', () => {});          // "peer-unavailable" for empty slots is normal
    return browser;
  }

  // --- hosting: take the first free slot name on this network and answer the other phones' knocks
  async function claimSlot() {
    const g = await netGroup();
    let p = null;
    for (let i = 0; i < SLOTS && !p; i++) {
      try { p = await openPeer(slotId(g, i)); }
      catch (e) { if (e.type !== 'unavailable-id') throw e; }
    }
    if (!p) throw new Error('Too many games on this network right now.');
    peer = p;
    p.on('error', () => {});
    // dropped off the matchmaking server (screen dimmed, Wi-Fi blip): get straight back on
    p.on('disconnected', () => {
      if (hosting && !conn && p === peer && !p.destroyed) setTimeout(() => { try { if (p.disconnected && !p.destroyed) p.reconnect(); } catch (e) {} }, 500);
    });
    p.on('connection', c => {
      c.on('open', () => {
        const meta = c.metadata || {};
        if (meta.probe) { c.send({ type: 'hello', name: myName, busy: !!conn }); setTimeout(() => c.close(), 1500); return; }
        if (conn) { c.send({ type: 'full' }); setTimeout(() => c.close(), 500); return; }
        conn = c; wire(c);
        c.send({ type: 'welcome', name: myName });
        N.emit({ type: 'joined', name: meta.name || 'Player' });
      });
    });
  }
  // the game's name was lost for good: host again (in whichever slot is free)
  async function rehost() {
    if (rehosting || !hosting) return;
    rehosting = true;
    try { try { peer && peer.destroy(); } catch (e) {} peer = null; await claimSlot(); }
    catch (e) {}
    rehosting = false;
  }

  const N = {
    onMessage: null,
    get side() { return side; },
    emit(m) { if (N.onMessage) N.onMessage(m); },
    available: () => typeof Peer !== 'undefined' && navigator.onLine !== false,

    async host(name) {
      myName = name;
      hosting = true;
      try { await claimSlot(); } catch (e) { hosting = false; throw e; }
      side = 'blue';
      // a watchdog keeps the game up while it waits for player 2, and tells the waiting screen how it's doing
      clearInterval(watchdog);
      watchdog = setInterval(() => {
        if (!hosting || conn) return;
        if (!peer || peer.destroyed) rehost();
        else if (peer.disconnected) { try { peer.reconnect(); } catch (e) { rehost(); } }
        N.emit({ type: 'hoststatus', ok: !!(peer && peer.open && !peer.disconnected) });
      }, 2500);
    },

    // games waiting on this Wi-Fi: [{id, name}]
    async list() {
      const g = await netGroup(), p = await browserPeer();
      const found = await Promise.all(Array.from({ length: SLOTS }, (_, i) => new Promise(done => {
        const id = slotId(g, i);
        if (peer && peer.id === id) return done(null);          // our own game
        const c = p.connect(id, { metadata: { probe: true }, reliable: true });
        const t = setTimeout(() => { c.close(); done(null); }, 6000);      // a phone can take a few seconds to answer
        c.on('data', m => { if (m.type === 'hello') { clearTimeout(t); c.close(); done(m.busy ? null : { id, name: m.name }); } });
        c.on('error', () => { clearTimeout(t); done(null); });
      })));
      return found.filter(Boolean);
    },

    async join(id, name) {
      const p = await browserPeer();
      return new Promise((ok, bad) => {
        const c = p.connect(id, { metadata: { name }, reliable: true });
        const t = setTimeout(() => { c.close(); bad(new Error('That game did not answer.')); }, 10000);
        c.on('data', function first(m) {
          if (m.type === 'full') { clearTimeout(t); bad(new Error('That game is already full.')); return; }
          if (m.type !== 'welcome') return;
          clearTimeout(t); c.off('data', first);
          conn = c; peer = p; browser = null; side = 'red'; wire(c);
          ok({ name: m.name });
        });
        c.on('error', e => { clearTimeout(t); bad(e); });
      });
    },

    // DataChannels are reliable and ordered, so the other phone replays moves in the same order
    send(msg) { if (conn && conn.open) conn.send(msg); },

    close() {
      hosting = false; clearInterval(watchdog);
      if (conn && conn.open) { try { conn.send({ type: 'bye' }); } catch (e) {} }
      const c = conn, p = peer;
      conn = null; side = null; peer = null;
      setTimeout(() => { try { c && c.close(); } catch (e) {} try { p && p.destroy(); } catch (e) {} }, 300);
    },
    // test hook: pretend the host dropped off the matchmaking server
    _drop() { if (peer) peer.disconnect(); },
    get _peer() { return peer; },
  };
  return N;
})();
