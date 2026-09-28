'use strict';
// LOCAL play: two phones on the same Wi-Fi connect straight to each other (WebRTC through PeerJS).
// Phones on one network share a public IP, so a hosted game is named after a hash of that IP plus a slot
// number; the other phone finds it by knocking on those few names. No server of our own is needed,
// which is what lets this work inside the installed app.
const Net = (() => {
  const PREFIX = 'fnafsiege-v2-', SLOTS = 6;
  let peer = null, conn = null, side = null, group = null, myName = '', hostNames = {};

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

  const N = {
    onMessage: null,
    get side() { return side; },
    emit(m) { if (N.onMessage) N.onMessage(m); },
    available: () => typeof Peer !== 'undefined' && navigator.onLine !== false,

    async host(name) {
      myName = name;
      const g = await netGroup();
      for (let i = 0; i < SLOTS; i++) {
        try { peer = await openPeer(slotId(g, i)); break; }
        catch (e) { if (e.type !== 'unavailable-id') throw e; }
      }
      if (!peer) throw new Error('Too many games on this network right now.');
      side = 'blue';
      peer.on('error', () => {});
      peer.on('connection', c => {
        c.on('open', () => {
          const meta = c.metadata || {};
          if (meta.probe) { c.send({ type: 'hello', name: myName, busy: !!conn }); setTimeout(() => c.close(), 1500); return; }
          if (conn) { c.send({ type: 'full' }); setTimeout(() => c.close(), 500); return; }
          conn = c; wire(c);
          c.send({ type: 'welcome', name: myName });
          N.emit({ type: 'joined', name: meta.name || 'Player' });
        });
      });
    },

    // games waiting on this Wi-Fi: [{id, name}]
    async list() {
      const g = await netGroup(), p = await browserPeer();
      const found = await Promise.all(Array.from({ length: SLOTS }, (_, i) => new Promise(done => {
        const id = slotId(g, i);
        if (peer && peer.id === id) return done(null);          // our own game
        const c = p.connect(id, { metadata: { probe: true }, reliable: true });
        const t = setTimeout(() => { c.close(); done(null); }, 3000);
        c.on('data', m => { if (m.type === 'hello') { clearTimeout(t); c.close(); done(m.busy ? null : { id, name: m.name }); } });
        c.on('error', () => { clearTimeout(t); done(null); });
      })));
      return found.filter(Boolean);
    },

    async join(id, name) {
      const p = await browserPeer();
      return new Promise((ok, bad) => {
        const c = p.connect(id, { metadata: { name }, reliable: true });
        const t = setTimeout(() => { c.close(); bad(new Error('That game did not answer.')); }, 8000);
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
      if (conn && conn.open) { try { conn.send({ type: 'bye' }); } catch (e) {} }
      const c = conn, p = peer;
      conn = null; side = null; peer = null;
      setTimeout(() => { try { c && c.close(); } catch (e) {} try { p && p.destroy(); } catch (e) {} }, 300);
    },
  };
  return N;
})();
