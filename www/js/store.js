'use strict';
// Saved settings and progress (lives on each device).
const Store = (() => {
  // v2 = the priced shop: everyone starts fresh (no coins, no items, only level 1 open).
  // Only the settings and the forts saved with "Save Fort" are carried over from v1.
  const KEY = 'fnafsiege_v2', OLD = 'fnafsiege_v1';
  const DEF = {
    aimColor: '#ffffff', aimOn: true, volume: 0.7,
    coins: 0, name: '',
    owned: {},                         // item id -> true (bought in the shop)
    looks: {},                         // equipped shop looks: { team, stone, wood, glass, cannon, ball }
    forts: [],                         // forts saved with "Save Fort" (they join the Auto Fort rotation)
    equip: Array(10).fill(null),       // the gold equipment bar: item ids usable in a match
    beaten: [],                        // campaign levels won (1-50)
    stats: { wins: 0, draws: 0, losses: 0 },
  };
  let d = JSON.parse(JSON.stringify(DEF));
  try {
    const cur = localStorage.getItem(KEY);
    if (cur) Object.assign(d, JSON.parse(cur));
    else {
      const old = JSON.parse(localStorage.getItem(OLD) || 'null');
      if (old) for (const k of ['aimColor', 'aimOn', 'volume', 'name', 'forts']) if (old[k] != null) d[k] = old[k];
      localStorage.removeItem(OLD);
    }
  } catch (e) {}
  if (!d.looks || typeof d.looks !== 'object') d.looks = {};
  if (!Array.isArray(d.forts)) d.forts = [];
  if (!Array.isArray(d.equip) || d.equip.length !== 10) d.equip = Array(10).fill(null);
  if (!d.name) d.name = 'Player' + Math.floor(100 + Math.random() * 900);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} };
  save();
  return {
    get: k => d[k],
    set(k, v) { d[k] = v; save(); },
    save,
    // result: 'win' | 'draw' | 'loss'  ->  coins won (a loss COSTS 10, but never below 0)
    reward(result) {
      let n = { win: 10, draw: 5, loss: -10 }[result];
      if (d.coins + n < 0) n = -d.coins;
      d.coins += n;
      d.stats[{ win: 'wins', draw: 'draws', loss: 'losses' }[result]]++;
      save();
      return n;
    },
    // owned items that are not sitting in the equipment bar
    inventory: () => Object.keys(d.owned).filter(id => d.owned[id] && ITEMS[id] && !d.equip.includes(id)),   // masks only (looks aren't dragged)
    equipped: () => d.equip.filter(Boolean),
  };
})();

// Everything the shop sells (masks and King upgrades). The price decides the rarity section it shows in.
const ITEMS = {
  bonnie: { name: 'Bonnie Mask', img: 'img/bonnie.png', price: 20, kind: 'bonnie',
    desc: 'Drag onto an Endo to turn it into Bonnie (2 hearts).' },
  chica: { name: 'Chica Mask', img: 'img/chica.png', price: 40, kind: 'chica',
    desc: 'Drag onto an Endo to turn it into Chica. Chica can spend a dice roll to throw her Cupcake, which becomes its own unit.' },
  foxy: { name: 'Foxy Mask', img: 'img/foxy.png', price: 50, kind: 'foxy',
    desc: 'Drag onto an Endo to turn it into Foxy. Foxy moves 2 squares for every dice point (but still only attacks the square next to him).' },
  toybonnie: { name: 'Toy Bonnie Mask', img: 'img/toybonnie.png', price: 30, kind: 'toybonnie',
    desc: 'Toy Bonnie can be fired out of your cannon as the cannonball, and gets up wherever he lands.' },
  bb: { name: 'Balloon Boy Mask', img: 'img/bb.png', price: 20, kind: 'bb',
    desc: 'If Balloon Boy reaches the far edge of the enemy land, he wrecks their cannon.' },
  mangle: { name: 'Mangle Mask', img: 'img/mangle.png', price: 60, kind: 'mangle',
    desc: 'Mangle hangs off any block bigger than one square, like a rope, so she can crawl up walls.' },
  wchica: { name: 'Withered Chica Mask', img: 'img/wchica.png', price: 20, kind: 'wchica',
    desc: 'Withered Chica smashes enemy WOOD blocks for free when she breaks into their land.' },
  ppuppet: { name: 'Phantom Puppet Mask', img: 'img/ppuppet.png', price: 30, kind: 'ppuppet',
    desc: "Phantom Puppet slips straight through the enemy's STONE walls if they are one block thick (not wood or glass)." },
  springtrap: { name: 'Springtrap Mask', img: 'img/springtrap.png', price: 30, kind: 'springtrap',
    desc: 'Springtrap has 3 hearts.' },
  nfoxy: { name: 'Nightmare Foxy Mask', img: 'img/nfoxy.png', price: 40, kind: 'nfoxy',
    desc: 'Like King Freddy, Nightmare Foxy can take out enemies who invade your land.' },
  bidybab: { name: 'Bidybab Mask', img: 'img/bidybab.png', price: 30, kind: 'bidybab',
    desc: 'Launch her (from the cannon, or drag her back on a dice turn) - she splits into two in mid-air.' },
  electrobab: { name: 'Electrobab Mask', img: 'img/electrobab.png', price: 30, kind: 'electrobab',
    desc: "Launch her into the enemy's fort and she explodes, wiping out everything around her." },
  ftfoxy: { name: 'Funtime Foxy Mask', img: 'img/ftfoxy.png', price: 40, kind: 'ftfoxy',
    desc: 'Funtime Foxy smashes enemy GLASS for free when he breaks into their land.' },
  burntfoxy: { name: 'Burnt Foxy Mask', img: 'img/burntfoxy.png', price: 50, kind: 'burntfoxy',
    desc: 'Spend a roll to shoot a fireball: 1 damage to a unit, sets wood on fire, bounces off glass.' },
  glamrock: { name: 'Glamrock Bonnie Mask', img: 'img/glamrock.png', price: 30, kind: 'glamrock',
    desc: "Glamrock Bonnie walks straight through the enemy's WOOD walls if they are one block thick." },
  omcmangle: { name: 'OMC Mangle Mask', img: 'img/omcmangle.png', price: 30, kind: 'omcmangle',
    desc: "OMC Mangle walks straight through the enemy's GLASS walls if they are one block thick." },
  ennard: { name: 'Ennard Mask', img: 'img/ennard.png', price: 50, kind: 'ennard',
    desc: "Ennard walks straight through ANY of the enemy's one-block walls - stone, wood or glass." },
  gfreddy: { name: 'Games Freddy Mask', img: 'img/gfreddy.png', price: 80, kind: 'gfreddy',
    desc: 'Games Freddy flies: wherever the dice move him, he stays up in the air.' },
  mmangle: { name: 'Missing Mangle Mask', img: 'img/mmangle.png', price: 70, kind: 'mmangle',
    desc: 'Spend a roll to shoot pink ooze (magic): enemy blocks it splashes turn to pink plastic - as weak as glass, and 1 point to break.' },
  cbonnie: { name: 'Cookie Bonnie Mask', img: 'img/cbonnie.png', price: 40, kind: 'cbonnie',
    desc: 'Spend a roll to throw a cookie in a dead-straight line: 1 damage to every enemy it passes, flies through glass, stopped by wood and stone.' },
  rfoxy: { name: 'Radioactive Foxy Mask', img: 'img/rfoxy.png', price: 50, kind: 'rfoxy',
    desc: 'Spend a roll to throw radioactive goo (magic): it melts every enemy block in the splash.' },
  chipper: { name: 'Chipper Mask', img: 'img/chipper.png', price: 100, kind: 'chipper',
    desc: 'Chipper digs: he can step down into the earth and tunnel along under the forts (up to 3 squares deep), then pop up anywhere. Nothing can hit him while he is underground.' },
  gendo: { name: 'Glamrock Endo Mask', img: 'img/gendo.png', price: 90, kind: 'gendo',
    desc: 'While Glamrock Endo is alive, ALL your units can take out enemies who invade your land (normally only the King can). Only his death ends it.' },
  djmm: { name: 'DJ Music Man Mask', img: 'img/djmm.png', price: 60, kind: 'djmm',
    desc: 'Spend a roll: DJ Music Man grabs a comrade touching him and throws them as far as the cannon can, into enemy land to fight.' },
  fmangle: { name: 'Festive Mangle Mask', img: 'img/fmangle.png', price: 60, kind: 'fmangle',
    desc: 'Spend a roll to cast festive magic: it goes straight through wood, shoves stone over like foam blocks, bounces off glass and KILLS every enemy it touches.' },
  pbennard: { name: 'Pitch Black Ennard Mask', img: 'img/pbennard.png', price: 70, kind: 'pbennard',
    desc: 'Spend a roll: Pitch Black Ennard teleports onto any free square next to a comrade of your choice.' },
  dmangle: { name: 'Dust Mangle Mask', img: 'img/dmangle.png', price: 30, kind: 'dmangle',
    desc: "Launch her (from the cannon, or drag her back on a dice turn). When she lands in the enemy's land she covers them in green dust: while she stays there, their dice rolls are cut in half." },
  fbb: { name: 'Festive BB Mask', img: 'img/fbb.png', price: 40, kind: 'fbb',
    desc: "Festive BB can't be crushed by falling blocks. Only units, cannonballs and shots can take him out." },
  // King upgrades: dropped onto the King
  books: { name: 'Books Freddy (King)', img: 'img/books.png', price: 60, kind: 'books', king: true,
    desc: 'King upgrade: your King gets 3 hearts.' },
  blfreddy: { name: 'Black Light Freddy (King)', img: 'img/blfreddy.png', price: 70, kind: 'blfreddy', king: true,
    desc: "King upgrade: spend a roll and the King shoots a blue cannonball. It smashes straight through stone and glass, but can't break wood." },
  dread: { name: 'Dread Bear (King)', img: 'img/dread.png', price: 60, kind: 'dread', king: true,
    desc: "King upgrade: cannonballs, shots, blasts and attacks can't hurt him - only a falling block can. Once a match he can give one of your units 3 hearts." },
  molten: { name: 'Molten Freddy (King)', img: 'img/molten.png', price: 50, kind: 'molten', king: true,
    desc: "King upgrade: the King can launch himself like Toy Bonnie, and walks through ANY of the enemy's one-block walls." },
  funtime: { name: 'Funtime Freddy (King)', img: 'img/funtime.png', price: 80, kind: 'funtime', king: true,
    desc: "King upgrade: wrecks the enemy cannon if he reaches the far edge of their land. At full health he can revive a fallen comrade instead of firing the cannon (you still roll the dice). Killed in enemy land, he explodes." },
  unknown: { name: 'Unidentified Freddy (King)', img: 'img/unknown.png', price: 70, kind: 'unknown', king: true,
    desc: "King upgrade: every match the King gets ONE random ability from all the fighters in the game - a different one each time." },
};

// Looks: team colours, block colours, cannons and cannonball powers (bought once, then tap to equip / unequip).
// items: id -> [name, price]; the cannonball powers also have a picture.
const COSMETICS = {
  // RED and BLUE too: whoever buys one plays in it, and the other player switches to the other colour
  team: { label: 'Team Colors', items: { red: ['Red', 10], blue: ['Blue', 10], green: ['Green', 10], orange: ['Orange', 30], pink: ['Pink', 20], purple: ['Purple', 40], yellow: ['Yellow', 50] } },
  stone: { label: 'Stone', items: { black: ['Black Stone', 40], white: ['White Stone', 50], darkred: ['Dark Red Stone', 60], bluebrick: ['Blue Bricks', 80], mossy: ['Mossy Stone', 20], sandstone: ['Sandstone', 10] } },
  wood: { label: 'Wood', items: { white: ['White Wood', 60], darkoak: ['Dark Oak', 40], birch: ['Birch', 20], spruce: ['Spruce', 10], orange: ['Orange Wood', 50], cherry: ['Cherry Wood', 70] } },
  glass: { label: 'Glass', items: { blue: ['Blue Glass', 10], yellow: ['Yellow Glass', 20], purple: ['Purple Glass', 10], green: ['Green Glass', 30], orange: ['Orange Glass', 40], red: ['Red Glass', 60], pink: ['Pink Glass', 70] } },
  cannon: { label: 'Cannons', items: {
    frost: ['Frost Blue Epic Ice Cannon', 50], storm: ['Blue Storm Destroyer', 80], jungle: ['Green Jungle Engulfed Cannon', 30], scale: ['Lime Green Epic Scale Cannon', 40],
    gold: ["Gold Emperor's Blaster", 20], phantom: ['Shadow Purple Phantom Boom', 90], rose: ['Pink Flower Rose Petal Blaster', 10], torch: ['The Torch', 70],
    samurai: ['Red Samurai Cannon', 60], bone: ['White Bone Shredder', 40] } },
  // one cannonball power at a time: fired once a match, it wipes out one material in the enemy's base
  ball: { label: 'Cannon Balls', items: { moon: ['The Moon', 80, 'img/ball-moon.png'], sun: ['The Sun', 90, 'img/ball-sun.png'], swamp: ['Swamp BB', 100, 'img/ball-swamp.png'] } },
};
// the five shop sections, by price
const RARITY = [
  { id: 'common', name: 'Common', max: 20 },
  { id: 'uncommon', name: 'Uncommon', max: 40 },
  { id: 'rare', name: 'Rare', max: 60 },
  { id: 'ultra', name: 'Ultra Rare', max: 80 },
  { id: 'legendary', name: 'Legendary', max: Infinity },
];
const rarityOf = price => RARITY.findIndex(r => price <= r.max);
