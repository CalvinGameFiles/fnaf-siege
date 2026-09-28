'use strict';
// Menus: main menu, play (campaign / local), shop, inventory + equipment bar, options, how to play, quit.
(() => {
  const $ = id => document.getElementById(id);
  const SHOP_PLACEHOLDERS = ['#fb8c00', '#fdd835', '#43a047', '#00acc1', '#1e88e5', '#5e35b1', '#d81b60', '#6d4c41', '#546e7a', '#7cb342'];
  const AIM_COLORS = ['#ffffff', '#ffe04a', '#ff4a4a', '#5cff7a', '#4ad8ff', '#ff5cf0', '#ff9a1a'];
  const DEV_ALL_LEVELS = false;         // true = every level open (for testing)
  let roomTimer = null, current = 'menu', selLevel = 0;

  let toastT;
  function toast(msg) {
    const t = $('uiToast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function show(id) {
    current = id;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    clearInterval(roomTimer);
    document.querySelectorAll('.coin-n').forEach(n => (n.textContent = Store.get('coins')));
    if (id === 'campaign') renderCampaign();
    if (id === 'shop') renderShop();
    if (id === 'options') refreshOptions();
    if (id === 'local') openLocal();
    if (id === 'quit') quitApp();
  }
  function hideAll() { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); clearInterval(roomTimer); current = null; }
  function quitApp() {
    if (window.AndroidApp && window.AndroidApp.quit) { window.AndroidApp.quit(); return; }
    try { window.close(); } catch (e) {}
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    Sfx.play(b.dataset.go === 'menu' || b.textContent.includes('BACK') ? 'back' : 'click');
    show(b.dataset.go);
  });

  // ---- campaign: 50 levels (10 to a page) + PLAY, the inventory, and the gold equipment bar
  const levelOpen = i => DEV_ALL_LEVELS || i === 0 || Store.get('beaten').includes(i);
  const PAGE = 10;
  let page = 0;
  $('lvlPrev').onclick = () => { if (page > 0) { page--; Sfx.play('click'); renderCampaign(); } };
  $('lvlNext').onclick = () => { if ((page + 1) * PAGE < Game.LEVELS.length) { page++; Sfx.play('click'); renderCampaign(); } };
  function renderCampaign() {
    const box = $('levels'); box.innerHTML = '';
    const n = Game.LEVELS.length, pages = Math.ceil(n / PAGE);
    $('lvlPage').textContent = `Levels ${page * PAGE + 1}-${Math.min(n, page * PAGE + PAGE)}`;
    $('lvlPrev').disabled = page === 0; $('lvlNext').disabled = page >= pages - 1;
    Game.LEVELS.forEach((L, i) => {
      if (Math.floor(i / PAGE) !== page) return;
      const d = document.createElement('div');
      const done = Store.get('beaten').includes(i + 1);
      d.className = 'lvl' + (i === selLevel ? ' sel' : '') + (done ? ' done' : '') + (levelOpen(i) ? '' : ' locked');
      d.innerHTML = `<span>${i + 1}</span>${done ? '<i>&#10004;</i>' : ''}`;
      d.onclick = () => {
        if (!levelOpen(i)) { Sfx.play('bad'); toast('Beat the level before it first'); return; }
        Sfx.play('click'); selLevel = i; renderCampaign();
      };
      box.appendChild(d);
    });
    const L = Game.LEVELS[selLevel];
    $('lvlInfo').innerHTML = `<b>Level ${selLevel + 1}: ${L.name}</b>${Game.lineupHTML(L)}`;
    renderInventory();
  }
  $('playLevel').onclick = () => {
    if (!levelOpen(selLevel)) return;
    Sfx.play('click');
    startGame({ mode: 'campaign', level: selLevel });
  };
  function itemTile(id, from, idx) {
    const it = ITEMS[id];
    return `<div class="item" data-id="${id}" data-from="${from}" data-i="${idx}" title="${it.name}"><img src="${it.img}" draggable="false"></div>`;
  }
  function renderInventory() {
    const inv = Store.inventory();
    $('invGrid').innerHTML = inv.length ? inv.map(id => itemTile(id, 'inv', -1)).join('') : '<p class="small">Empty - visit the Shop.</p>';
    $('equipBar').innerHTML = Store.get('equip').map((id, i) =>
      `<div class="slot" data-slot="${i}">${id && ITEMS[id] ? itemTile(id, 'bar', i) : ''}</div>`).join('');
  }
  // drag items between the inventory and the 10 gold slots
  let drag = null;
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest('#campaign .item');
    if (!el) return;
    e.preventDefault();
    drag = { id: el.dataset.id, from: el.dataset.from, i: +el.dataset.i };
    const g = $('dragGhost'); g.src = ITEMS[drag.id].img; g.classList.remove('hidden');
    ghost(e);
    el.classList.add('lifted');
  });
  document.addEventListener('pointermove', e => { if (drag) ghost(e); });
  document.addEventListener('pointerup', e => {
    if (!drag) return;
    $('dragGhost').classList.add('hidden');
    const d = drag; drag = null;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const slot = under && under.closest('#equipBar .slot');
    const eq = Store.get('equip').slice();
    if (slot) {
      const to = +slot.dataset.slot;
      if (d.from === 'bar') { const t = eq[to]; eq[to] = d.id; eq[d.i] = t; }
      else eq[to] = d.id;                          // whatever was there goes back to the inventory
      Store.set('equip', eq); Sfx.play('place');
    } else if (under && under.closest('.camp-right') && d.from === 'bar') {
      eq[d.i] = null; Store.set('equip', eq); Sfx.play('back');
    }
    renderInventory();
  });
  function ghost(e) { const g = $('dragGhost'); g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; }

  // ---- shop: five sections by price (Common, Uncommon, Rare, Ultra Rare, Legendary) - the arrows flip between them.
  // Each holds the masks, King upgrades, looks and cannonball powers of that rarity.
  let rarity = 0;
  const previews = {};
  const coinsNow = () => document.querySelectorAll('.coin-n').forEach(n => (n.textContent = Store.get('coins')));
  $('rarPrev').onclick = () => { rarity = (rarity + RARITY.length - 1) % RARITY.length; Sfx.play('click'); renderShop(); };
  $('rarNext').onclick = () => { rarity = (rarity + 1) % RARITY.length; Sfx.play('click'); renderShop(); };
  // every item for sale: [key, section label, name, price, picture, kind ('mask' or the look category), id]
  function shopList() {
    const out = [];
    for (const id in ITEMS) out.push({ key: id, cat: ITEMS[id].king ? 'King Upgrades' : 'Fighters', name: ITEMS[id].name, price: ITEMS[id].price, img: ITEMS[id].img, look: null, id, desc: ITEMS[id].desc });
    for (const cat in COSMETICS) for (const id in COSMETICS[cat].items) {
      const [name, price, img] = COSMETICS[cat].items[id];
      out.push({ key: cat + ':' + id, cat: COSMETICS[cat].label, name, price, img: img || previews[cat + ':' + id] || (previews[cat + ':' + id] = Game.preview(cat, id)), look: cat, id,
        desc: cat === 'ball' ? BALL_DESC[id] : '' });
    }
    return out;
  }
  const BALL_DESC = {
    moon: 'Cannonball power: fire it once a match. When it hits the enemy base, ALL their glass is destroyed.',
    sun: 'Cannonball power: fire it once a match. When it hits the enemy base, ALL their wood is destroyed.',
    swamp: 'Cannonball power: fire it once a match. When it hits the enemy base, ALL their stone is destroyed.',
  };
  function renderShop() {
    const R = RARITY[rarity];
    $('rarName').textContent = R.name.toUpperCase();
    $('rarName').className = 'rar-' + R.id;
    $('rarHint').textContent = `${R.name}: ${rarity ? RARITY[rarity - 1].max + 10 : 10}-${R.max === Infinity ? 100 : R.max} coins`;
    const box = $('shopgrid'); box.innerHTML = '';
    let lastCat = null;
    for (const it of shopList().filter(x => rarityOf(x.price) === rarity)) {
      if (it.cat !== lastCat) { const h = document.createElement('div'); h.className = 'shop-cat'; h.textContent = it.cat.toUpperCase(); box.appendChild(h); lastCat = it.cat; }
      const owned = Store.get('owned')[it.key], on = it.look && Store.get('looks')[it.look] === it.id;
      const d = document.createElement('div');
      d.className = `shopitem card r-${R.id}${it.look ? ' look' : ''}${owned ? ' owned' : ''}${on ? ' equipped' : ''}`;
      d.dataset.key = it.key;
      const tag = on ? 'EQUIPPED' : owned ? (it.look ? 'TAP TO USE' : 'OWNED') : `<span class="price">${it.price} coins</span>`;
      d.innerHTML = `<img src="${it.img}"><b>${it.name}</b><span>${tag}</span>`;
      d.title = it.desc || '';
      d.onclick = () => buy(it);
      box.appendChild(d);
    }
  }
  function buy(it) {
    const o = Store.get('owned');
    if (!it.look) {                                   // a mask / King upgrade: one of each
      if (o[it.key]) { Sfx.play('bad'); toast('You already have the only one'); return; }
      if (Store.get('coins') < it.price) { Sfx.play('bad'); toast(`Not enough coins - ${it.name} costs ${it.price}`); return; }
      Store.set('coins', Store.get('coins') - it.price);
      o[it.key] = true; Store.set('owned', o);
      Sfx.play('win'); toast(`${it.name} is in your inventory!`);
    } else {                                          // looks: buy once, then tap to equip or take off
      const L = Store.get('looks');
      if (!o[it.key]) {
        if (Store.get('coins') < it.price) { Sfx.play('bad'); toast(`Not enough coins - ${it.name} costs ${it.price}`); return; }
        Store.set('coins', Store.get('coins') - it.price);
        o[it.key] = true; Store.set('owned', o); L[it.look] = it.id; Sfx.play('win'); toast(`${it.name} bought and equipped!`);
      } else if (L[it.look] === it.id) { delete L[it.look]; Sfx.play('back'); toast(`${it.name} taken off`); }
      else { L[it.look] = it.id; Sfx.play('click'); toast(`${it.name} equipped`); }
      Store.set('looks', L);
    }
    renderShop(); coinsNow();
  }

  // ---- options
  for (const c of AIM_COLORS) {
    const s = document.createElement('div');
    s.className = 'sw'; s.style.background = c; s.dataset.c = c;
    s.onclick = () => { Store.set('aimColor', c); Sfx.play('click'); refreshOptions(); };
    $('aimColors').appendChild(s);
  }
  $('aimToggle').onclick = () => { Store.set('aimOn', !Store.get('aimOn')); Sfx.play('click'); refreshOptions(); };
  $('vol').oninput = e => { const v = +e.target.value; Store.set('volume', v); Sfx.setVolume(v); $('volN').textContent = Math.round(v * 100) + '%'; };
  $('vol').onchange = () => Sfx.play('click');
  function refreshOptions() {
    document.querySelectorAll('.sw').forEach(s => s.classList.toggle('on', s.dataset.c === Store.get('aimColor')));
    const on = Store.get('aimOn');
    $('aimToggle').textContent = on ? 'ON' : 'OFF'; $('aimToggle').classList.toggle('off', !on);
    $('vol').value = Store.get('volume'); $('volN').textContent = Math.round(Store.get('volume') * 100) + '%';
  }

  // ---- local play (same Wi-Fi)
  $('nameIn').value = Store.get('name');
  $('nameIn').onchange = e => Store.set('name', e.target.value.trim().slice(0, 12) || Store.get('name'));
  function openLocal() {
    const ok = Net.available();
    $('localOnline').classList.toggle('hidden', !ok);
    $('localOffline').classList.toggle('hidden', ok);
    if (!ok) return;
    $('roomList').innerHTML = '<p class="small">Looking for games...</p>';
    refreshRooms();
    roomTimer = setInterval(refreshRooms, 3500);
  }
  let listing = false;
  async function refreshRooms() {
    if (listing) return;
    listing = true;
    let list;
    try { list = await Net.list(); } catch (e) { list = null; }
    listing = false;
    if (current !== 'local') return;
    const box = $('roomList');
    if (!list) { box.innerHTML = '<p class="small">Could not reach the internet to look for games.</p>'; return; }
    if (!list.length) { box.innerHTML = '<p class="small">No games yet - host one, or wait for a friend to host.</p>'; return; }
    box.innerHTML = '';
    for (const r of list) {
      const b = document.createElement('button');
      b.className = 'room';
      b.textContent = `Join ${r.name}'s game`;
      b.onclick = () => joinRoom(r.id);
      box.appendChild(b);
    }
  }
  $('hostBtn').onclick = async () => {
    Sfx.play('click');
    $('hostBtn').disabled = true;
    try { await Net.host(Store.get('name')); show('waiting'); }
    catch (e) { toast(e.message && e.message.length < 80 ? e.message : 'Could not start a game - check the internet'); }
    $('hostBtn').disabled = false;
  };
  $('cancelHost').onclick = () => { Sfx.play('back'); Net.close(); show('local'); };
  async function joinRoom(id) {
    Sfx.play('click');
    clearInterval(roomTimer);
    try { await Net.join(id, Store.get('name')); } catch (e) { toast(e.message || 'Could not join'); openLocal(); return; }
    startGame({ mode: 'online', mySide: 'red' });
  }
  Net.onMessage = m => {
    if (m.type === 'joined' && current === 'waiting') { startGame({ mode: 'online', mySide: 'blue' }); return; }
    if (Game.running) Game.netMsg(m);
  };
  $('hotseatBtn').onclick = () => { Sfx.play('click'); startGame({ mode: 'hotseat' }); };

  function startGame(opts) { hideAll(); Game.start(opts); }
  Game.onExit = wasCampaign => show(wasCampaign ? 'campaign' : 'menu');

  // the phone's back button (inside the app)
  const BACK = { mode: 'menu', campaign: 'mode', shop: 'campaign', local: 'mode', options: 'menu', guide: 'options', quit: 'menu' };
  window.onBackButton = () => {
    if (Game.running) { document.getElementById('hudMenu').click(); return; }
    if (current === 'waiting') { $('cancelHost').click(); return; }
    if (BACK[current]) { Sfx.play('back'); show(BACK[current]); }
  };

  // playing in a phone's web browser (not the app): go full screen on the first tap and hold landscape,
  // and hide QUIT GAME (a web page can't close itself)
  const inApp = !!window.AndroidApp || /Electron/.test(navigator.userAgent);
  if (!inApp) {
    document.querySelector('[data-go=quit]').classList.add('hidden');
    if (matchMedia('(pointer: coarse)').matches) {
      const goFull = () => {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => {
          if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
        }).catch(() => {});
      };
      document.addEventListener('pointerup', goFull, { once: true });
    }
  }
  Game.init();
  show('menu');
  window.UI = { show, toast };
})();
