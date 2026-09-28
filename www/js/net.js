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
  // routes between the phones: several STUN servers (to find each phone's address) and PeerJS's relay servers
  // (for networks that won't let the phones talk directly)
  const RTC = { iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  ], sdpSemantics: 'unified-plan' };
  function openPeer(id) {
    return new Promise((ok, bad) => {
      const p = id ? new Peer(id, { debug: 0, config: RTC }) : new Peer({ debug: 0, config: RTC });
      // this error handler is ONLY for starting up. It used to stay attached, so any later error - like the
      // harmless "nobody here" from an empty slot during a search - destroyed the whole peer, mid-search or
      // mid-join. That was the bug behind games vanishing from the list and joins that never got an answer.
      const t = setTimeout(() => { p.off('error', startErr); p.destroy(); bad(new Error('timeout')); }, 10000);
      const startErr = e => { clearTimeout(t); p.off('error', startErr); p.destroy(); bad(e); };
      p.on('open', () => { clearTimeout(t); p.off('error', startErr); ok(p); });
      p.on('error', startErr);
    });
  }
  function wire(c) {
    c.on('data', m => { if (m && m.type === 'bye') N.emit({ type: 'left', reason: 'Your opponent left the match.' }); else N.emit(m); });
    c.on('close', () => { if (conn === c) { conn = null; N.emit({ type: 'left', reason: 'Your opponent disconnected.' }); } });
  }
  // A brand-new, throwaway peer for every search and every join attempt. (Reusing one peer to knock on the same
  // host again silently fails after the first time - that's what made a game show up once and then vanish.)
  async function freshPeer() {
    const p = await openPeer(null);
    p.on('error', () => {});                 // "peer-unavailable" for empty slots is normal
    return p;
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
        // two-way handshake: the match only starts once the other phone answers our welcome. If it never does,
        // this game just keeps waiting (and stays in the list) instead of getting stuck in a half-started match.
        c.send({ type: 'welcome', name: myName });
        const t = setTimeout(() => { if (conn !== c) try { c.close(); } catch (e) {} }, 12000);
        c.on('data', function hi(m) {
          if (!m || m.type !== 'hi' || conn || !hosting) return;
          clearTimeout(t); c.off('data', hi);
          conn = c; wire(c);
          N.emit({ type: 'joined', name: meta.name || 'Player' });
        });
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

  function tryJoin(id, name) {
    return (async () => {
      const p = await freshPeer();
      return new Promise((ok, bad) => {
        const c = p.connect(id, { metadata: { name }, reliable: true });
        let done = false;
        const fail = (msg, final) => { if (done) return; done = true; clearTimeout(t); p.off('error', gone); try { c.close(); } catch (e) {} setTimeout(() => p.destroy(), 500); const e = new Error(msg); e.final = final; bad(e); };
        const t = setTimeout(() => fail('That game did not answer.'), 10000);
        const gone = e => { if (e && e.type === 'peer-unavailable' && String(e.message).includes(id)) fail('That game is gone - ask them to host again.', true); };
        p.on('error', gone);
        c.on('data', function first(m) {
          if (!m) return;
          if (m.type === 'full') { fail('That game is already full.', true); return; }
          if (m.type !== 'welcome' || done) return;
          done = true; clearTimeout(t); p.off('error', gone); c.off('data', first);
          c.send({ type: 'hi' });                      // tell the host we're really here: now it starts the match
          conn = c; peer = p; side = 'red'; wire(c);
          ok({ name: m.name });
        });
        c.on('error', () => fail('Could not connect to that game.'));
      });
    })();
  }

  const N = {
    onMessage: null,
    get side() { return side; },
    emit(m) { if (N.onMessage) N.onMessage(m); },
    available: () => typeof Peer !== 'undefined' && navigator.onLine !== false,
    // a short code for this internet connection: two phones only see each other's games when their codes match
    async networkCode() { try { return (await netGroup()).slice(0, 4).toUpperCase(); } catch (e) { return '----'; } },

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
      const g = await netGroup(), p = await freshPeer();
      const empty = {};                                        // slot id -> finish that knock ("nobody here")
      p.on('error', e => { if (e && e.type === 'peer-unavailable') for (const id in empty) if (String(e.message).includes(id)) empty[id](); });
      const found = await Promise.all(Array.from({ length: SLOTS }, (_, i) => new Promise(done => {
        const id = slotId(g, i);
        if (peer && peer.id === id) return done(null);          // our own game
        empty[id] = () => { clearTimeout(t); try { c.close(); } catch (e) {} done(null); };
        const c = p.connect(id, { metadata: { probe: true }, reliable: true });
        const t = setTimeout(() => { c.close(); done(null); }, 6000);      // a phone can take a few seconds to answer
        c.on('data', m => { if (m.type === 'hello') { clearTimeout(t); c.close(); done(m.busy ? null : { id, name: m.name }); } });
        c.on('error', () => { clearTimeout(t); done(null); });
      })));
      setTimeout(() => p.destroy(), 1000);
      return found.filter(Boolean);
    },

    // onTry(n) is told which attempt this is (up to 3, each on a brand-new connection)
    async join(id, name, onTry) {
      let last = null;
      for (let n = 1; n <= 3; n++) {
        if (onTry) onTry(n);
        try { return await tryJoin(id, name); }
        catch (e) { last = e; if (e.final) break; }
      }
      throw last || new Error('Could not join');
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
