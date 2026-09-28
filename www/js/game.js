'use strict';
// FNAF SIEGE - the match itself: building, physics, turns, the campaign CPU, drawing and touch/mouse input.
const Game = (() => {
  const { Engine, Bodies, Body, Composite, Events, Sleeping, Vertices, Bounds } = Matter;

  // ------------------------------------------------------------------ the board
  const CELL = 40, COLS = 75, ROWS = 50, W = COLS * CELL, H = ROWS * CELL;
  const BLUE_END = 25, RED_START = 50;     // blue owns columns 0-24, red owns 50-74, 25-49 is the battlefield
  const MAX_ITEMS = 250, SOLDIERS = 9, ROLLS = 3, STEP = 1000 / 60;
  const VMAX = 36, VTHROW = 22;            // fastest cannon shot / cupcake throw (pixels per physics step)
  const BALL_DMG = 3;                      // a direct cannonball hit
  const CANNON_HP = 5;                     // an enemy unit standing next to a cannon can hit it (1 each; a cannon wrecker: all 5)
  const MAX_DOORS = 3;                     // door pairs per side
  const CAT_CLOUD = 0x0004;                // cannonballs fly straight through clouds (same bit as CAT.cloud)
  const TEAM = {
    blue: { name: 'BLUE', col: '#3d8bff', rgb: '61,139,255' },
    red: { name: 'RED', col: '#ff4a4a', rgb: '255,74,74' },
  };
  const other = s => (s === 'blue' ? 'red' : 'blue');
  const zoneOf = c => (c < BLUE_END ? 'blue' : c >= RED_START ? 'red' : 'field');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const key = (c, r) => c + ',' + r;

  // the cannons sit BEHIND each side on a low dark-grey platform (their height follows the map's ground)
  const PLAT = { blue: { x0: -8 * CELL, x1: -1 * CELL, y: H }, red: { x0: W + 1 * CELL, x1: W + 8 * CELL, y: H } };
  const PLAT_H = 16;
  const CANNON = { blue: { x: -4.5 * CELL, y: 0 }, red: { x: W + 4.5 * CELL, y: 0 } };
  const WORLD_X0 = -11 * CELL, WORLD_X1 = W + 11 * CELL;

  // ------------------------------------------------------------------ maps
  // GROUND[c] = the first row of solid ground in column c (50 = the flat floor at the bottom of the grid)
  const MAPS = { field: { name: 'The Field' }, desert: { name: 'Red Desert' }, snow: { name: 'Snowy Hill' }, jungle: { name: 'The Jungle' },
    wasteland: { name: 'Volcano Wasteland' }, towers: { name: 'The Towers' } };
  const PLATEAU = 8;                       // how many squares the desert's high side is raised
  const MID = (BLUE_END + RED_START - 1) / 2;   // the battlefield's middle column (37)
  let GROUND = new Array(COLS).fill(ROWS), MAPK = 'field', HIGH = null;
  // the Jungle's trees: a canopy you can stand and build on, a trunk and vines to climb
  let TREES = [], MAPSOLID = new Set(), MAPROPES = [];
  // the Towers: no ground at all, just a sea of clouds; each side builds on a 15-wide concrete base
  const PLATE = { blue: [5, 19], red: [COLS - 20, COLS - 6] }, VOID_ROW = ROWS + 10;
  const onPlate = (c, side) => c >= PLATE[side][0] && c <= PLATE[side][1];
  const groundRow = c => GROUND[clamp(c, 0, COLS - 1)];
  const landFloor = s => MAPK === 'towers' ? ROWS - 1 : GROUND[s === 'blue' ? 0 : COLS - 1];     // ground row across a side's own land
  function setMap(map, high = null) {
    MAPK = map; HIGH = map === 'desert' ? high || 'red' : null;
    GROUND = new Array(COLS).fill(ROWS);
    TREES = []; MAPSOLID = new Set(); MAPROPES = [];
    if (HIGH) for (let c = 0; c < COLS; c++) {
      // the plateau side, and a staircase slope through the battlefield (one square up every two columns)
      const d = HIGH === 'red' ? c - (RED_START - 20) : (COLS - 1 - c) - (RED_START - 20);
      GROUND[c] = ROWS - clamp(Math.ceil(d / 2), 0, PLATEAU);
    }
    // Snowy Hill: both sides on the flat, a hill up and over through the battlefield
    if (map === 'snow') for (let c = BLUE_END; c < RED_START; c++) GROUND[c] = ROWS - clamp(7 - Math.ceil(Math.abs(c - MID) / 2), 0, 7);
    // Volcano Wasteland: both sides on the flat, a pit down and up again through the battlefield
    if (map === 'wasteland') for (let c = 0; c < COLS; c++) GROUND[c] = ROWS - clamp(Math.ceil(Math.abs(c - MID) / 2), 0, 6);
    if (map === 'jungle') {
      TREES = [{ c: MID - 8, top: ROWS - 12 }, { c: MID, top: ROWS - 16 }, { c: MID + 8, top: ROWS - 12 }];
      // a 5-wide leafy canopy with a gap in the middle where the trunk comes up through it:
      // climb the trunk up into the gap, then step off sideways onto the leaves
      for (const t of TREES) {
        for (const dc of [-2, -1, 1, 2]) MAPSOLID.add(key(t.c + dc, t.top));
        MAPROPES.push({ c: t.c, r0: t.top, r1: ROWS - 1, trunk: true }, { c: t.c - 2, r0: t.top + 1, r1: t.top + 5 }, { c: t.c + 2, r0: t.top + 1, r1: t.top + 5 });
      }
    }
    if (map === 'towers') for (let c = 0; c < COLS; c++) GROUND[c] = onPlate(c, 'blue') || onPlate(c, 'red') ? ROWS - 1 : VOID_ROW;
    for (const s of ['blue', 'red']) { PLAT[s].y = landFloor(s) * CELL; CANNON[s].y = PLAT[s].y - PLAT_H - CELL * 0.62; }
  }
  const mapSolid = (c, r) => MAPSOLID.has(key(c, r));
  const mapRope = (c, r) => MAPROPES.find(v => v.c === c && r >= v.r0 && r <= v.r1) || null;
  // the Towers' concrete: gone from a column when its concrete is smashed
  function towerGround() {
    if (MAPK !== 'towers') return;
    for (let c = 0; c < COLS; c++) GROUND[c] = blocks.some(b => !b.gm.dead && b.gm.mat === 'concrete' && Math.floor(b.position.x / CELL) === c) ? ROWS - 1 : VOID_ROW;
  }
  setMap('field');

  // solid building materials. pierce = how much of a cannonball's punch one block soaks up,
  // fall = damage when it drops on a unit, dice = cost of one repair block, slow = speed a ball keeps after smashing through
  const MAT = {
    stone: { name: 'Stone', hp: 10, density: 0.004, friction: 0.9, pierce: 4.5, fall: 2, dice: 2, slow: 0.55, snd: 'stone',
      fill: '#8b8f96', edge: '#44474c', chip: ['#9a9ea5', '#6c7076', '#b4b8be'] },
    wood: { name: 'Wood', hp: 6, density: 0.0016, friction: 0.8, pierce: 3, fall: 1, dice: 1, slow: 0.72, snd: 'wood',
      fill: '#a8733d', edge: '#55330f', chip: ['#b98246', '#7d5025', '#d19a5c'] },
    plastic: { name: 'Pink Plastic', hp: 2, density: 0.0012, friction: 0.5, pierce: 1, fall: 0, dice: 1, slow: 0.9, snd: 'glass',
      fill: '#ff6ecf', edge: '#a8307e', chip: ['#ff9ae0', '#ff6ecf', '#d04aa8'] },
    concrete: { name: 'Concrete', hp: 20, density: 0.006, friction: 0.9, pierce: 9, fall: 3, dice: 99, slow: 0.4, snd: 'stone',
      fill: '#9a9ea6', edge: '#55585e', chip: ['#a8acb4', '#8a8e96', '#c0c4ca'] },
    glass: { name: 'Glass', hp: 2, density: 0.0012, friction: 0.35, pierce: 1, fall: 0, dice: 1, slow: 0.9, snd: 'glass',
      fill: 'rgba(165,225,255,0.42)', edge: '#e3f7ff', chip: ['#dff5ff', '#a6dcf7', '#ffffff'] },
  };
  // placeable things that are not ordinary blocks
  const SPECIAL = {
    cloud: { name: 'Cloud', tip: 'Floats. Blocks touching its underside (and blocks touching those) hang from it until knocked loose.' },
    rope: { name: 'Rope', tip: 'Hang it under a block or stand it on one - or tie it under another rope to make a longer one. Units can climb it.' },
    door: { name: 'Door', tip: 'Place a GOLD door on a block, then its RED exit door. Units stepping into gold come out of red.' },
    arrow: { name: 'Arrow', tip: 'The block right in front of the arrow floats and moves that way. An arrow facing back sends it home. Tap an arrow to flip it.' },
    varrow: { name: 'Up/Down Arrow', tip: 'Blue arrow: the block right above (or below) its point floats and moves up or down - a lift. A blue arrow facing back sends it home. Tap to flip.' },
  };
  const isSolid = m => !!MAT[m];
  const SHAPES = {
    s11: { w: 1, h: 1 }, s21: { w: 2, h: 1 }, s12: { w: 1, h: 2 }, s31: { w: 3, h: 1 }, s13: { w: 1, h: 3 },
    s41: { w: 4, h: 1 }, s14: { w: 1, h: 4 }, s22: { w: 2, h: 2 }, s33: { w: 3, h: 3 },
    rr1: { w: 1, h: 1, tri: 'R' }, rl1: { w: 1, h: 1, tri: 'L' }, rr2: { w: 2, h: 2, tri: 'R' }, rl2: { w: 2, h: 2, tri: 'L' },
    c11: { w: 1, h: 1, for: 'cloud' }, c21: { w: 2, h: 1, for: 'cloud' }, c31: { w: 3, h: 1, for: 'cloud' }, c42: { w: 4, h: 2, for: 'cloud' }, c62: { w: 6, h: 2, for: 'cloud' },
    r2: { w: 1, h: 2, for: 'rope' }, r3: { w: 1, h: 3, for: 'rope' }, r4: { w: 1, h: 4, for: 'rope' }, r6: { w: 1, h: 6, for: 'rope' },
    d1: { w: 1, h: 1, for: 'door' }, a1: { w: 1, h: 1, for: 'arrow' }, v1: { w: 1, h: 1, for: 'varrow' },
  };
  const shapesFor = mat => Object.keys(SHAPES).filter(k => (SHAPES[k].for || 'block') === (isSolid(mat) ? 'block' : mat));
  const MIRROR = { rr1: 'rl1', rl1: 'rr1', rr2: 'rl2', rl2: 'rr2' };
  function shapeVerts(sh) {                 // polygon in cell units, origin = top-left of the shape's box
    const { w, h } = sh;
    if (sh.tri === 'R') return [[0, h], [w, h], [w, 0]];   // slope rising to the right
    if (sh.tri === 'L') return [[0, 0], [w, h], [0, h]];   // slope falling to the right
    return [[0, 0], [w, 0], [w, h], [0, h]];
  }
  const LV = {};                            // per shape: vertices around the centre of mass, and where that centre sits in the box
  for (const k in SHAPES) {
    const vs = shapeVerts(SHAPES[k]);
    const cx = vs.reduce((s, v) => s + v[0], 0) / vs.length, cy = vs.reduce((s, v) => s + v[1], 0) / vs.length;
    const box = SHAPES[k].tri ? { cx, cy } : { cx: SHAPES[k].w / 2, cy: SHAPES[k].h / 2 };
    LV[k] = { cx: box.cx, cy: box.cy, lv: vs.map(([x, y]) => ({ x: (x - box.cx) * CELL, y: (y - box.cy) * CELL })) };
  }
  const area = k => SHAPES[k].w * SHAPES[k].h * (SHAPES[k].tri ? 0.5 : 1);

  // ------------------------------------------------------------------ the fighters
  // w/h = picture size, dh = drawn height in squares, eyes = [x, y, rx, ry] in picture pixels (for the blinking lids)
  const KINDS = {
    endo: { name: 'Endo', hp: 1, img: 'img/endo.png', w: 146, h: 197, dh: 1.2, lid: '#58595c',
      eyes: [[30, 80, 28, 17], [97, 80, 27, 17]] },
    king: { name: 'King Freddy', hp: 2, img: 'img/freddy.png', w: 250, h: 254, dh: 1.15, lid: '#8a5426',
      eyes: [[96.4, 128.1, 18.9, 13.8], [149.5, 128.1, 18.4, 13.8]] },
    bonnie: { name: 'Bonnie', hp: 2, img: 'img/bonnie.png', w: 82, h: 136, dh: 1.5, lid: '#6b5f9e',
      eyes: [[30, 80, 7, 6], [51, 80, 7, 6]] },
    chica: { name: 'Chica', hp: 1, img: 'img/chica.png', w: 78, h: 93, dh: 1.1, lid: '#b39a3c',
      eyes: [[27, 51, 9, 8], [53, 51, 9, 8]] },
    cupcake: { name: 'Cupcake', hp: 1, img: 'img/cupcake.png', w: 85, h: 106, dh: 1.0, lid: '#c65f6c',
      eyes: [[27, 51, 9, 6], [55, 51, 9, 6]] },
    // steps: squares moved per dice point
    foxy: { name: 'Foxy', hp: 1, img: 'img/foxy.png', w: 113, h: 100, dh: 1.1, lid: '#a8452e', steps: 2,
      eyes: [[68, 51, 8, 6]] },
    // ammo: can be loaded into the cannon and fired as the cannonball, landing as a unit
    toybonnie: { name: 'Toy Bonnie', hp: 1, img: 'img/toybonnie.png', w: 103, h: 136, dh: 1.4, lid: '#4a8fc8', ammo: true,
      eyes: [[43, 89, 11, 11], [70, 89, 11, 11]] },
    // cannonKiller: wrecks the enemy cannon if he reaches the far edge of their land
    bb: { name: 'Balloon Boy', hp: 1, img: 'img/bb.png', w: 78, h: 112, dh: 1.25, lid: '#c09062', cannonKiller: true,
      eyes: [[24, 68, 12, 11], [51, 68, 12, 11]] },
    // climb: hangs off the side (or underside) of any block bigger than one square, like a rope
    mangle: { name: 'Mangle', hp: 1, img: 'img/mangle.png', w: 129, h: 132, dh: 1.15, lid: '#ece6ea', climb: true,
      eyes: [[53, 60, 9, 10], [80, 58, 9, 11]] },
    // freeWood: smashes enemy wood for free when breaking in
    wchica: { name: 'Withered Chica', hp: 1, img: 'img/wchica.png', w: 66, h: 108, dh: 1.3, lid: '#9c8a3a', freeWood: true,
      eyes: [[18, 38, 9, 8], [46, 38, 9, 8]] },
    // phase: the ENEMY material it steps through when the wall is one block thick (everyone steps through their own walls)
    ppuppet: { name: 'Phantom Puppet', hp: 1, img: 'img/ppuppet.png', w: 77, h: 95, dh: 1.1, lid: '#0b0b0b', phase: 'stone',
      eyes: [[21, 41, 4, 3], [55, 41, 4, 3]] },
    springtrap: { name: 'Springtrap', hp: 3, img: 'img/springtrap.png', w: 114, h: 149, dh: 1.45, lid: '#5b5a2e',
      eyes: [[40, 100, 9, 8], [63, 100, 9, 8]] },
    // guard: like King Freddy, can take out invaders in his own land
    nfoxy: { name: 'Nightmare Foxy', hp: 1, img: 'img/nfoxy.png', w: 119, h: 137, dh: 1.25, lid: '#5a2a18', guard: true,
      eyes: [[50, 51, 5, 4], [72, 51, 5, 4]] },
    // split: launched like Toy Bonnie, then splits into two in mid-air (the second is a clone)
    bidybab: { name: 'Bidybab', hp: 1, img: 'img/bidybab.png', w: 99, h: 88, dh: 0.95, lid: '#e8b89a', ammo: true, split: true,
      eyes: [[32, 45, 10, 9], [63, 45, 10, 9]] },
    // boom: launched like Toy Bonnie, and blows up a big patch of the enemy's fort when she hits it
    electrobab: { name: 'Electrobab', hp: 1, img: 'img/electrobab.png', w: 98, h: 86, dh: 0.95, lid: '#eeeeee', ammo: true, boom: true,
      eyes: [[31, 44, 10, 9], [63, 44, 10, 9]] },
    ftfoxy: { name: 'Funtime Foxy', hp: 1, img: 'img/ftfoxy.png', w: 127, h: 121, dh: 1.2, lid: '#e8d8ee', freeGlass: true,
      eyes: [[51, 60, 9, 8], [76, 60, 9, 8]] },
    // fireball: spends a roll to shoot a fireball (1 damage, sets wood alight, bounces off glass)
    burntfoxy: { name: 'Burnt Foxy', hp: 1, img: 'img/burntfoxy.png', w: 122, h: 114, dh: 1.15, lid: '#2a2a30', shoot: 'fire',
      eyes: [[70, 57, 10, 9]] },
    glamrock: { name: 'Glamrock Bonnie', hp: 1, img: 'img/glamrock.png', w: 89, h: 135, dh: 1.4, lid: '#d99a2a', phase: 'wood',
      eyes: [[33, 74, 7, 6], [55, 74, 7, 6]] },
    omcmangle: { name: 'OMC Mangle', hp: 1, img: 'img/omcmangle.png', w: 128, h: 131, dh: 1.15, lid: '#1a0808', phase: 'glass',
      eyes: [[50, 57, 6, 6], [80, 57, 6, 6]] },
    ennard: { name: 'Ennard', hp: 1, img: 'img/ennard.png', w: 100, h: 148, dh: 1.45, lid: '#e8e4ea', phase: 'all',
      eyes: [[32, 83, 8, 7], [61, 84, 10, 10]] },
    // fly: hovers wherever the dice move him (placed at the start, he falls like anyone)
    gfreddy: { name: 'Games Freddy', hp: 1, img: 'img/gfreddy.png', w: 76, h: 101, dh: 1.2, lid: '#ffe800', fly: true,
      eyes: [[41, 31, 5, 7], [55, 30, 6, 8]] },
    // shoot: spends a roll to fire that shot (fire, ooze and rad are MAGIC: glass bounces them, max 3 magic shots a turn)
    mmangle: { name: 'Missing Mangle', hp: 1, img: 'img/mmangle.png', w: 130, h: 133, dh: 1.15, lid: '#e000e0', shoot: 'ooze',
      eyes: [[57, 60, 5, 5], [78, 60, 5, 5]] },
    cbonnie: { name: 'Cookie Bonnie', hp: 1, img: 'img/cbonnie.png', w: 76, h: 124, dh: 1.4, lid: '#b8401e', shoot: 'cookie',
      eyes: [[28, 67, 8, 6], [49, 67, 8, 6]] },
    rfoxy: { name: 'Radioactive Foxy', hp: 1, img: 'img/rfoxy.png', w: 109, h: 101, dh: 1.15, lid: '#6fcf2a', shoot: 'rad',
      eyes: [[41, 50, 7, 7], [65, 49, 8, 8]] },
    // dig: burrows into the earth (up to DIG_DEPTH squares under the floor) and tunnels along under the forts
    chipper: { name: 'Chipper', hp: 1, img: 'img/chipper.png', w: 115, h: 93, dh: 1.0, lid: '#a8521c', dig: true,
      eyes: [[41, 39, 9, 7], [69, 39, 9, 7]] },
    // rally: while he's alive EVERY unit on his side can take out invaders at home, like the King
    gendo: { name: 'Glamrock Endo', hp: 1, img: 'img/gendo.png', w: 101, h: 96, dh: 1.05, lid: '#2a1a2e', rally: true,
      eyes: [[25, 26, 7, 7], [57, 25, 8, 8]] },
    // tosser: spends a roll to throw a comrade touching him as far as the cannon can
    djmm: { name: 'DJ Music Man', hp: 1, img: 'img/djmm.png', w: 137, h: 104, dh: 1.0, lid: '#f2eef6', tosser: true,
      eyes: [[48, 44, 11, 10], [84, 44, 11, 10]] },
    fmangle: { name: 'Festive Mangle', hp: 1, img: 'img/fmangle.png', w: 96, h: 130, dh: 1.3, lid: '#c9c4c0', shoot: 'festive',
      eyes: [[38, 43, 4, 3], [58, 43, 4, 3]] },
    // tele: spends a roll to teleport next to any comrade
    pbennard: { name: 'Pitch Black Ennard', hp: 1, img: 'img/pbennard.png', w: 118, h: 111, dh: 1.15, lid: '#0a0a0e', tele: true,
      eyes: [[36, 45, 7, 7], [65, 45, 7, 7]] },
    // dust: launched like Toy Bonnie; while she stands in the enemy's land their dice rolls are cut in half
    dmangle: { name: 'Dust Mangle', hp: 1, img: 'img/dmangle.png', w: 114, h: 124, dh: 1.15, lid: '#1a221c', ammo: true, dust: true,
      eyes: [[41, 48, 5, 8], [67, 48, 5, 8]] },
    // noCrush: falling blocks never hurt him (only units, cannonballs and shots can)
    fbb: { name: 'Festive BB', hp: 1, img: 'img/fbb.png', w: 75, h: 107, dh: 1.3, lid: '#e8a47a', noCrush: true,
      eyes: [[23, 65, 8, 8], [53, 65, 8, 8]] },
    // --- King upgrades (kingUp): worn by the King, who stays the King; these add to what he can do
    books: { name: 'Books Freddy', hp: 3, img: 'img/books.png', w: 100, h: 101, dh: 1.15, lid: '#3a3430', kingUp: true,
      eyes: [[40, 51, 5, 4], [61, 51, 5, 4]] },
    blfreddy: { name: 'Black Light Freddy', hp: 2, img: 'img/blfreddy.png', w: 107, h: 110, dh: 1.15, lid: '#2a7ad8', kingUp: true, shoot: 'blue',
      eyes: [[43, 54, 5, 5], [65, 54, 5, 5]] },
    // onlyCrush: cannonballs, shots, blasts and attacks can't hurt him, only a falling block; bless: once a match, gives a unit 3 hearts
    dread: { name: 'Dread Bear', hp: 2, img: 'img/dread.png', w: 92, h: 106, dh: 1.15, lid: '#161614', kingUp: true, onlyCrush: true, bless: true,
      eyes: [[39, 41, 5, 4], [55, 41, 5, 4]] },
    molten: { name: 'Molten Freddy', hp: 2, img: 'img/molten.png', w: 105, h: 149, dh: 1.45, lid: '#6a3a28', kingUp: true, ammo: true, phase: 'all',
      eyes: [[68, 57, 6, 6]] },
    // revive: at full health he can bring a dead comrade back instead of firing the cannon; boomDeath: explodes if killed in enemy land
    funtime: { name: 'Funtime Freddy', hp: 2, img: 'img/funtime.png', w: 97, h: 106, dh: 1.15, lid: '#e8c8f0', kingUp: true, cannonKiller: true, revive: true, boomDeath: true,
      eyes: [[30, 45, 6, 3], [55, 44, 6, 3]] },
    // mystery: gets one random ability (ABILITIES) every match
    unknown: { name: 'Unidentified Freddy', hp: 2, img: 'img/unknown.png', w: 90, h: 90, dh: 1.1, lid: '#e86a7a', kingUp: true, mystery: true,
      eyes: [] },
  };
  // what Unidentified Freddy can roll (each gives him one fighter's ability for the match)
  const ABILITIES = {
    steps: { name: "Foxy's double steps", give: { steps: 2 } },
    launch: { name: "Toy Bonnie's launch", give: { ammo: true } },
    wreck: { name: "Balloon Boy's cannon wrecking", give: { cannonKiller: true } },
    climb: { name: "Mangle's wall climbing", give: { climb: true } },
    freeWood: { name: "Withered Chica's free wood smashing", give: { freeWood: true } },
    freeGlass: { name: "Funtime Foxy's free glass smashing", give: { freeGlass: true } },
    phStone: { name: "Phantom Puppet's walk through stone", give: { phase: 'stone' } },
    phWood: { name: "Glamrock Bonnie's walk through wood", give: { phase: 'wood' } },
    phGlass: { name: "OMC Mangle's walk through glass", give: { phase: 'glass' } },
    phAll: { name: "Ennard's walk through any wall", give: { phase: 'all' } },
    hearts3: { name: "Springtrap's 3 hearts", give: { hp: 3 } },
    fly: { name: "Games Freddy's flying", give: { fly: true } },
    fire: { name: "Burnt Foxy's fireball", give: { shoot: 'fire' } },
    ooze: { name: "Missing Mangle's pink ooze", give: { shoot: 'ooze' } },
    cookie: { name: "Cookie Bonnie's cookie", give: { shoot: 'cookie' } },
    rad: { name: "Radioactive Foxy's goo", give: { shoot: 'rad' } },
    festive: { name: "Festive Mangle's magic", give: { shoot: 'festive' } },
    blue: { name: "Black Light Freddy's blue cannonball", give: { shoot: 'blue' } },
    dig: { name: "Chipper's digging", give: { dig: true } },
    rally: { name: "Glamrock Endo's rally", give: { rally: true } },
    tosser: { name: "DJ Music Man's throw", give: { tosser: true } },
    tele: { name: "Pitch Black Ennard's teleport", give: { tele: true } },
    noCrush: { name: "Festive BB's crush-proof head", give: { noCrush: true } },
    dust: { name: "Dust Mangle's dust launch", give: { ammo: true, dust: true } },
    onlyCrush: { name: "Dread Bear's shot-proof body", give: { onlyCrush: true } },
    bless: { name: "Dread Bear's 3-heart gift", give: { bless: true } },
    revive: { name: "Funtime Freddy's revive", give: { revive: true } },
  };
  // what a unit can do: its kind, plus (for the King) the upgrade he wears and Unidentified Freddy's rolled ability
  const kdCache = {};
  function kdOf(kind, up, ab) {
    if (!up) return KINDS[kind];
    const ck = kind + '|' + up + '|' + (ab || '');
    return kdCache[ck] || (kdCache[ck] = { ...KINDS[kind], ...KINDS[up], ...(ab && ABILITIES[ab] ? ABILITIES[ab].give : {}) });
  }
  const kd = u => kdOf(u.gm.kind, u.gm.up, u.gm.ab);
  const vk = g => g.up || g.kind;              // which picture to draw
  // a fresh random ability for Unidentified Freddy (never the same as last time on this device)
  function rollMystery() {
    const last = Store.get('lastMystery'), keys = Object.keys(ABILITIES).filter(k => k !== last);
    const ab = pick(keys);
    Store.set('lastMystery', ab);
    return ab;
  }
  function rollMysteries(L) { for (const u of L.units) if (u.up && KINDS[u.up].mystery && !u.ab) u.ab = rollMystery(); }
  const SHOTS = {
    fire: { name: 'Fireball', magic: true, v: 30 },
    ooze: { name: 'Pink Ooze', magic: true, v: 26 },
    rad: { name: 'Radioactive Goo', magic: true, v: 26 },
    cookie: { name: 'Cookie', magic: false, v: 18 },
    festive: { name: 'Festive Magic', magic: true, v: 28 },
    blue: { name: 'Blue Cannonball', magic: false, v: 32 },
  };
  const BLUE_PIERCE = 6;
  // cannonball powers (shop looks, one equipped at a time): fired once a match, and when the ball reaches the enemy's
  // land it wipes out every enemy block of one material
  const BALL_POWERS = {
    swamp: { name: 'Swamp BB', mat: 'stone', img: 'img/ball-swamp.png', col: ['#6a8a3a', '#3a5a1e', '#a8c060'] },
    sun: { name: 'The Sun', mat: 'wood', img: 'img/ball-sun.png', col: ['#ffe030', '#ff9a1a', '#fff6a0'] },
    moon: { name: 'The Moon', mat: 'glass', img: 'img/ball-moon.png', col: ['#6a8cff', '#c8d8ff', '#3a5ae0'] },
  };
  for (const k in BALL_POWERS) { BALL_POWERS[k].im = new Image(); BALL_POWERS[k].im.src = BALL_POWERS[k].img; }
  // the power a side still has to fire this match
  const powerOf = side => { const k = S && S.looks && S.looks[side] && S.looks[side].ball; return k && BALL_POWERS[k] && !S.powerUsed[side] ? k : null; };                   // stone / glass blocks one blue cannonball smashes through
  const DIG_DEPTH = 3;                     // how far under the floor Chipper can burrow
  const MAGIC_PER_TURN = 3;
  // when a unit is inside the ENEMY's land it can smash an enemy block next to it for this many dice points
  // (stone is the easiest to break into, so an all-stone fortress isn't the answer to everything)
  const BREAK_COST = { glass: 3, wood: 2, stone: 1, plastic: 1, concrete: 2 };
  // collision groups: a side's own cannonballs fly straight through everything that belongs to that side
  const CAT = { cloud: 0x0004, blue: 0x0010, red: 0x0020 };
  function setOwner(b, side) {
    b.gm.side = side;
    if (CAT[side]) b.collisionFilter.category = CAT[side];
  }
  const IMG = {};
  for (const k in KINDS) { IMG[k] = new Image(); IMG[k].src = KINDS[k].img; }
  const isSoldier = k => k !== 'king';

  // block looks, bought in the shop: each side's stone, wood and glass can have their own colours
  const SKINS = {
    stone: {
      default: { base: '#8b8f96', line: 'rgba(40,42,46,0.55)', edge: '#44474c' },
      black: { base: '#2e2f34', line: 'rgba(0,0,0,0.75)', edge: '#0e0e10' },
      white: { base: '#e4e4e8', line: 'rgba(120,120,132,0.6)', edge: '#8a8a94' },
      darkred: { base: '#6e2a26', line: 'rgba(25,5,5,0.6)', edge: '#34100e' },
      bluebrick: { base: '#3f5fa8', line: 'rgba(210,222,255,0.65)', edge: '#1c2c58' },
      mossy: { base: '#7d857e', line: 'rgba(40,50,40,0.5)', edge: '#3a4636', moss: true },
      sandstone: { base: '#d8b77a', line: 'rgba(150,110,50,0.45)', edge: '#8e6a32', bands: true },
    },
    wood: {
      default: { base: '#a8733d', grain: '80,45,15', edge: '#55330f' },
      white: { base: '#ece6d8', grain: '150,140,120', edge: '#9a9080' },
      darkoak: { base: '#4e3420', grain: '15,8,3', edge: '#1f1208' },
      birch: { base: '#ebe0c6', grain: '140,128,100', edge: '#8e8266', flecks: true },
      spruce: { base: '#7a5534', grain: '45,28,12', edge: '#3a2410' },
      orange: { base: '#e58b36', grain: '130,60,10', edge: '#7a4210' },
      cherry: { base: '#eba5b2', grain: '160,70,90', edge: '#9a5060' },
    },
    plastic: { default: { base: '#ff6ecf', fill: '#ff6ecf', edge: '#a8307e' } },
    concrete: { default: { base: '#9a9ea6', fill: '#9a9ea6', edge: '#55585e' } },
    glass: {
      default: { fill: 'rgba(165,225,255,0.42)', edge: '#e3f7ff' },
      red: { fill: 'rgba(255,80,80,0.45)', edge: '#ffd0d0' },
      blue: { fill: 'rgba(70,120,255,0.45)', edge: '#d0dcff' },
      green: { fill: 'rgba(70,220,110,0.42)', edge: '#d2ffe0' },
      yellow: { fill: 'rgba(255,220,60,0.45)', edge: '#fff4c0' },
      orange: { fill: 'rgba(255,150,50,0.45)', edge: '#ffe0c0' },
      purple: { fill: 'rgba(170,90,255,0.45)', edge: '#ecd8ff' },
      pink: { fill: 'rgba(255,110,190,0.45)', edge: '#ffd8ee' },
    },
  };
  const PATSRC = {}, PAT = {};
  function stoneTile(g, s) {
    g.fillStyle = s.base; g.fillRect(0, 0, 80, 80);
    for (let i = 0; i < 260; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.08)'; g.fillRect(Math.random() * 80, Math.random() * 80, 2, 2); }
    if (s.bands) for (let y = 4; y < 80; y += 9) { g.fillStyle = `rgba(160,110,50,${0.12 + Math.random() * 0.12})`; g.fillRect(0, y, 80, 3); }
    if (s.moss) for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(70,130,50,${0.35 + Math.random() * 0.3})`; g.beginPath(); g.ellipse(Math.random() * 80, Math.random() * 80, 4 + Math.random() * 8, 3 + Math.random() * 4, 0, 0, 7); g.fill(); }
    g.strokeStyle = s.line; g.lineWidth = 1.5;
    for (let y = 0; y < 80; y += 20) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(80, y); g.stroke();
      const off = (y / 20) % 2 ? 20 : 0;
      for (let x = off; x < 80; x += 40) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 20); g.stroke(); }
    }
  }
  function woodTile(g, s) {
    g.fillStyle = s.base; g.fillRect(0, 0, 80, 80);
    for (let y = 3; y < 80; y += 6) {
      g.strokeStyle = `rgba(${s.grain},${0.18 + Math.random() * 0.2})`; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= 80; x += 10) g.lineTo(x, y + Math.sin((x + y * 7) * 0.08) * 1.5);
      g.stroke();
    }
    if (s.flecks) for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(30,25,20,0.7)'; g.fillRect(Math.random() * 80, Math.random() * 80, 4 + Math.random() * 7, 1.5); }
    g.strokeStyle = `rgba(${s.grain},0.6)`; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0.5); g.lineTo(80, 0.5); g.moveTo(0, 40.5); g.lineTo(80, 40.5); g.stroke();
    g.fillStyle = `rgba(${s.grain},0.5)`; g.beginPath(); g.arc(22, 20, 2.5, 0, 7); g.arc(62, 60, 2.5, 0, 7); g.fill();
  }
  function makePatterns(c) {
    for (const mat of ['stone', 'wood']) for (const k in SKINS[mat]) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 80;
      (mat === 'stone' ? stoneTile : woodTile)(cv.getContext('2d'), SKINS[mat][k]);
      PATSRC[mat + ':' + k] = cv;
      PAT[mat + ':' + k] = c.createPattern(cv, 'repeat');
    }
  }
  const skinOf = (side, mat) => { const k = S && S.looks && S.looks[side] && S.looks[side][mat]; return k && (SKINS[mat] ? SKINS[mat][k] : CANNON_THEMES[k]) ? k : 'default'; };
  function chipCols(mat, side) {
    const s = SKINS[mat][skinOf(side, mat)];
    return mat === 'glass' ? [s.edge, '#ffffff', s.edge] : [s.base, s.edge, s.base];
  }

  // team colours, bought in the shop: they recolour a side's unit rings and the tint of its land
  const TEAM_BASE = { blue: { name: 'BLUE', col: '#3d8bff' }, red: { name: 'RED', col: '#ff4a4a' } };
  const TEAM_COLORS = { red: '#ff4a4a', blue: '#3d8bff', green: '#3ddc6a', purple: '#a45cff', orange: '#ff9a2a', yellow: '#ffd83a', pink: '#ff6ec7' };
  const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
  function applyTeamLooks() {
    const pick = s => (S && S.looks && S.looks[s] && TEAM_COLORS[S.looks[s].team]) ? S.looks[s].team : null;
    // player 1 is blue and player 2 red unless they've equipped a team colour. If both end up the same colour,
    // the one who didn't choose it (or player 2, if both did) switches: to their usual colour, or to the other one
    // if that's the colour that's taken (buy RED as player 1 and player 2 becomes BLUE).
    const want = { blue: pick('blue'), red: pick('red') };
    const col = { blue: want.blue || 'blue', red: want.red || 'red' };
    if (col.blue === col.red) { const y = !want.red || want.blue ? 'red' : 'blue'; col[y] = col[other(y)] !== y ? y : other(y); }
    for (const s of ['blue', 'red']) {
      TEAM[s].col = TEAM_COLORS[col[s]];
      TEAM[s].name = col[s].toUpperCase();
      TEAM[s].rgb = hexRgb(TEAM[s].col);
    }
  }

  // cannon themes, bought in the shop
  const CANNON_THEMES = {
    default: { name: 'Iron', barrel: '#2b2b30', dark: '#0c0c0e', band: null, wheel: '#5a3a1e', rim: '#2a1a0b' },
    frost: { name: 'Frost Blue Epic Ice Cannon', barrel: '#8fdcff', dark: '#2a78a8', band: '#effcff', wheel: '#5aa9d6', rim: '#1f5a80' },
    storm: { name: 'Blue Storm Destroyer', barrel: '#1b3a8a', dark: '#0a1640', band: '#ffe24a', wheel: '#12245a', rim: '#050b24' },
    jungle: { name: 'Green Jungle Engulfed Cannon', barrel: '#3f6b2a', dark: '#1d3512', band: '#7a4a1e', wheel: '#4a3218', rim: '#22150a' },
    scale: { name: 'Lime Green Epic Scale Cannon', barrel: '#8fdc2e', dark: '#3d7010', band: '#2f7a10', wheel: '#3d6e14', rim: '#1c3808' },
    gold: { name: "Gold Emperor's Blaster", barrel: '#e8b923', dark: '#8a6a10', band: '#fff2a8', wheel: '#8a6a10', rim: '#4a3806' },
    phantom: { name: 'Shadow Purple Phantom Boom', barrel: '#3a1a5a', dark: '#140620', band: '#b36bff', wheel: '#241035', rim: '#0c0414' },
    rose: { name: 'Pink Flower Rose Petal Blaster', barrel: '#ff8fb8', dark: '#b03a6a', band: '#d63a6e', wheel: '#5e9a3e', rim: '#2c4a1c' },
    torch: { name: 'The Torch', barrel: '#e0561a', dark: '#7a2608', band: '#ffd23a', wheel: '#5a2a10', rim: '#2a1206' },
    samurai: { name: 'Red Samurai Cannon', barrel: '#b01e1e', dark: '#3a0606', band: '#141414', wheel: '#1a1a1a', rim: '#d4a52a' },
    bone: { name: 'White Bone Shredder', barrel: '#ece6d8', dark: '#8a8070', band: '#b8ae98', wheel: '#d8d0c0', rim: '#7a7262' },
  };
  // draws a cannon at the origin, barrel pointing along `ang` (used for the battle and the shop preview)
  function drawCannonBody(g, key, teamCol, ang, dir, now) {
    const T = CANNON_THEMES[key] || CANNON_THEMES.default, C = CELL;
    g.save(); g.rotate(ang);
    if (key === 'phantom' || key === 'frost' || key === 'torch') {     // an aura
      g.fillStyle = key === 'phantom' ? 'rgba(179,107,255,0.25)' : key === 'frost' ? 'rgba(160,230,255,0.25)' : 'rgba(255,140,40,0.25)';
      g.beginPath(); g.ellipse(C * 0.6, 0, C * 1.4, C * 0.6 + Math.sin(now / 200) * 2, 0, 0, 7); g.fill();
    }
    const gr = g.createLinearGradient(0, -C * 0.33, 0, C * 0.33);
    gr.addColorStop(0, T.barrel); gr.addColorStop(1, T.dark);
    g.fillStyle = gr; g.strokeStyle = T.dark; g.lineWidth = 3;
    g.beginPath(); g.roundRect(-C * 0.4, -C * 0.33, C * 1.9, C * 0.66, 10); g.fill(); g.stroke();
    g.fillStyle = T.band || teamCol; g.fillRect(C * 0.2, -C * 0.35, C * 0.22, C * 0.7);
    if (!T.band) { } else { g.fillStyle = teamCol; g.fillRect(C * 0.95, -C * 0.35, C * 0.1, C * 0.7); }
    // theme decorations
    if (key === 'frost') {
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) { const x = -C * 0.2 + i * C * 0.42; g.beginPath(); g.moveTo(x, -C * 0.33); g.lineTo(x + 6, -C * 0.62); g.lineTo(x + 12, -C * 0.33); g.fill(); }
    } else if (key === 'storm') {
      g.strokeStyle = '#ffe24a'; g.lineWidth = 3; g.beginPath();
      g.moveTo(-C * 0.3, -C * 0.05); g.lineTo(C * 0.2, -C * 0.2); g.lineTo(C * 0.45, C * 0.08); g.lineTo(C * 0.95, -C * 0.12); g.lineTo(C * 1.35, C * 0.1); g.stroke();
    } else if (key === 'jungle') {
      g.strokeStyle = '#2f8a2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(-C * 0.4, C * 0.2);
      for (let x = -C * 0.4; x < C * 1.5; x += 8) g.lineTo(x, Math.sin(x * 0.15) * C * 0.22); g.stroke();
      g.fillStyle = '#4fc23a';
      for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(-C * 0.25 + i * C * 0.38, (i % 2 ? -1 : 1) * C * 0.3, 6, 3.5, i, 0, 7); g.fill(); }
    } else if (key === 'scale') {
      g.strokeStyle = 'rgba(30,80,10,0.8)'; g.lineWidth = 1.5;
      for (let x = -C * 0.3; x < C * 1.4; x += 9) for (let y = -C * 0.25; y < C * 0.3; y += 8) { g.beginPath(); g.arc(x + ((y / 8) % 2 ? 4 : 0), y, 4.5, 0, Math.PI); g.stroke(); }
    } else if (key === 'gold') {
      g.fillStyle = '#fff2a8'; g.fillRect(C * 1.35, -C * 0.36, C * 0.14, C * 0.72);
      g.fillStyle = '#d61f2c'; g.beginPath(); g.arc(-C * 0.15, 0, 5, 0, 7); g.fill();
      g.fillStyle = '#fff2a8'; g.beginPath(); g.moveTo(-C * 0.35, -C * 0.33); g.lineTo(-C * 0.3, -C * 0.55); g.lineTo(-C * 0.18, -C * 0.42); g.lineTo(-C * 0.08, -C * 0.58); g.lineTo(0, -C * 0.33); g.fill();
    } else if (key === 'phantom') {
      g.fillStyle = 'rgba(220,180,255,0.8)';
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(C * 0.3 + i * C * 0.35, Math.sin(now / 300 + i) * 4, 3, 0, 7); g.fill(); }
    } else if (key === 'rose') {
      for (let i = 0; i < 3; i++) {
        const fx = -C * 0.1 + i * C * 0.5, fy = (i % 2 ? 1 : -1) * C * 0.12;
        g.fillStyle = '#ffd0e0'; for (let k = 0; k < 5; k++) { const a = k * 1.256; g.beginPath(); g.arc(fx + Math.cos(a) * 4, fy + Math.sin(a) * 4, 3.5, 0, 7); g.fill(); }
        g.fillStyle = '#ffe24a'; g.beginPath(); g.arc(fx, fy, 2.5, 0, 7); g.fill();
      }
    } else if (key === 'torch') {
      const fl = 6 + Math.sin(now / 90) * 3;
      g.fillStyle = '#ffd23a'; g.beginPath(); g.moveTo(C * 1.2, -C * 0.33); g.quadraticCurveTo(C * 1.35, -C * 0.33 - fl * 2, C * 1.5, -C * 0.33); g.fill();
      g.fillStyle = '#ff6a00'; g.beginPath(); g.moveTo(C * 0.3, -C * 0.33); g.quadraticCurveTo(C * 0.45, -C * 0.33 - fl * 1.5, C * 0.6, -C * 0.33); g.fill();
    } else if (key === 'samurai') {
      g.fillStyle = '#d4a52a'; g.fillRect(-C * 0.4, -C * 0.06, C * 1.9, C * 0.12);
      g.fillStyle = '#141414'; g.fillRect(C * 1.25, -C * 0.34, C * 0.25, C * 0.68);
    } else if (key === 'bone') {
      g.strokeStyle = '#8a8070'; g.lineWidth = 2;
      for (let x = -C * 0.2; x < C * 1.3; x += C * 0.3) { g.beginPath(); g.moveTo(x, -C * 0.33); g.lineTo(x, C * 0.33); g.stroke(); }
      g.fillStyle = '#fbf8f0'; g.beginPath(); g.arc(C * 0.55, 0, C * 0.2, 0, 7); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(C * 0.48, -3, 3, 0, 7); g.arc(C * 0.62, -3, 3, 0, 7); g.fill(); g.fillRect(C * 0.52, 3, 5, 4);
    }
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(C * 1.5, 0, C * 0.08, C * 0.26, 0, 0, 7); g.fill();
    g.restore();
    g.fillStyle = T.wheel; g.strokeStyle = T.rim; g.lineWidth = 3;
    g.beginPath(); g.arc(-dir * 4, C * 0.25, C * 0.45, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = T.rim; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(-dir * 4 + Math.cos(a) * C * 0.4, C * 0.25 + Math.sin(a) * C * 0.4); g.lineTo(-dir * 4 - Math.cos(a) * C * 0.4, C * 0.25 - Math.sin(a) * C * 0.4); g.stroke(); }
    if (key === 'bone') { g.fillStyle = '#fbf8f0'; g.beginPath(); g.arc(-dir * 4, C * 0.25, 7, 0, 7); g.fill(); }
  }
  // small pictures for the shop
  function preview(kind, id) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 96;
    const g = cv.getContext('2d');
    if (kind === 'stone' || kind === 'wood') {
      g.fillStyle = g.createPattern(PATSRC[kind + ':' + id] || PATSRC[kind + ':default'], 'repeat');
      g.fillRect(8, 8, 80, 80); g.lineWidth = 4; g.strokeStyle = SKINS[kind][id].edge; g.strokeRect(8, 8, 80, 80);
    } else if (kind === 'glass') {
      g.fillStyle = '#20263a'; g.fillRect(0, 0, 96, 96);
      g.fillStyle = SKINS.glass[id].fill; g.fillRect(8, 8, 80, 80);
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 6; g.beginPath(); g.moveTo(14, 50); g.lineTo(50, 14); g.stroke();
      g.lineWidth = 4; g.strokeStyle = SKINS.glass[id].edge; g.strokeRect(8, 8, 80, 80);
    } else if (kind === 'team') {
      const col = TEAM_COLORS[id];
      g.fillStyle = `rgba(${hexRgb(col)},0.3)`; g.beginPath(); g.arc(48, 48, 36, 0, 7); g.fill();
      g.lineWidth = 7; g.strokeStyle = col; g.stroke();
      if (IMG.endo.complete) g.drawImage(IMG.endo, 48 - 26, 48 - 35, 52, 70);
    } else if (kind === 'cannon') {
      g.translate(40, 58); g.scale(1.05, 1.05);
      drawCannonBody(g, id, '#3d8bff', -0.35, 1, 0);
    }
    return cv.toDataURL();
  }

  // ------------------------------------------------------------------ campaign levels (the CPU plays RED)
  function mulberry(seed) {
    return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // 50 levels. Level 1 is Endos only; then the enemy gets 1 mask, different masks, 2 masks... more and stronger
  // masks as the levels climb, King upgrades from level 20, and level 50 has the best line-up of all.
  const LEVEL_NAMES = ['Show Stage', 'Dining Area', 'Backstage', 'West Hall', 'East Hall', 'Supply Closet', 'Pirate Cove', 'Kitchen', 'Restrooms', 'The Office',
    'Prize Corner', 'Game Area', "Kid's Cove", 'Parts & Service', 'Main Hall', 'Party Room 1', 'Party Room 2', 'Party Room 3', 'Party Room 4', 'Left Air Vent',
    'Right Air Vent', 'Toy Stage', 'Security Booth', 'Fazbear Frights', 'Hallway Maze', 'Ballora Gallery', 'Funtime Auditorium', 'Circus Control', 'Scooping Room', 'Private Room',
    "Sister Location", 'Pizzeria Simulator', 'Salvage Room', 'Candy Cadet Corner', 'Fun With Balloons', 'Rockstar Row', 'Mega Pizzaplex', 'Monty Golf', 'Roxy Raceway', 'Bonnie Bowl',
    'Daycare', 'Fazer Blast', 'West Arcade', 'Utility Tunnels', 'Freddy\'s Green Room', 'Atrium', 'Loading Dock', 'The Underground', 'Burntrap\'s Lair', 'The Final Night'];
  const MASK_TIERS = [
    ['bonnie', 'chica', 'foxy', 'bb', 'mangle', 'toybonnie', 'wchica', 'cbonnie'],
    ['springtrap', 'nfoxy', 'ppuppet', 'ftfoxy', 'glamrock', 'omcmangle', 'bidybab', 'gfreddy', 'fbb', 'chipper', 'burntfoxy'],
    ['mmangle', 'rfoxy', 'electrobab', 'ennard', 'djmm', 'pbennard', 'gendo', 'dmangle', 'fmangle'],
  ];
  const KING_TIERS = [['books', 'molten', 'blfreddy'], ['funtime', 'unknown'], ['dread']];
  // the first 10 keep the forts they always had
  const FIRST_FORTS = [
    { style: 'village', stone: 0.1, noise: 0.13 },
    { style: 'hall', stone: 0.15, noise: 0.12 },
    { style: 'bunker', stone: 0.35, noise: 0.11, map: 'desert', high: 'red' },
    { style: 'pyramid', storeys: [4, 3, 2, 1], stone: 0.3, noise: 0.1 },
    { style: 'hall', stone: 0.4, noise: 0.09 },
    { style: 'sky', stone: 0.4, noise: 0.08, cloud: true, map: 'desert', high: 'blue' },
    { style: 'pyramid', storeys: [4, 3, 2, 1], stone: 0.45, noise: 0.07, mover: true },
    { style: 'bunker', stone: 0.55, noise: 0.06 },
    { style: 'village', stone: 0.6, noise: 0.05, map: 'desert', high: 'red' },
    { style: 'pyramid', storeys: [5, 4, 3, 2, 1], stone: 0.75, noise: 0.04, cloud: true, mover: true, base: 2 },
  ];
  const LEVELS = LEVEL_NAMES.map((name, i) => {
    const n = i + 1, rnd = mulberry(n * 104729 + 7), pk = a => a[Math.floor(rnd() * a.length)];
    let L;
    if (i < 10) L = { name, ...FIRST_FORTS[i] };
    else {
      const style = ['pyramid', 'bunker', 'hall', 'village', 'sky', 'skyline', 'castle', 'islands', 'ziggurat', 'stilts'][(i * 3) % 10], t = i / 49;
      L = { name, style, stone: Math.round((0.35 + 0.5 * t) * 100) / 100, noise: Math.round((0.1 - 0.075 * t) * 1000) / 1000 };
      if (style === 'pyramid') { L.storeys = n >= 30 ? [5, 4, 3, 2, 1] : [4, 3, 2, 1]; if (n >= 30) L.base = 2; L.mover = n % 2 === 0; L.cloud = n % 3 === 0; }
      if (style === 'sky' || style === 'islands' || style === 'skyline') L.cloud = true;
      if (n % 3 === 0 && !L.mover) { L.map = 'desert'; L.high = n % 2 ? 'red' : 'blue'; }
    }
    // how many masks: 0 on level 1, then one more every 5 levels (9 = every soldier)
    const count = n === 1 ? 0 : Math.min(9, 1 + Math.floor((n - 2) / 5));
    const pool = MASK_TIERS[0].concat(n >= 15 ? MASK_TIERS[1] : [], n >= 28 ? MASK_TIERS[2] : []);
    if (n <= 6) L.kinds = Array(count).fill(pk(MASK_TIERS[0]));                       // 1 mask
    else if (n <= 11) { const a = pk(pool); L.kinds = Array(count).fill(a); }          // 2 of the same
    else {                                                                              // different masks, stronger ones later
      const strong = pool.slice(Math.floor(pool.length * Math.min(0.6, t2(n))));
      L.kinds = Array.from({ length: count }, (_, k) => pk(k % 2 ? strong : pool));
    }
    if (n >= 20 && (n >= 30 || n % 2 === 0)) L.king = pk(KING_TIERS[0].concat(n >= 30 ? KING_TIERS[1] : [], n >= 40 ? KING_TIERS[2] : []));
    if (n === 50) {                                                                     // the best line-up
      L.kinds = ['springtrap', 'gendo', 'nfoxy', 'fmangle', 'rfoxy', 'electrobab', 'dmangle', 'pbennard', 'ennard'];
      L.king = 'dread';
    }
    if (n >= 25) L.ball = n === 50 ? 'swamp' : pk(n >= 40 ? ['swamp', 'sun', 'moon'] : ['sun', 'moon']);   // the CPU's cannonball power
    return L;
  });
  function t2(n) { return (n - 12) / 38; }

  // ------------------------------------------------------------------ canvas + camera
  let cv, ctx, dpr = 1, SW = 1, SH = 1;
  const HUD_T = 54, HUD_B = 84;             // screen space the top banner / bottom toolbar cover
  const cam = { x: 0, y: 0, z: 0.3, shake: 0, lock: false, cx: 0, cy: 0, t: null };
  const minZ = () => Math.min(SW / (WORLD_X1 - WORLD_X0), SH / (H + 260));
  function clampCam() {
    cam.z = clamp(cam.z, minZ(), 2.4);
    const vw = SW / cam.z, vh = SH / cam.z, x0 = WORLD_X0, x1 = WORLD_X1, y0 = -700, y1 = H + 330;
    cam.x = vw >= x1 - x0 ? (x0 + x1 - vw) / 2 : clamp(cam.x, x0, x1 - vw);
    cam.y = vh >= y1 - y0 ? (y0 + y1 - vh) / 2 : clamp(cam.y, y0, y1 - vh);
  }
  const toWorld = (sx, sy) => ({ x: cam.x + sx / cam.z, y: cam.y + sy / cam.z });
  const toScreen = (wx, wy) => ({ x: (wx - cam.x) * cam.z, y: (wy - cam.y) * cam.z });
  function lookAt(wx, wy, z) { if (z) cam.z = z; clampCam(); cam.x = wx - SW / 2 / cam.z; cam.y = wy - SH / 2 / cam.z; clampCam(); }
  function zoomAt(sx, sy, f) {
    const w = toWorld(sx, sy);
    cam.z = clamp(cam.z * f, minZ(), 2.4);
    cam.x = w.x - sx / cam.z; cam.y = w.y - sy / cam.z; clampCam();
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    SW = window.innerWidth; SH = window.innerHeight;
    cv.width = Math.round(SW * dpr); cv.height = Math.round(SH * dpr);
    if (cam.lock && S) refocus(true); else clampCam();
  }
  const buildZoom = () => clamp(SH / (22 * CELL), minZ(), 2.4);

  // --- the battle camera frames things by itself and the player can't move it
  // fitWidth: fill the screen's width with the box and keep the view standing on its bottom edge,
  // so a whole 50-square-tall side never zooms out far enough to show the enemy's land
  // anchor 'right' / 'left': when the view comes out wider than the box, keep that edge in place
  // (a side's view never spills over its border into the enemy's land; the spare room goes behind its cannon)
  // fence: [left, right] the view may not reach past (e.g. the enemy's border); it zooms in rather than cross it
  function frameTarget(x0, y0, x1, y1, fitWidth = false, fence = null) {
    const ah = Math.max(120, SH - HUD_T - HUD_B);
    let z = clamp(fitWidth ? SW / (x1 - x0) : Math.min(SW / (x1 - x0), ah / (y1 - y0)), 0.04, 2.4);
    const cx = (x0 + x1) / 2;
    if (fence) { const half = Math.min(cx - fence[0], fence[1] - cx); if (SW / z / 2 > half) z = SW / (2 * half); }
    const hv = ah / z;
    return { cx, cy: hv < y1 - y0 ? y1 - hv / 2 : (y0 + y1) / 2, z };
  }
  // a side, from its cannon to its border, and from its highest block or unit down to the ground
  function sideRect(s) {
    let top = H - 12 * CELL;
    for (const b of blocks.concat(units, clouds)) if (!b.gm.dead && zoneOf(Math.floor(b.position.x / CELL)) === s) top = Math.min(top, b.bounds.min.y);
    const y1 = landFloor(s) * CELL + CELL * 1.2, y0 = Math.max(-CELL, Math.min(top, y1 - 14 * CELL) - 2 * CELL);
    // from the cannon platform to the border, centred, never reaching into the enemy's land
    return s === 'blue' ? [PLAT.blue.x0 - CELL, y0, BLUE_END * CELL + CELL, y1, false, [-1e9, RED_START * CELL]]
      : [RED_START * CELL - CELL, y0, PLAT.red.x1 + CELL, y1, false, [BLUE_END * CELL, 1e9]];
  }
  function armyRect(s) {
    const us = aliveUnits(s);
    if (!us.length) return sideRect(s);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const u of us) { x0 = Math.min(x0, u.position.x); x1 = Math.max(x1, u.position.x); y0 = Math.min(y0, u.position.y); y1 = Math.max(y1, u.position.y); }
    x0 -= 3 * CELL; x1 += 3 * CELL; y0 -= 3 * CELL; y1 += 2 * CELL;
    const mw = 20 * CELL, mh = 10 * CELL;
    if (x1 - x0 < mw) { const c = (x0 + x1) / 2; x0 = c - mw / 2; x1 = c + mw / 2; }
    if (y1 - y0 < mh) { const c = (y0 + y1) / 2; y0 = c - mh / 2; y1 = c + mh / 2; }
    return [x0, y0, x1, Math.min(y1, H + CELL * (us.some(u => u.gm.dig) ? DIG_DEPTH + 1.2 : 1.2))];     // show Chipper's tunnel
  }
  // whether a human on this device controls a side
  const localCtrl = s => S.mode === 'hotseat' || (S.mode === 'online' ? s === S.mySide : s === 'blue');
  // Everyone watches the same thing: the side whose turn it is (its army when it rolls), the cannonball in flight,
  // and then the side it landed on, so both players see the damage and can plan a counter.
  function refocus(instant = false) {
    if (!S || S.phase !== 'battle') return;
    if (S.flyView && !S.result) return;              // a shot is being followed (stepCamera drives it)
    if (cam.free) { if (S.act === 'dice' && !S.result) return; unfreeCam(); }   // the player is steering the camera
    let r;
    if (S.result) r = sideRect(S.result === 'draw' ? S.turn : other(S.result));
    else if (S.act === 'throw') r = launcherRect();
    else if (S.act === 'dice' || ((S.act === 'settle' || S.act === 'wait') && S.lastMode === 'dice')) r = armyRect(S.turn);
    else r = sideRect(S.turn);
    cam.t = frameTarget(...r);
    if (instant) { cam.cx = cam.t.cx; cam.cy = cam.t.cy; cam.z = cam.t.z; }
  }
  // throwing / launching / a fireball: frame that unit the way the cannon is framed, facing the enemy
  function launcherRect() {
    const ch = units.find(u => u.gm.id === S.throwBy && !u.gm.dead);
    if (!ch) return armyRect(S.turn);
    const d = ch.gm.side === 'blue' ? 1 : -1, x = ch.position.x, y = ch.position.y;
    return [x - (d > 0 ? 5 : 17) * CELL, y - 8 * CELL, x + (d > 0 ? 17 : 5) * CELL, y + 3 * CELL];
  }
  // the camera chases the cannonball, then pulls back over the side it reaches (a thrown cupcake is simply followed)
  function followShot() {
    if (S.flyView === 'cup') {
      const b = S.flyBody;
      S.flyT++;
      if (b && !b.gm.dead && (S.flyT < 20 || b.speed > 0.4) && S.flyT < 400) cam.t = { cx: b.position.x, cy: b.position.y, z: cam.t ? cam.t.z : cam.z, fast: true };
      else { S.flyView = null; S.flyBody = null; refocus(); }
      return;
    }
    if (S.flyView !== 'ball') return;
    const b = balls.find(x => !x.gm.dead), foe = other(S.turn);
    if (S.flyDice) {                                 // launched with the dice: just follow it, then back to the army
      if (b) cam.t = { cx: b.position.x, cy: Math.min(b.position.y, H - 4 * CELL), z: cam.t ? cam.t.z : cam.z, fast: true };
      else { S.flyView = null; S.flyDice = false; refocus(); }
      return;
    }
    if (b && zoneOf(Math.floor(b.position.x / CELL)) !== foe && b.position.y < H + CELL * 4) {
      cam.t = { cx: b.position.x, cy: Math.min(b.position.y, H - 4 * CELL), z: cam.t ? cam.t.z : cam.z, fast: true };
    } else {
      S.flyView = 'foe';
      cam.t = frameTarget(...sideRect(foe));
    }
  }
  function lockCamera() {
    cam.lock = true;
    cam.cx = cam.x + SW / 2 / cam.z;
    cam.cy = cam.y + (HUD_T + (SH - HUD_T - HUD_B) / 2) / cam.z;
  }
  // on your dice turn you can zoom and pan yourself (the camera first frames your whole army)
  const diceCam = () => !!(S && S.phase === 'battle' && S.act === 'dice' && myTurn());
  function freeCam() { if (!cam.free) { cam.free = true; cam.t = null; } }
  function unfreeCam() { if (cam.free) { cam.free = false; lockCamera(); } }
  function stepCamera() {
    if (!cam.lock) return;
    if (cam.free) { if (S && S.flyView) unfreeCam(); else return; }
    if (S && S.flyView) followShot();
    if (!cam.t) return;
    const k = cam.t.fast ? 0.35 : 0.08;
    cam.z += (cam.t.z - cam.z) * k; cam.cx += (cam.t.cx - cam.cx) * k; cam.cy += (cam.t.cy - cam.cy) * k;
    cam.x = cam.cx - SW / 2 / cam.z;
    cam.y = cam.cy - (HUD_T + (SH - HUD_T - HUD_B) / 2) / cam.z;
  }

  // ------------------------------------------------------------------ match state
  let S = null;
  let engine = null, blocks = [], clouds = [], units = [], balls = [], specials = [], parts = [], removeQ = [];
  let riding = new Set(), terrain = [];
  const GROUND_HIT = { gm: { type: 'ground' } };     // what solidAt() reports for the ground itself
  let nextId = 1;
  let running = false;

  const bs = () => (S.mode === 'online' ? S.mySide : S.buildSide);       // who is building on this screen
  const isAuth = () => S.mode !== 'online' || S.turn === S.mySide;        // this device runs the current turn
  const myTurn = () => S.phase === 'battle' && !S.result && localCtrl(S.turn) && S.cpu !== S.turn;
  const aliveUnits = (side, kind) => units.filter(u => !u.gm.dead && u.gm.side === side && (!kind || u.gm.kind === kind));
  const soldiers = side => units.filter(u => !u.gm.dead && u.gm.side === side && isSoldier(u.gm.kind)).length;

  function newState(opts) {
    const eq = Store.get('equip').slice();
    return {
      mode: opts.mode, mySide: opts.mySide || null, phase: 'build', buildSide: 'blue',
      level: opts.level == null ? null : opts.level, cpu: opts.mode === 'campaign' ? 'red' : null,
      layouts: { blue: { blocks: [], units: [] }, red: { blocks: [], units: [] } },
      ready: { blue: false, red: false },
      tool: 'block', mat: 'stone', shape: 's11', unitTool: 'endo', doorPending: { blue: null, red: null },
      turn: 'blue', act: 'choose', lastMode: null, final: null, result: null,
      rolls: 0, pts: 0, die: 0, rolling: 0, dtool: 'move', sel: null, aimVec: null, throwBy: null,
      aimAng: { blue: -Math.PI / 4, red: -Math.PI * 3 / 4 },
      quiet: 0, settleT: 0, flee: { blue: 0, red: 0 }, fled: [], hover: null, turnNo: 0,
      shotLog: null, recheck: false, bonus: null, flyView: null, tunnels: [], graves: { blue: [], red: [] },
      map: 'field', high: null,
      heat: { blue: 0, red: 0 }, cool: { blue: 0, red: 0 }, hot: false, magic: 0, powerUsed: { blue: false, red: false },
      ammo: 'ball', cannonDown: { blue: false, red: false }, cannonHp: { blue: CANNON_HP, red: CANNON_HP }, retried: false, maskPending: [], autoStyle: { blue: Math.floor(Math.random() * 10) - 1, red: Math.floor(Math.random() * 10) - 1 },
      cpuCorr: 1, cpuShot: null, cpuRaid: [], flyBody: null, flyT: 0, flyDice: false, throwKind: 'cupcake', refund: null,
      // shop looks (team colour, block colours, cannon): this device's on the side it plays, the default on the other
      looks: {
        blue: opts.mode === 'online' && opts.mySide === 'red' ? {} : { ...(Store.get('looks') || {}) },
        red: opts.mode === 'online' && opts.mySide === 'red' ? { ...(Store.get('looks') || {}) } : {},
      },
      // the device's equipment bar (in pass & play both players may use it)
      equip: { blue: eq, red: opts.mode === 'hotseat' ? eq.slice() : opts.mode === 'online' ? eq.slice() : [] },
      used: { blue: [], red: [] },
    };
  }

  // ------------------------------------------------------------------ building (grid layouts, no physics yet)
  function itemCells(it) {
    if (!it.shape) return [[it.c, it.r]];
    const sh = SHAPES[it.shape], out = [];
    for (let dx = 0; dx < sh.w; dx++) for (let dy = 0; dy < sh.h; dy++) out.push([it.c + dx, it.r + dy]);
    return out;
  }
  function occMap() {
    const items = new Map(), us = new Map();
    for (const side of ['blue', 'red']) {
      const L = S.layouts[side];
      for (const it of L.blocks) for (const [c, r] of itemCells(it)) items.set(key(c, r), it);
      for (const it of L.units) us.set(key(it.c, it.r), it);
    }
    return { items, units: us };
  }
  // the tapped cell is the shape's BOTTOM-LEFT corner, so a block sits where you point
  function placedShape(c, r) { const sh = SHAPES[S.shape]; return { shape: S.shape, mat: S.mat, c, r: r - sh.h + 1 }; }
  const solidItem = it => it && (isSolid(it.mat) || it.mat === 'cloud');
  // returns '' when fine, otherwise the reason it can't go there
  function placeProblem(it, side, occ) {
    const L = S.layouts[side];
    if (L.blocks.length >= MAX_ITEMS) return `Block limit reached (${MAX_ITEMS})`;
    for (const [c, r] of itemCells(it)) {
      if (c < 0 || c >= COLS || r < 0 || zoneOf(c) !== side) return 'Only on your own colour';
      if (r >= groundRow(c)) return MAPK === 'towers' ? "That's the concrete base" : "That's solid ground";
      if (mapSolid(c, r) || mapRope(c, r)) return "That's a tree";
      if (MAPK === 'towers' && !onPlate(c, side)) return 'On the Towers you build on your concrete base';
      if (occ.items.has(key(c, r)) || (occ.units.has(key(c, r)) && it.mat !== 'door' && it.mat !== 'rope')) return 'That space is taken';
    }
    const sh = SHAPES[it.shape];
    if (it.mat === 'door') {
      if (!isSolid((occ.items.get(key(it.c, it.r + 1)) || {}).mat)) return 'A door must stand on a block';
      if (!S.doorPending[side] && L.blocks.filter(b => b.mat === 'door').length >= MAX_DOORS * 2) return `Only ${MAX_DOORS} door pairs`;
    }
    if (it.mat === 'rope') {
      // it can also be tied under another rope (or stand on one), so ropes chain into longer ropes
      const top = occ.items.get(key(it.c, it.r - 1)), below = it.r + sh.h >= groundRow(it.c) ? { mat: 'stone' } : occ.items.get(key(it.c, it.r + sh.h));
      const rope = x => !!(x && x.mat === 'rope');
      if (!solidItem(top) && !isSolid((below || {}).mat) && !rope(top) && !rope(below)) return 'A rope must hang under a block or another rope, or stand on a block';
    }
    return '';
  }
  function buildTap(c, r) {
    const side = bs(), L = S.layouts[side], occ = occMap();
    if (S.phase === 'build') {
      const here = occ.items.get(key(c, r));
      if (S.tool === 'erase') {
        if (here && L.blocks.includes(here)) removeItem(side, here);
        return;
      }
      if (here && (here.mat === 'arrow' || here.mat === 'varrow') && L.blocks.includes(here)) { here.dir = -here.dir; Sfx.play('click'); return; }
      const it = placedShape(c, r);
      const why = placeProblem(it, side, occ);
      if (why) { Sfx.play('bad'); toast(why); return; }
      it.id = nextId++;
      if (it.mat === 'door') {
        const pend = L.blocks.find(b => b.id === S.doorPending[side]);
        if (pend) { it.color = 'red'; it.link = pend.id; pend.link = it.id; S.doorPending[side] = null; toast('Door pair done! Gold goes in, red comes out.'); }
        else { it.color = 'gold'; it.link = null; S.doorPending[side] = it.id; toast('Now place the RED exit door'); }
      }
      if (it.mat === 'arrow') it.dir = side === 'blue' ? 1 : -1;
      if (it.mat === 'varrow') it.dir = -1;             // up
      L.blocks.push(it); Sfx.play('place');
    } else if (S.phase === 'units') {
      const here = occ.units.get(key(c, r)), item = occ.items.get(key(c, r));
      if (S.unitTool === 'remove') {
        if (here && L.units.includes(here)) { L.units.splice(L.units.indexOf(here), 1); Sfx.play('back'); }
        return;
      }
      const left = unitsLeft(side)[S.unitTool];
      if (left <= 0) { Sfx.play('bad'); toast(S.unitTool === 'king' ? 'Freddy is already placed' : 'All 9 Endos are placed'); return; }
      if (here || (item && item.mat !== 'door' && item.mat !== 'rope') || zoneOf(c) !== side || r < 0 || r >= groundRow(c) || mapSolid(c, r)
        || (MAPK === 'towers' && !onPlate(c, side))) { Sfx.play('bad'); return; }
      L.units.push({ id: nextId++, kind: S.unitTool, c, r }); Sfx.play('place');
      if (unitsLeft(side)[S.unitTool] === 0 && S.unitTool === 'king') S.unitTool = 'endo';
    }
  }
  function removeItem(side, it) {
    const L = S.layouts[side];
    L.blocks.splice(L.blocks.indexOf(it), 1);
    if (it.mat === 'door') {                      // doors come and go in pairs
      const mate = L.blocks.find(b => b.id === it.link);
      if (mate) L.blocks.splice(L.blocks.indexOf(mate), 1);
      if (S.doorPending[side] === it.id) S.doorPending[side] = null;
    }
    dropLooseRopes(side);
    Sfx.play('back');
  }
  // build phase: ropes left holding on to nothing (their block or the rope above was erased) go too
  function dropLooseRopes(side) {
    const L = S.layouts[side];
    const held = new Set();
    let changed = true;
    while (changed) {                                   // a rope is held by a block, the ground, or a rope that is held
      changed = false;
      const occ = occMap();
      for (const r of L.blocks) {
        if (r.mat !== 'rope' || held.has(r)) continue;
        const h = SHAPES[r.shape].h, top = occ.items.get(key(r.c, r.r - 1)), below = occ.items.get(key(r.c, r.r + h));
        if (solidItem(top) || r.r + h >= groundRow(r.c) || isSolid((below || {}).mat) || (top && held.has(top)) || (below && held.has(below))) { held.add(r); changed = true; }
      }
    }
    L.blocks = L.blocks.filter(b => b.mat !== 'rope' || held.has(b));
  }
  function unitsLeft(side) {
    const u = S.layouts[side].units;
    return { endo: SOLDIERS - u.filter(x => isSoldier(x.kind)).length, king: 1 - u.filter(x => x.kind === 'king').length };
  }

  // Ready-made fortresses: the "Auto Fort" button (tap again for the next style) and every campaign level
  // (seeded, so a level always looks the same). Coordinates are written for BLUE's land (columns 0-24) and mirrored for red.
  const FORT_STYLES = ['pyramid', 'bunker', 'hall', 'village', 'sky', 'skyline', 'castle', 'islands', 'ziggurat', 'stilts'];
  const TOWER_STYLES = ['keep', 'twin'];              // the Towers' 15-wide concrete bases get forts built to fit them
  const fortStyles = () => MAPK === 'towers' ? TOWER_STYLES : FORT_STYLES;
  const FORT_NAMES = { pyramid: 'Pyramid', bunker: 'Bunker', hall: 'Great Hall', village: 'Village', sky: 'Sky Fort',
    skyline: 'Skyline', castle: 'Castle', islands: 'Floating Islands', ziggurat: 'Ziggurat', stilts: 'Stilt Village',
    keep: 'Tower Keep', twin: 'Twin Towers' };
  function genFort(side, o = {}) {
    const rnd = o.rng || Math.random, pk = a => a[Math.floor(rnd() * a.length)];
    const L = { blocks: [], units: [] }, occ = new Set();
    let spots = [], kingSpot = null;
    const real = c => (side === 'red' ? COLS - 1 - c : c);
    const put = (shape, mat, c, r, extra = {}) => {
      const sh = SHAPES[shape];
      let cc = c, s = shape;
      if (side === 'red') { cc = COLS - c - sh.w; s = MIRROR[shape] || shape; }
      const it = { id: nextId++, shape: s, mat, c: cc, r, ...extra };
      if (side === 'red' && it.dir) it.dir = -it.dir;
      const cells = itemCells(it);
      if (cells.some(([x, y]) => occ.has(key(x, y)) || zoneOf(x) !== side || y < 0 || y >= groundRow(x) || mapSolid(x, y) || mapRope(x, y)
        || (MAPK === 'towers' && !onPlate(x, side)))) return null;
      cells.forEach(([x, y]) => occ.add(key(x, y)));
      L.blocks.push(it); return it;
    };
    let style = o.style || 'pyramid';
    if (MAPK === 'towers' && !TOWER_STYLES.includes(style)) style = TOWER_STYLES[FORT_STYLES.indexOf(style) % 2 === 1 ? 1 : 0];
    const stone = o.stone != null ? o.stone : 0.35;
    const mat = () => (rnd() < stone ? 'stone' : 'wood');
    const F = landFloor(side);                       // the side's ground row (the desert plateau is higher)
    // a little room: two 3-high pillars and a 4-wide plank roof, standing on floor row fl; returns its two unit spots
    const room = (x, fl, pm, plank) => { put('s13', pm, x, fl - 3); put('s13', pm, x + 3, fl - 3); put('s41', plank || pm, x, fl - 4); return [[x + 1, fl - 1], [x + 2, fl - 1]]; };

    if (style === 'pyramid') {                       // storeys of little rooms, wide at the bottom
      const storeys = o.storeys || [4, 3, 2, 1];
      const base = o.base != null ? o.base : 2 + Math.floor(rnd() * 3);
      let floor = F;
      storeys.forEach((n, lv) => {
        const x0 = base + lv * 2;
        const pillar = lv === 0 && stone > 0.2 ? 'stone' : mat();
        const plank = lv === storeys.length - 1 ? 'stone' : rnd() < stone ? 'stone' : pk(['wood', 'wood', 'glass']);
        for (let i = 0; i < n; i++) {
          const x = x0 + i * 4;
          put('s13', pillar, x, floor - 3); put('s13', pillar, x + 3, floor - 3);
          put('s41', plank, x, floor - 4);
          const sx = x + 1 + (rnd() < 0.5 ? 0 : 1);
          spots.push([sx, floor - 1]);
          if (rnd() < 0.6) put('s11', 'glass', sx === x + 1 ? x + 2 : x + 1, floor - 1);
        }
        floor -= 4;
      });
      const width = storeys[0] * 4, xt = base + (storeys.length - 1) * 2;
      put('rr2', 'stone', base - 2, F - 2);
      put('rl2', 'stone', base + width, F - 2);
      for (let i = 0; i < 3; i++) put('s14', i === 2 ? 'glass' : 'stone', base + width + 3, F - 4 - i * 4);
      put('rr1', 'wood', xt, floor - 1); put('rl1', 'wood', xt + 3, floor - 1);
      kingSpot = spots.pop();
      if (o.cloud) {                                // a little tower hanging under a cloud, high above the fort
        const cx = base + 5;
        put('c42', 'cloud', cx, F - 32); put('s12', 'stone', cx + 1, F - 30); put('s41', 'wood', cx, F - 28);
        put('s11', 'glass', cx, F - 29);
        spots.unshift([cx + 3, F - 29]);            // extras go first so they always get a soldier
      }
      if (o.mover) {                                // a moving platform above the fort, between two arrows
        const mr = F - 25;
        put('a1', 'arrow', 0, mr, { dir: 1 }); put('s31', 'stone', 1, mr); put('a1', 'arrow', 13, mr, { dir: -1 });
        spots.unshift([2, mr - 1]);
      }
    } else if (style === 'bunker') {                 // closed in and strong: double stone walls, two floors, stone roof
      const x0 = 3 + Math.floor(rnd() * 4);
      for (const wx of [x0, x0 + 1, x0 + 14, x0 + 15]) { put('s14', 'stone', wx, F - 4); put('s14', 'stone', wx, F - 8); }
      for (const lv of [0, 1]) {
        const fl = F - lv * 4;
        for (const k of [0, 1, 2]) {
          const x = x0 + 2 + k * 4;
          put('s13', mat(), x, fl - 3); put('s13', mat(), x + 3, fl - 3);
          put('s41', 'stone', x, fl - 4);
          spots.push([x + 1, fl - 1], [x + 2, fl - 1]);
        }
      }
      for (const k of [0, 1, 2]) put('s41', 'wood', x0 + 2 + k * 4, F - 9);
      put('s11', 'stone', x0, F - 9); put('s11', 'stone', x0 + 15, F - 9);
      put('rr2', 'stone', x0 - 2, F - 2); put('rl2', 'stone', x0 + 16, F - 2);
      kingSpot = spots.splice(8, 1)[0];             // the middle room upstairs
    } else if (style === 'hall') {                   // open and big: a colonnade with a two-layer deck
      const x0 = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k <= 7; k++) { const cm = k % 3 === 0 ? 'stone' : mat(); put('s14', cm, x0 + 3 * k, F - 4); put('s14', cm, x0 + 3 * k, F - 8); }
      for (let j = 0; j <= 3; j++) put('s41', 'wood', x0 + 6 * j, F - 9);             // lower beams, each on two columns
      for (let j = 0; j <= 2; j++) put('s41', pk(['wood', 'stone']), x0 + 6 * j + 3, F - 10);   // upper beams bridge the gaps
      for (let j = 0; j <= 3; j++) spots.push([x0 + 6 * j + 1 + (j % 2), F - 10]);
      for (let j = 0; j <= 2; j++) spots.push([x0 + 6 * j + 4, F - 11]);
      for (let k = 0; k <= 6; k++) { spots.push([x0 + 3 * k + 1, F - 1]); if (k % 2 === 0) put('s11', 'glass', x0 + 3 * k + 2, F - 1); }
      put('s11', 'stone', x0 + 9, F - 11); put('s11', 'stone', x0 + 12, F - 11);
      kingSpot = [x0 + 10, F - 11];
      spots = spots.filter(s => !(s[0] === x0 + 10 && s[1] === F - 11));
    } else if (style === 'village') {                // small huts side by side
      [0, 5, 10, 15, 20].forEach((x, i) => {
        const m = i === 2 ? 'stone' : mat();
        put('s13', m, x, F - 3); put('s13', m, x + 3, F - 3);
        put('s41', i === 2 ? 'stone' : pk(['wood', 'wood', 'stone']), x, F - 4);
        put('rr2', 'wood', x, F - 6); put('rl2', 'wood', x + 2, F - 6);
        spots.push([x + 1, F - 1], [x + 2, F - 1]);
        if (i !== 2 && rnd() < 0.5) put('s11', 'glass', x + 4, F - 1);
      });
      kingSpot = spots.splice(4, 1)[0];             // the stone hut in the middle
    } else if (style === 'sky') {                    // rooms hanging under clouds, soldiers standing on the clouds
      put('c62', 'cloud', 1, F - 24);
      put('s12', 'stone', 1, F - 22); put('s12', 'stone', 6, F - 22);
      put('s41', 'wood', 1, F - 20); put('s21', 'wood', 5, F - 20);
      spots.push([2, F - 21], [4, F - 21], [5, F - 21], [2, F - 25], [5, F - 25]);
      put('c42', 'cloud', 10, F - 16);
      put('s12', 'stone', 10, F - 14); put('s12', 'stone', 13, F - 14);
      put('s41', 'wood', 10, F - 12);
      put('r4', 'rope', 11, F - 11);
      spots.push([11, F - 13], [12, F - 13]);
      for (const g0 of [15, 20]) {                   // two small keeps on the ground
        put('s14', 'stone', g0, F - 4); put('s14', 'stone', g0 + 3, F - 4); put('s41', 'stone', g0, F - 5);
        spots.push([g0 + 1, F - 1], [g0 + 2, F - 1]);
      }
      put('r6', 'rope', 8, F - 6);
      kingSpot = [3, F - 21];
    } else if (style === 'keep') {                  // the Towers: a stepped keep that fits the 15-wide base (columns 5-19)
      [[5, 9, 13], [7, 11], [9]].forEach((xs, lv) => xs.forEach(x => spots.push(...room(x, F - lv * 4, lv === 0 ? 'stone' : mat(), lv === 2 ? 'stone' : pk(['stone', 'wood'])))));
      put('rr1', 'wood', 9, F - 13); put('rl1', 'wood', 12, F - 13);
      put('rr2', 'stone', 17, F - 2);
      kingSpot = spots.splice(spots.length - 2, 1)[0];
    } else if (style === 'twin') {                   // the Towers: two stacked towers with a cloud bridge between them
      for (const x of [5, 13]) { let fl = F; for (let k = 0; k < 3; k++) { spots.push(...room(x, fl, 'stone', k === 2 ? 'stone' : pk(['stone', 'wood']))); fl -= 4; } }
      put('c31', 'cloud', 9, F - 12); put('s11', 'glass', 10, F - 13);
      spots.push([9, F - 13], [11, F - 13]);
      put('s12', 'stone', 9, F - 2); put('s12', 'stone', 12, F - 2); put('s41', 'wood', 9, F - 3);
      spots.push([10, F - 1], [11, F - 1]);
      kingSpot = spots.splice(4, 1)[0];
    } else if (style === 'skyline') {                // five towers of stacked rooms, the tallest crowned by a floating cloud
      const hts = [2, 4, 6, 4, 2];
      [0, 5, 10, 15, 20].forEach((x, i) => {
        let fl = F;
        for (let k = 0; k < hts[i]; k++) { spots.push(...room(x, fl, k < 2 ? 'stone' : mat(), k === hts[i] - 1 ? 'stone' : pk(['wood', 'stone', 'glass']))); fl -= 4; }
        put('rr1', 'wood', x, fl - 1); put('rl1', 'wood', x + 3, fl - 1);
      });
      put('c62', 'cloud', 9, F - 30); put('r4', 'rope', 11, F - 28);
      spots.unshift([10, F - 31], [13, F - 31]);
      kingSpot = spots.find(s => s[0] === 11 && s[1] === F - 21) || [11, F - 21];
      spots = spots.filter(s => s !== kingSpot);
    } else if (style === 'castle') {                 // two corner towers, a battlement wall and a keep on top of it
      for (const tx of [0, 20]) {
        let fl = F;
        for (let k = 0; k < 4; k++) { spots.push(...room(tx, fl, 'stone', k < 2 || k === 3 ? 'stone' : pk(['stone', 'wood']))); fl -= 4; }
        put('s11', 'stone', tx, fl - 1); put('s11', 'stone', tx + 3, fl - 1);             // battlements
        spots.push([tx + 1, fl - 1]);
      }
      for (let x = 4; x <= 18; x += 2) put('s22', 'stone', x, F - 2);                  // the curtain wall
      for (const x of [4, 6, 17, 19]) put('s11', 'stone', x, F - 3);                 // merlons
      spots.push([5, F - 3], [18, F - 3], [7, F - 3], [16, F - 3]);
      spots.push(...room(8, F - 2, 'stone', 'wood'), ...room(12, F - 2, 'stone', 'wood'));
      room(10, F - 6, mat(), 'stone');
      put('s11', 'stone', 10, F - 11); put('s11', 'stone', 13, F - 11);             // the keep's crown
      kingSpot = [11, F - 7];
    } else if (style === 'islands') {                // huts on floating clouds at three heights, ropes hanging down
      const isles = [[1, F - 9], [9, F - 17], [17, F - 25]];
      for (const [x, y] of isles) {
        put('c62', 'cloud', x, y);
        put('s12', 'stone', x + 1, y - 2); put('s12', 'stone', x + 4, y - 2); put('s41', pk(['wood', 'stone']), x + 1, y - 3);
        put('s11', 'glass', x + 1, y + 2); put('s11', 'stone', x + 2, y + 2);         // a little block hanging underneath
        put('r6', 'rope', x + 5, y + 2);
        spots.push([x + 2, y - 1], [x + 3, y - 1], [x, y - 1]);
      }
      put('c42', 'cloud', 3, F - 32);                                               // the King's island at the very top
      put('s12', 'stone', 3, F - 34); put('s12', 'stone', 6, F - 34); put('s41', 'stone', 3, F - 35);
      put('rr1', 'glass', 3, F - 36); put('rl1', 'glass', 6, F - 36);
      put('r4', 'rope', 4, F - 30);
      kingSpot = [4, F - 33];
      spots.push([5, F - 33]);
      put('s14', 'stone', 10, F - 4); put('s14', 'stone', 13, F - 4); put('s41', 'stone', 10, F - 5);             // a bunker on the ground
      spots.push([11, F - 1], [12, F - 1]);
    } else if (style === 'ziggurat') {               // a huge stepped temple of 2x2 blocks with a shrine on top
      [[2, 20], [4, 18], [6, 16], [8, 14], [10, 12]].forEach(([a, b], lv) => {
        const m = lv === 0 || lv === 4 ? 'stone' : mat();
        for (let x = a; x <= b; x += 2) put('s22', m, x, F - 2 - lv * 2);
        if (lv < 4) spots.push([a, F - 3 - lv * 2], [a + 1, F - 3 - lv * 2], [b + 1, F - 3 - lv * 2], [b, F - 3 - lv * 2]);
      });
      put('rr2', 'stone', 0, F - 2); put('rl2', 'stone', 22, F - 2);
      put('s12', 'stone', 10, F - 12); put('s12', 'stone', 13, F - 12); put('s41', 'glass', 10, F - 13);
      put('rr1', 'wood', 10, F - 14); put('rl1', 'wood', 13, F - 14);
      kingSpot = [11, F - 11];
      spots.unshift([12, F - 11]);
    } else if (style === 'stilts') {                 // a village of huts on tall stilts, rope ladders underneath
      [[0, 8], [6, 12], [12, 8], [18, 12]].forEach(([x, h]) => {
        for (let k = 4; k <= h; k += 4) { put('s14', mat(), x, F - k); put('s14', mat(), x + 3, F - k); }
        const p = F - h - 1;
        put('s41', 'wood', x, p);
        put('s12', 'wood', x, p - 2); put('s12', 'wood', x + 3, p - 2); put('s41', pk(['wood', 'stone']), x, p - 3);
        put('rr1', 'wood', x, p - 4); put('rl1', 'wood', x + 3, p - 4);
        put('r6', 'rope', x + 1, p + 1);
        spots.push([x + 1, p - 1], [x + 2, p - 1], [x + 2, F - 1]);
      });
      kingSpot = spots.splice(4, 1)[0];             // the first tall hut
    }
    // not enough rooms? the rest stand on free ground in the land
    // (on the Towers, units only stand on the concrete base)
    const spotOk = ([c, r]) => !mapSolid(real(c), r) && (MAPK !== 'towers' || onPlate(real(c), side));
    spots = spots.filter(spotOk);
    if (!kingSpot || !spotOk(kingSpot)) kingSpot = spots.shift() || [PLATE.blue[0] + 7, F - 1];
    for (let c = 0; c < BLUE_END && spots.length < SOLDIERS; c++) if (spotOk([c, F - 1]))
      if (!occ.has(key(real(c), F - 1)) && !spots.some(s => s[0] === c && s[1] === F - 1) && !(kingSpot[0] === c && kingSpot[1] === F - 1)) spots.push([c, F - 1]);
    if (MAPK === 'towers') {                         // drop anything not standing on the base (or on something that does)
      const held = new Set(), at = new Map();
      for (const it of L.blocks) for (const [x, y] of itemCells(it)) at.set(key(x, y), it);
      for (let changed = true; changed;) {
        changed = false;
        for (const it of L.blocks) {
          if (held.has(it)) continue;
          const cells = itemCells(it);
          const ok = it.mat === 'cloud' || cells.some(([x, y]) => {
            if (y + 1 >= groundRow(x)) return true;                            // on the concrete
            const b = at.get(key(x, y + 1)), a = at.get(key(x, y - 1));
            return (b && b !== it && held.has(b)) || (a && a !== it && held.has(a) && a.mat === 'cloud');
          });
          if (ok) { held.add(it); changed = true; }
        }
      }
      L.blocks = L.blocks.filter(it => held.has(it));
      const floorAt = ([c, r]) => { const x = real(c); return r + 1 >= groundRow(x) || (at.get(key(x, r + 1)) && held.has(at.get(key(x, r + 1)))) || (at.get(key(x, r + 1)) || {}).mat === 'cloud'; };
      spots = spots.filter(floorAt);
      if (!floorAt(kingSpot)) kingSpot = spots.shift() || [PLATE.blue[0] + 7, F - 1];
      for (let c = PLATE.blue[0]; c <= PLATE.blue[1] && spots.length < SOLDIERS; c++)
        if (!at.has(key(real(c), F - 1)) && !spots.some(s => s[0] === c && s[1] === F - 1) && !(kingSpot[0] === c && kingSpot[1] === F - 1)) spots.push([c, F - 1]);
    }
    L.units.push({ id: nextId++, kind: 'king', c: real(kingSpot[0]), r: kingSpot[1], ...(o.king ? { up: o.king } : {}) });
    const kinds = (o.kinds || []).slice();
    spots.slice(0, SOLDIERS).forEach(s => L.units.push({ id: nextId++, kind: kinds.shift() || 'endo', c: real(s[0]), r: s[1] }));
    return L;
  }
  // a saved fort is kept in BLUE's orientation, rows counted up from the land's floor, so it fits either side and either map
  function saveFort(side) {
    const L = S.layouts[side], F = landFloor(side);
    if (!L.blocks.length) { Sfx.play('bad'); toast('Build something first!'); return; }
    if (S.doorPending[side]) { Sfx.play('bad'); toast('Place the RED exit door first'); return; }
    const mc = (c, w) => (side === 'red' ? COLS - c - w : c);
    const forts = Store.get('forts') || [];
    const f = {
      name: 'My Fort ' + (forts.length + 1),
      blocks: L.blocks.map(b => ({ id: b.id, shape: side === 'red' ? MIRROR[b.shape] || b.shape : b.shape, mat: b.mat, c: mc(b.c, SHAPES[b.shape].w), r: b.r - F,
        dir: b.dir ? (side === 'red' ? -b.dir : b.dir) : undefined, color: b.color, link: b.link })),
      units: L.units.map(u => ({ kind: u.kind === 'king' ? 'king' : 'endo', c: mc(u.c, 1), r: u.r - F })),
    };
    forts.push(f);
    while (forts.length > 12) forts.shift();
    Store.set('forts', forts);
    Sfx.play('win');
    toast(`Saved as "${f.name}" - it's now in the Auto Fort rotation`);
  }
  function loadFort(side, f) {
    const L = { blocks: [], units: [] }, F = landFloor(side), ids = new Map(), occ = new Set();
    const mc = (c, w) => (side === 'red' ? COLS - c - w : c);
    for (const b of f.blocks) {
      const sh = SHAPES[b.shape];
      const it = { id: nextId++, shape: side === 'red' ? MIRROR[b.shape] || b.shape : b.shape, mat: b.mat, c: mc(b.c, sh.w), r: b.r + F };
      if (b.dir) it.dir = side === 'red' ? -b.dir : b.dir;
      if (b.color) { it.color = b.color; it.link = b.link; }
      const cells = itemCells(it);
      if (cells.some(([x, y]) => y < 0 || zoneOf(x) !== side || y >= groundRow(x) || occ.has(key(x, y)))) continue;
      cells.forEach(([x, y]) => occ.add(key(x, y)));
      ids.set(b.id, it.id); L.blocks.push(it);
    }
    for (const it of L.blocks) if (it.mat === 'door') {             // re-link door pairs (drop a door whose partner didn't fit)
      it.link = ids.get(it.link);
      if (!it.link) it.dead = true;
    }
    L.blocks = L.blocks.filter(b => !b.dead);
    for (const u of f.units) {
      const c = mc(u.c, 1), r = u.r + F;
      if (r < 0 || zoneOf(c) !== side || r >= groundRow(c) || L.units.some(x => x.c === c && x.r === r)) continue;
      L.units.push({ id: nextId++, kind: u.kind, c, r });
    }
    return L;
  }
  function autoUnits(side) {
    const L = S.layouts[side], occ = occMap();
    const free = [];
    for (let c = 0; c < COLS; c++) {
      if (zoneOf(c) !== side) continue;
      for (let r = 0; r < ROWS; r++) {
        const it = occ.items.get(key(c, r));
        if (r >= groundRow(c) || mapSolid(c, r) || (MAPK === 'towers' && !onPlate(c, side))) continue;
        if (occ.units.has(key(c, r)) || (it && it.mat !== 'door' && it.mat !== 'rope')) continue;
        const below = occ.items.get(key(c, r + 1));
        if (below && solidItem(below)) free.push([c, r, 3]);
        else if (r === groundRow(c) - 1) free.push([c, r, 1]);
      }
    }
    free.sort((a, b) => b[2] - a[2] || Math.random() - 0.5);
    for (const kind of ['king', 'endo']) {
      while (unitsLeft(side)[kind] > 0 && free.length) {
        const [c, r] = free.splice(Math.floor(Math.random() * Math.min(free.length, 20)), 1)[0];
        if (occMap().units.has(key(c, r))) continue;
        L.units.push({ id: nextId++, kind, c, r });
      }
    }
  }

  // ------------------------------------------------------------------ physics world
  function newEngine() {
    engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    engine.gravity.y = 1;
    const st = { isStatic: true, friction: 0.9, label: 'ground' };
    Composite.add(engine.world, [
      Bodies.rectangle(W / 2, H + 200 + (MAPK === 'towers' ? 5000 : 0), WORLD_X1 - WORLD_X0 + 1200, 400, st),   // (the Towers have no floor)
      Bodies.rectangle(WORLD_X0 - 100, H / 2 - 1500, 200, H + 3000, { isStatic: true, friction: 0.2, label: 'wall' }),
      Bodies.rectangle(WORLD_X1 + 100, H / 2 - 1500, 200, H + 3000, { isStatic: true, friction: 0.2, label: 'wall' }),
      Bodies.rectangle((PLAT.blue.x0 + PLAT.blue.x1) / 2, PLAT.blue.y - PLAT_H / 2, PLAT.blue.x1 - PLAT.blue.x0, PLAT_H, st),
      Bodies.rectangle((PLAT.red.x0 + PLAT.red.x1) / 2, PLAT.red.y - PLAT_H / 2, PLAT.red.x1 - PLAT.red.x0, PLAT_H, st),
    ]);
    // raised ground (the desert plateau and its staircase): one static slab per run of equal-height columns,
    // stretched past the map edge under the cannon
    terrain = [];
    for (let c = 0; c < COLS && MAPK !== 'towers';) {
      let e = c;
      while (e + 1 < COLS && GROUND[e + 1] === GROUND[c]) e++;
      if (GROUND[c] < ROWS) {
        const x0 = c === 0 ? WORLD_X0 - 400 : c * CELL, x1 = e === COLS - 1 ? WORLD_X1 + 400 : (e + 1) * CELL, y0 = GROUND[c] * CELL;
        terrain.push(Bodies.rectangle((x0 + x1) / 2, (y0 + H) / 2, x1 - x0, H - y0, { isStatic: true, friction: 0.9, label: 'terrain' }));
      }
      c = e + 1;
    }
    for (const t of TREES) for (const dc of [-1.5, 1.5]) terrain.push(Bodies.rectangle((t.c + 0.5 + dc) * CELL, (t.top + 0.5) * CELL, CELL * 2, CELL, { isStatic: true, friction: 0.9, label: 'terrain' }));
    Composite.add(engine.world, terrain);
    Events.on(engine, 'collisionStart', ev => { for (const p of ev.pairs) contact(p); });
    blocks = []; clouds = []; units = []; balls = []; specials = []; parts = []; removeQ = []; riding = new Set();
  }
  const G_STEP = () => engine.gravity.y * engine.gravity.scale * STEP * STEP;

  function makeBlock(shape, mat, x, y, angle = 0, id = null, hp = null) {
    const m = MAT[mat], sh = SHAPES[shape];
    const opts = { density: m.density, friction: m.friction, frictionStatic: 1.2, restitution: 0.04, frictionAir: 0.004, label: 'block' };
    const b = sh.tri ? Bodies.fromVertices(x, y, [LV[shape].lv.map(v => ({ x: v.x, y: v.y }))], opts)
      : Bodies.rectangle(x, y, sh.w * CELL, sh.h * CELL, opts);
    Body.setPosition(b, { x, y });
    const max = m.hp * Math.sqrt(area(shape));
    b.gm = { type: 'block', id: id || nextId++, mat, shape, hp: hp == null ? max : hp, max, seed: Math.random() * 1000, stuck: false, adj: [], mover: 0, side: null };
    if (angle) Body.setAngle(b, angle);
    Composite.add(engine.world, b); blocks.push(b);
    return b;
  }
  function makeCloud(shape, x, y, id, adj = []) {
    const sh = SHAPES[shape];
    const b = Bodies.rectangle(x, y, sh.w * CELL, sh.h * CELL, { isStatic: true, friction: 0.9, label: 'cloud', collisionFilter: { category: CAT_CLOUD } });
    b.gm = { type: 'cloud', id: id || nextId++, shape, adj, seed: Math.random() * 1000 };
    Composite.add(engine.world, b); clouds.push(b);
    return b;
  }
  // up = the King's upgrade, ab = Unidentified Freddy's ability, mhp = most hearts (Dread Bear's gift raises it to 3)
  function makeUnit(side, kind, x, y, id = null, hp = null, angle = 0, up = null, ab = null, mhp = null) {
    const b = Bodies.circle(x, y, CELL * (kind === 'king' ? 0.48 : 0.45),
      { density: 0.002, friction: 0.7, frictionStatic: 1, frictionAir: 0.004, restitution: 0.12, label: 'unit' });
    const max = mhp || kdOf(kind, up, ab).hp;
    b.gm = { type: 'unit', id: id || nextId++, side, kind, up: up || null, ab: ab || null, mhp: max, hp: hp == null ? max : hp,
      blink: rand(1, 5), lid: 0, hop: 0, crushCD: 0, hang: false, threw: false, blessed: false };
    setOwner(b, side);
    if (angle) Body.setAngle(b, angle);
    Composite.add(engine.world, b); units.push(b);
    return b;
  }
  function removeBody(b) {
    if (b.gm) b.gm.dead = true;
    removeQ.push(b);
  }
  const allSolid = () => blocks.concat(clouds);
  // wake everything touching a box (used when a block vanishes or a unit steps away, so nothing is left floating)
  function wakeAround(bounds, pad = CELL * 0.6) {
    for (const b of blocks.concat(units)) {
      if (!b.isSleeping || b.isStatic) continue;
      const B = b.bounds;
      if (B.max.x >= bounds.min.x - pad && B.min.x <= bounds.max.x + pad && B.max.y >= bounds.min.y - pad && B.min.y <= bounds.max.y + pad)
        Sleeping.set(b, false);
    }
  }
  // any moving body wakes the sleeping bodies it touches (Matter alone can leave a sleeping block hanging in the air)
  function wakeSweep() {
    const all = blocks.concat(units);
    const sleeping = all.filter(b => b.isSleeping && !b.gm.dead && !b.isStatic);
    if (!sleeping.length) return;
    for (const a of all) {
      if (a.isSleeping || a.isStatic || a.gm.dead || (a.speed < 0.35 && Math.abs(a.angularVelocity) < 0.01)) continue;
      const A = a.bounds;
      for (const s of sleeping) {
        if (!s.isSleeping) continue;
        const B = s.bounds;
        if (A.min.x - 3 <= B.max.x && A.max.x + 3 >= B.min.x && A.min.y - 3 <= B.max.y && A.max.y + 3 >= B.min.y) Sleeping.set(s, false);
      }
    }
  }

  // --- anti-gravity: blocks hanging from clouds stay put while they're still linked to a cloud
  function unstick(b) {
    if (!b.gm.stuck) return;
    b.gm.stuck = false;
    Body.setStatic(b, false);
    Sleeping.set(b, false);
    S.recheck = true;
  }
  function recheckStuck() {
    S.recheck = false;
    const live = new Map(blocks.filter(b => b.gm.stuck && !b.gm.dead).map(b => [b.gm.id, b]));
    if (!live.size) return;
    const reached = new Set(), q = [];
    for (const cl of clouds) for (const id of cl.gm.adj) if (live.has(id) && !reached.has(id)) { reached.add(id); q.push(id); }
    while (q.length) for (const id of live.get(q.pop()).gm.adj) if (live.has(id) && !reached.has(id)) { reached.add(id); q.push(id); }
    for (const [id, b] of live) if (!reached.has(id)) unstick(b);
  }
  // --- arrows: moving platforms (static bodies we slide by hand, carrying whatever sits on them)
  function ridersOn(b, out) {
    const top = b.bounds.min.y;
    for (const o of blocks.concat(units)) {
      if (o === b || o.isStatic || o.gm.dead || out.has(o)) continue;
      const B = o.bounds;
      if (B.max.y >= top - 3 && B.max.y <= top + 6 && B.max.x > b.bounds.min.x + 3 && B.min.x < b.bounds.max.x - 3) { out.add(o); ridersOn(o, out); }
    }
    return out;
  }
  function moveMover(b) {
    const g = b.gm, sp = g.mover * 1.0;
    const rs = ridersOn(b, new Set());
    rs.forEach(o => riding.add(o));
    if (g.maxis === 'y') {                            // a lift (blue arrows)
      const nb = { min: { x: b.bounds.min.x + 2, y: b.bounds.min.y + sp }, max: { x: b.bounds.max.x - 2, y: b.bounds.max.y + sp } };
      const front = g.mover > 0 ? nb.max.y - 1 : nb.min.y + 1, fr = Math.floor(front / CELL);
      const c0 = Math.floor((b.bounds.min.x + 3) / CELL), c1 = Math.floor((b.bounds.max.x - 3) / CELL);
      let rev = fr < 0;
      for (let c = c0; c <= c1 && !rev; c++) if (fr >= groundRow(c)) rev = true;
      if (!rev) for (const s of specials) if (s.mat === 'varrow' && s.dir === -g.mover && s.r === fr && s.c >= c0 && s.c <= c1) { rev = true; break; }
      if (!rev) for (const o of allSolid()) {
        if (o === b || o.gm.dead || rs.has(o)) continue;
        if (Bounds.overlaps(o.bounds, nb)) { rev = true; break; }
      }
      if (!rev && g.mover > 0) for (const u of units) if (!u.gm.dead && !rs.has(u) && Bounds.overlaps(u.bounds, nb) && u.position.y > b.position.y) { rev = true; break; }
      if (rev) { g.mover = -g.mover; return; }
      Body.setPosition(b, { x: b.position.x, y: b.position.y + sp });
      rs.forEach(o => Body.translate(o, { x: 0, y: sp }));
      return;
    }
    const nb = { min: { x: b.bounds.min.x + sp, y: b.bounds.min.y + 5 }, max: { x: b.bounds.max.x + sp, y: b.bounds.max.y - 2 } };
    const front = g.mover > 0 ? nb.max.x - 1 : nb.min.x + 1, fc = Math.floor(front / CELL);
    const r0 = Math.floor((b.bounds.min.y + 3) / CELL), r1 = Math.floor((b.bounds.max.y - 3) / CELL);
    let rev = fc < 0 || fc >= COLS || zoneOf(fc) !== g.side;
    if (!rev) for (const s of specials) if (s.mat === 'arrow' && s.dir === -g.mover && s.c === fc && s.r >= r0 && s.r <= r1) { rev = true; break; }
    if (!rev) for (const o of allSolid()) {
      if (o === b || o.gm.dead || rs.has(o)) continue;
      if (Bounds.overlaps(o.bounds, nb)) { rev = true; break; }
    }
    if (rev) { g.mover = -g.mover; return; }
    Body.setPosition(b, { x: b.position.x + sp, y: b.position.y });
    rs.forEach(o => Body.translate(o, { x: sp, y: 0 }));
  }

  // --- specials (doors, ropes, arrows) live on the grid, not in the physics world
  const ropeAt = (c, r) => specials.find(s => s.mat === 'rope' && s.c === c && r >= s.r && r < s.r + SHAPES[s.shape].h) || mapRope(c, r);
  const doorAt = (c, r) => specials.find(s => s.mat === 'door' && s.c === c && s.r === r) || null;
  const arrowAt = (c, r) => specials.find(s => (s.mat === 'arrow' || s.mat === 'varrow') && s.c === c && s.r === r) || null;
  function setHang(u, on) {
    if (u.gm.hang === on) return;
    u.gm.hang = on;
    Body.setStatic(u, on);
    if (!on) Sleeping.set(u, false);
  }
  // after things settle: a door with no block under it, or a rope with nothing to hold it, falls away
  function checkSpecials() {
    const gone = [];
    for (const s of specials) {
      if (s.mat === 'door' && !solidAt((s.c + 0.5) * CELL, (s.r + 1) * CELL + 6)) gone.push(s);
    }
    // ropes: held by a block above, something solid below, or a rope that is itself held (ropes tie into chains)
    const ropes = specials.filter(s => s.mat === 'rope'), held = new Set();
    for (let changed = true; changed;) {
      changed = false;
      for (const s of ropes) {
        if (held.has(s)) continue;
        const h = SHAPES[s.shape].h, x = (s.c + 0.5) * CELL;
        const tied = ropes.some(o => held.has(o) && o.c === s.c && (o.r + SHAPES[o.shape].h === s.r || s.r + h === o.r));
        if (tied || solidAt(x, s.r * CELL - 6) || s.r + h >= groundRow(s.c) || solidAt(x, (s.r + h) * CELL + 6)) { held.add(s); changed = true; }
      }
    }
    for (const s of ropes) if (!held.has(s)) gone.push(s);
    for (const s of gone) {
      if (s.mat === 'door') { const m = specials.find(x => x.id === s.link); if (m && !gone.includes(m)) gone.push(m); }
    }
    if (!gone.length) return;
    specials = specials.filter(s => !gone.includes(s));
    for (const s of gone) {
      for (let i = 0; i < 6; i++) parts.push({ t: 'chip', x: (s.c + 0.5) * CELL, y: (s.r + 0.5) * CELL, vx: rand(-3, 3), vy: rand(-4, 0), rot: 0, vr: 0.2, s: 7,
        col: s.mat === 'door' ? (s.color === 'gold' ? '#e8b923' : '#d63030') : '#8a6a3a', life: 1, max: 1, grav: 0.3 });
    }
    for (const u of units) if (u.gm.hang) { const c = unitCell(u); if (!holdAt(u, c.c, c.r)) setHang(u, false); }
  }

  function startBattle() {
    newEngine();
    S.phase = 'battle';
    const items = [], occ = new Map();
    for (const side of ['blue', 'red']) for (const it of S.layouts[side].blocks) {
      items.push({ ...it, side });
      for (const [c, r] of itemCells(it)) occ.set(key(c, r), items[items.length - 1]);
    }
    const solidOrCloud = items.filter(solidItem);
    // arrows: the solid block right in front of an arrow's point becomes a moving platform
    const movers = new Map();
    for (const a of items) if (a.mat === 'arrow' || a.mat === 'varrow') {
      const t = a.mat === 'arrow' ? occ.get(key(a.c + a.dir, a.r)) : occ.get(key(a.c, a.r + a.dir));
      if (t && isSolid(t.mat) && !movers.has(t.id)) movers.set(t.id, { dir: a.dir, axis: a.mat === 'arrow' ? 'x' : 'y' });
    }
    // blocks standing on the ground (or on something that does) start asleep, so a castle stands perfectly still
    const grounded = new Set(items.filter(it => it.mat === 'cloud' || movers.has(it.id)));
    let changed = true;
    while (changed) {
      changed = false;
      for (const it of solidOrCloud) {
        if (grounded.has(it)) continue;
        const sh = SHAPES[it.shape], bottom = it.r + sh.h - 1;
        let ok = false;
        for (let dx = 0; dx < sh.w && !ok; dx++) if (bottom >= groundRow(it.c + dx) - 1) ok = true;
        for (let dx = 0; dx < sh.w && !ok; dx++) { const u = occ.get(key(it.c + dx, bottom + 1)); if (u && grounded.has(u) && solidItem(u)) ok = true; }
        if (ok) { grounded.add(it); changed = true; }
      }
    }
    // which blocks touch which (edge to edge), for the cloud anti-gravity
    const adj = new Map(solidOrCloud.map(it => [it.id, new Set()]));
    for (const it of solidOrCloud) for (const [c, r] of itemCells(it)) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = occ.get(key(c + dc, r + dr));
      if (n && n !== it && solidItem(n)) { adj.get(it.id).add(n.id); adj.get(n.id).add(it.id); }
    }
    const byId = new Map(solidOrCloud.map(it => [it.id, it]));
    const stuck = new Set(), q = [];
    for (const it of solidOrCloud) if (it.mat === 'cloud') q.push(it.id);
    while (q.length) for (const n of adj.get(q.pop())) {
      const it = byId.get(n);
      if (isSolid(it.mat) && !grounded.has(it) && !movers.has(it.id) && !stuck.has(n)) { stuck.add(n); q.push(n); }
    }
    for (const it of solidOrCloud) {
      const lv = LV[it.shape], x = (it.c + lv.cx) * CELL, y = (it.r + lv.cy) * CELL;
      const links = [...adj.get(it.id)];
      if (it.mat === 'cloud') { makeCloud(it.shape, x, y, it.id, links); continue; }
      const b = makeBlock(it.shape, it.mat, x, y, 0, it.id);
      b.gm.adj = links; setOwner(b, it.side);
      if (movers.has(it.id)) { b.gm.mover = movers.get(it.id).dir; b.gm.maxis = movers.get(it.id).axis; Body.setStatic(b, true); }
      else if (stuck.has(it.id)) { b.gm.stuck = true; Body.setStatic(b, true); }
      else if (grounded.has(it)) Sleeping.set(b, true);
    }
    if (MAPK === 'towers') for (const s of ['blue', 'red']) for (let c = PLATE[s][0]; c <= PLATE[s][1]; c++) {
      const b = makeBlock('s11', 'concrete', (c + 0.5) * CELL, (ROWS - 0.5) * CELL);
      Body.setStatic(b, true); setOwner(b, s);
    }
    specials = items.filter(it => it.mat === 'door' || it.mat === 'rope' || it.mat === 'arrow' || it.mat === 'varrow')
      .map(it => ({ id: it.id, mat: it.mat, shape: it.shape, c: it.c, r: it.r, color: it.color, link: it.link, dir: it.dir, side: it.side }));
    for (const side of ['blue', 'red'])
      for (const u of S.layouts[side].units) {
        const b = makeUnit(side, u.kind, (u.c + 0.5) * CELL, (u.r + 0.5) * CELL, u.id, null, 0, u.up, u.ab);
        if (holdAt(b, u.c, u.r) && !cellSupported(u.c, u.r, true)) setHang(b, true);
        if (u.ab && ABILITIES[u.ab]) setTimeout(() => toast(`${TEAM[side].name}'s Unidentified Freddy got ${ABILITIES[u.ab].name}!`), side === 'blue' ? 600 : 3600);
      }
    S.final = null;
    lockCamera();
    beginTurn('blue', true);
    showOverlay('battle');
  }

  // ------------------------------------------------------------------ damage
  function damageBlock(b, dmg) {
    const g = b.gm;
    if (g.dead || dmg <= 0) return;
    g.hp -= dmg;
    if (g.hp <= 0) destroyBlock(b);
  }
  function destroyBlock(b) {
    const g = b.gm;
    if (g.dead) return;
    removeBody(b);
    if (g.mat === 'concrete') towerGround();
    if (S.shotLog) S.shotLog.blocks++;
    Sfx.play(MAT[g.mat].snd);
    const n = Math.min(14, 4 + Math.round(area(g.shape) * 2));
    for (let i = 0; i < n; i++) {
      parts.push({ t: 'chip', x: b.position.x + rand(-15, 15), y: b.position.y + rand(-15, 15), vx: rand(-4, 4) + b.velocity.x * 0.3,
        vy: rand(-6, 1), rot: rand(0, 6), vr: rand(-0.3, 0.3), s: rand(4, 10), col: pick(chipCols(g.mat, g.side)), life: rand(0.6, 1.3), max: 1.3, grav: 0.3 });
    }
    parts.push({ t: 'smoke', x: b.position.x, y: b.position.y, vx: 0, vy: -0.3, s: CELL * 0.6, life: 0.7, max: 0.7, col: '200,200,200' });
    wakeAround(b.bounds);
    S.recheck = true;
  }
  function damageUnit(u, dmg, cause) {
    const g = u.gm;
    if (g.dead || dmg <= 0) return;
    if (kd(u).onlyCrush && cause !== 'crush') { shrug(u); return; }     // Dread Bear: only a falling block hurts him
    g.hp -= dmg;
    if (S.shotLog) S.shotLog.hits++;
    parts.push({ t: 'text', x: u.position.x, y: u.position.y - CELL * 0.6, vx: 0, vy: -1, life: 1, max: 1, txt: '-' + dmg, col: '#ff5050' });
    if (g.hp <= 0) killUnit(u, cause);
    else Sfx.play('thud');
  }
  // Dread Bear shrugging off a hit
  function shrug(u) {
    parts.push({ t: 'text', x: u.position.x, y: u.position.y - CELL * 0.6, vx: 0, vy: -1, life: 0.8, max: 0.8, txt: 'NO EFFECT', col: '#c8c8c8' });
    Sfx.play('stone');
  }
  function killUnit(u) {
    const g = u.gm;
    if (g.dead) return;
    const k = kd(u);
    g.hp = 0; removeBody(u);
    if (S.lastMode === 'cannon' && (S.act === 'fly' || S.act === 'settle') && g.side !== S.turn) killFx(skinOf(S.turn, 'cannon'), u.position.x, u.position.y);
    if (isSoldier(g.kind)) S.graves[g.side].push({ kind: g.kind });        // Funtime Freddy can bring them back
    if (k.boomDeath && zoneOf(unitCell(u).c) === other(g.side)) {          // Funtime Freddy blows up in enemy land
      blastAt(u.position.x, u.position.y, g.side);
      toast(`${k.name} exploded in ${TEAM[other(g.side)].name}'s land!`);
    }
    if (S.shotLog) S.shotLog.kills++;
    Sfx.play('death');
    parts.push({ t: 'head', kind: vk(g), side: g.side, x: u.position.x, y: u.position.y, vx: rand(-3, 3), vy: -7, rot: u.angle, vr: rand(-0.3, 0.3), life: 1.4, max: 1.4, grav: 0.35 });
    for (let i = 0; i < 10; i++) parts.push({ t: 'spark', x: u.position.x, y: u.position.y, vx: rand(-5, 5), vy: rand(-6, 2), life: rand(0.3, 0.7), max: 0.7, col: '#ffd24a', grav: 0.2 });
    wakeAround(u.bounds);
    if (k.rally && !rallied(g.side)) toast(`${TEAM[g.side].name}'s Glamrock Endo is down - his army can't fight invaders any more`);
    if (g.kind === 'king') {
      S.flee[g.side]++;
      toast(`${TEAM[g.side].name}'s King Freddy is down! An Endo will flee in fear...`);
    }
  }
  function fleeOne(side, id = null) {
    const pool = aliveUnits(side, 'endo').length ? aliveUnits(side, 'endo') : units.filter(u => !u.gm.dead && u.gm.side === side && isSoldier(u.gm.kind));
    const u = id != null ? units.find(x => x.gm.id === id) : pick(pool);
    if (!u || u.gm.dead) return null;
    u.gm.hp = 0; removeBody(u);
    Sfx.play('flee');
    parts.push({ t: 'flee', kind: vk(u.gm), side, x: u.position.x, y: u.position.y, dir: side === 'blue' ? -1 : 1, life: 2.2, max: 2.2 });
    return u.gm.id;
  }

  const relSpeed = (A, B, n) => Math.abs((A.velocity.x - B.velocity.x) * n.x + (A.velocity.y - B.velocity.y) * n.y);
  function contact(p) {
    const A = p.bodyA.parent || p.bodyA, B = p.bodyB.parent || p.bodyB;
    const ga = A.gm, gb = B.gm;
    if ((ga && ga.dead) || (gb && gb.dead)) { p.isActive = false; return; }
    if (ga && ga.type === 'ball') return ballHit(A, B, p);
    if (gb && gb.type === 'ball') return ballHit(B, A, p);
    const n = p.collision.normal, rel = relSpeed(A, B, n);
    if (ga && gb) {                          // a block dropping onto a unit's head
      if (ga.type === 'unit' && gb.type === 'block') blockOnUnit(B, A);
      else if (gb.type === 'unit' && ga.type === 'block') blockOnUnit(A, B);
    }
    // a hard knock from a moving block shakes a cloud-hung block loose
    if (rel > 4) for (const [X, Y] of [[A, B], [B, A]]) if (X.gm && X.gm.stuck && Y.gm && Y.gm.type === 'block' && !Y.isStatic) unstick(X);
    if (rel > 5) {                           // hard knocks crack blocks (the ground counts too)
      for (const [X, Y] of [[A, B], [B, A]]) {
        if (!X.gm || X.gm.type !== 'block') continue;
        const heavy = Y.gm && Y.gm.type === 'block' ? clamp(Y.mass / X.mass, 0.3, 2) : 1;
        damageBlock(X, (rel - 5) * 0.55 * (isFinite(heavy) ? heavy : 1));
      }
      if (rel > 7) Sfx.play('thud');
    }
  }
  function blockOnUnit(blk, u) {
    const dmg = MAT[blk.gm.mat].fall;
    if (!dmg || u.gm.crushCD > 0 || kd(u).noCrush) return;              // Festive BB can't be crushed
    if (blk.position.y > u.position.y - CELL * 0.25) return;           // must come from above
    if (blk.velocity.y - u.velocity.y < 2) return;                       // and actually be falling
    u.gm.crushCD = 0.5;
    // out in the battlefield an ENEMY's block never crushes a unit: it shoves it out of the way instead
    if (inField(u) && blk.gm.side && blk.gm.side !== u.gm.side) { nudgeUnit(u); return; }
    damageUnit(u, dmg, 'crush');
  }
  // move a unit to the nearest free square (standing on something if possible)
  function nudgeUnit(u) {
    if (u.isStatic) return;
    const { c, r } = unitCell(u);
    let best = null;
    for (let d = 1; d <= 4 && !best; d++) {
      let loose = null;
      for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== d || best) continue;
        const nc = c + dc, nr = r + dr;
        if (nr >= ROWS || !cellFree(nc, nr, u)) continue;
        if (cellSupported(nc, nr, false, u)) best = { c: nc, r: nr }; else if (!loose) loose = { c: nc, r: nr };
      }
      if (!best && loose) best = loose;
    }
    if (!best) return;
    poof(u.position.x, u.position.y);
    Body.setPosition(u, { x: (best.c + 0.5) * CELL, y: (best.r + 0.5) * CELL - 1 });
    Body.setVelocity(u, { x: 0, y: 0 }); Body.setAngularVelocity(u, 0);
    Sleeping.set(u, false);
    u.gm.hop = 0.25;
  }
  function ballHit(ball, o, p) {
    const g = ball.gm, og = o.gm;
    const sp = ball.speed;
    if (!g.hit) { g.hit = { x: ball.position.x, y: ball.position.y }; if (g.cpu) cpuLearn(g.hit); }
    if (g.pw && !g.pwDone && zoneOf(Math.floor(ball.position.x / CELL)) === other(g.side)) firePower(ball);
    if (g.shot) { shotHit(ball, o, p); return; }
    if (g.tb && kdOf(g.tb.kind, g.tb.up, g.tb.ab).boom && og && (og.type === 'block' || og.type === 'unit') && og.side !== g.side) { p.isActive = false; electroBlast(ball); return; }
    if (!g.live || sp < 2) { g.live = false; return; }
    if (!og) {                                        // ground, platform or the edge of the map
      g.power *= 0.5;
      if (sp < 7) g.live = false;
      Sfx.play('thud');
      return;
    }
    if (og.type === 'ball') return;
    if (og.type === 'unit') {                         // a direct hit
      if (g.cannon && inField(o)) return;               // the cannon can't hurt anyone out in the battlefield
      if (kd(o).onlyCrush) { shrug(o); if (g.theme === 'frost') freeze(o); g.live = false; return; }   // Dread Bear: it just bounces off
      damageUnit(o, BALL_DMG, 'cannon');
      if (g.theme === 'frost' && !o.gm.dead) freeze(o);   // the Frost cannon freezes whoever survives a hit
      p.isActive = false;
      Body.setVelocity(ball, { x: ball.velocity.x * 0.85, y: ball.velocity.y * 0.85 });
      return;
    }
    if (og.type !== 'block') return;
    const m = MAT[og.mat];
    // the Torch finds glass as tough as wood; the Shadow Phantom Boom finds stone as weak as wood
    const mm = (g.theme === 'torch' && og.mat === 'glass') || (g.theme === 'phantom' && og.mat === 'stone') ? MAT.wood : m;
    if (g.theme === 'torch' && og.mat === 'wood') {                            // the Torch sets wood alight, like a fireball
      ignite(o);                                                              // (and the wood touching it, in case it smashes this one)
      for (const n of blocks) if (n !== o && !n.gm.dead && n.gm.mat === 'wood' && Math.hypot(n.position.x - o.position.x, n.position.y - o.position.y) < CELL * 2.2) ignite(n);
    }
    const cost = mm.pierce * Math.sqrt(area(og.shape));
    if (g.power >= cost) {                            // smash straight through
      g.power -= cost;
      destroyBlock(o);
      p.isActive = false;
      Body.setVelocity(ball, { x: ball.velocity.x * mm.slow, y: ball.velocity.y * mm.slow });
    } else {                                          // not enough punch left: dent it and bounce
      damageBlock(o, g.power * 1.4 + sp * 0.15);
      if (og.stuck) unstick(o);
      g.power = 0;
      if (sp < 5) g.live = false;
      Sfx.play(m.snd);
    }
  }

  // ------------------------------------------------------------------ turns
  function beginTurn(side, first = false) {
    S.turn = side; S.turnNo++; S.flyView = null; S.retried = false; S.flyDice = false; S.bonus = null; S.ammo = 'ball'; S.refund = null; S.magic = 0;
    S.hot = S.cool[side] > 0;                          // an overheated cannon sits this turn out
    if (S.hot) S.cool[side]--;
    S.act = S.final === side ? 'aim' : 'choose';
    S.lastMode = S.act === 'aim' ? 'cannon' : null;
    S.rolls = 0; S.pts = 0; S.die = 0; S.sel = null; S.aimVec = null; S.rolling = 0; S.throwBy = null;
    S.fled = [];
    if (S.final === side) bigText(`${TEAM[side].name}: FINAL SHOT!`, TEAM[side].col);
    else if (!first) bigText(`${TEAM[side].name}'S TURN`, TEAM[side].col);
    if (!first) Sfx.play('turn');
    refocus(first);
    if (S.cpu === side) { const n = S.turnNo; setTimeout(() => { if (S && S.turnNo === n && running) cpuTurn(); }, 1400); }
  }
  // every battle action goes through here, so the other phone can replay exactly the same thing
  function doAct(a, fromNet = false) {
    if (!S || S.phase !== 'battle') return;
    if (!fromNet && S.mode === 'online') Net.send({ type: 'act', a });
    switch (a.t) {
      case 'mode':
        S.lastMode = a.v;
        if (a.v === 'cannon') S.act = 'aim';
        else { S.act = 'dice'; S.rolls = ROLLS; S.pts = 0; S.die = 0; S.dtool = 'move'; S.sel = null; S.heat[S.turn] = 0; }
        break;
      case 'back': S.act = 'choose'; S.aimVec = null; S.lastMode = null; break;
      case 'shot': fire(a.vx, a.vy, a.tb, a.power); break;
      case 'ammo': S.ammo = a.v; break;
      // an enemy Dust Mangle in your land cuts every roll in half (rounded up)
      case 'roll': S.rolling = 0.7; S.rollTo = dusted(S.turn) ? Math.ceil(a.v / 2) : a.v; S.rolls--; S.bonus = null; Sfx.play('dice'); break;
      case 'break': { const u = units.find(x => x.gm.id === a.id), b = blocks.find(x => x.gm.id === a.bid); if (u && b) breakBlock(u, b); break; }
      case 'move': { const u = units.find(x => x.gm.id === a.id); if (u) moveUnit(u, a.c, a.r); break; }
      case 'place': repair(a.mat, a.c, a.r); break;
      case 'unbuild': unbuild(blocks.find(x => x.gm.id === a.bid)); break;
      case 'hitcannon': hitCannon(units.find(x => x.gm.id === a.id)); break;
      case 'endroll': S.pts = 0; S.bonus = null; afterPoints(); break;
      case 'endturn': S.pts = 0; S.rolls = 0; S.bonus = null; afterPoints(); break;
      case 'mask': {
        const u = units.find(x => x.gm.id === a.id);
        if (!u || !(KINDS[a.kind].kingUp ? u.gm.kind === 'king' : maskable(u.gm.kind))) break;
        if (KINDS[a.kind].kingUp) { u.gm.up = a.kind; u.gm.ab = a.ab || null; } else u.gm.kind = a.kind;
        u.gm.mhp = u.gm.hp = kd(u).hp;
        poof(u.position.x, u.position.y);
        if (u.gm.ab && ABILITIES[u.gm.ab]) toast(`Unidentified Freddy got ${ABILITIES[u.gm.ab].name}!`);
        break;
      }
      // Funtime Freddy (at full health) brings a dead comrade back next to him instead of firing; the dice are still rolled
      case 'revive': {
        const k = aliveUnits(S.turn).find(u => kd(u).revive), gr = S.graves[S.turn][a.i];
        if (!k || !gr || k.gm.hp < k.gm.mhp || S.act !== 'choose' || !cellFree(a.c, a.r, null)) break;
        S.graves[S.turn].splice(a.i, 1);
        const nu = makeUnit(S.turn, gr.kind, (a.c + 0.5) * CELL, (a.r + 0.5) * CELL - 1);
        poof(nu.position.x, nu.position.y);
        toast(`${kd(k).name} brought ${KINDS[gr.kind].name} back to life!`);
        S.lastMode = 'dice'; S.act = 'dice'; S.rolls = ROLLS; S.pts = 0; S.die = 0; S.dtool = 'move'; S.sel = null; S.heat[S.turn] = 0;
        break;
      }
      // Dread Bear, once a match: one of his comrades gets 3 hearts
      case 'bless': {
        const d = units.find(x => x.gm.id === a.id && !x.gm.dead), t = units.find(x => x.gm.id === a.to && !x.gm.dead);
        if (!d || !t || !kd(d).bless || d.gm.blessed || t.gm.side !== d.gm.side || t === d) break;
        d.gm.blessed = true; t.gm.mhp = Math.max(3, t.gm.mhp); t.gm.hp = 3;
        poof(t.position.x, t.position.y);
        parts.push({ t: 'text', x: t.position.x, y: t.position.y - CELL * 0.7, vx: 0, vy: -1, life: 1.2, max: 1.2, txt: '3 HEARTS', col: '#ff5a7a' });
        break;
      }
      // an ability spends a roll: the points of the roll in hand, or one of the rolls still to come
      case 'throwmode': {
        const tu = units.find(x => x.gm.id === a.id);
        if (tu && isFrozen(tu)) { toast(`${kd(tu).name} is frozen!`); break; }
        S.refund = { pts: S.pts, rolls: S.rolls, bonus: S.bonus };
        if (S.pts > 0) S.pts = 0; else S.rolls--;
        S.bonus = null; S.act = 'throw'; S.throwBy = a.id; S.throwKind = a.kind || 'cupcake'; S.aimVec = null; break;
      }
      case 'throwcancel':
        if (S.refund) { S.pts = S.refund.pts; S.rolls = S.refund.rolls; S.bonus = S.refund.bonus; }
        S.refund = null; S.act = 'dice'; S.throwBy = null; break;
      case 'throw':
        S.refund = null;
        if (a.kind === 'self' || a.kind === 'dj') launchUnit(a.id, a.vx, a.vy);
        else if (SHOTS[a.kind]) shootShot(a.id, a.kind, a.vx, a.vy);
        else throwCupcake(a.id, a.vx, a.vy);
        break;
      case 'flip': { const s = specials.find(x => x.id === a.id); if (s) { s.dir = -s.dir; Sfx.play('click'); } break; }
      case 'tele': {                                   // Pitch Black Ennard: spends a roll like the other abilities
        const u = units.find(x => x.gm.id === a.id && !x.gm.dead);
        if (!u || isFrozen(u) || S.rolling || !(S.pts > 0 || S.rolls > 0) || !teleCells(u).some(t => t.c === a.c && t.r === a.r)) break;
        if (S.pts > 0) S.pts = 0; else S.rolls--;
        S.bonus = null;
        teleport(u, a.c, a.r);
        break;
      }
    }
    refocus();
  }
  function afterPoints() {
    if (S.act !== 'dice') return;
    if (!soldiers('blue') || !soldiers('red') || S.flee.blue || S.flee.red) { S.pts = 0; S.rolls = 0; }
    if (S.pts <= 0 && S.rolls <= 0 && !S.rolling && !hasBonus()) { S.act = 'settle'; S.quiet = 0; S.settleT = 0; S.sel = null; }
  }
  function poof(x, y) {
    Sfx.play('magic');
    for (let i = 0; i < 16; i++) parts.push({ t: 'smoke', x: x + rand(-15, 15), y: y + rand(-15, 15), vx: rand(-1.5, 1.5), vy: rand(-2, 0.5), s: rand(8, 16), life: 0.7, max: 0.7, col: '230,220,255' });
  }

  const muzzle = (side, ang) => ({ x: CANNON[side].x + Math.cos(ang) * CELL * 1.5, y: CANNON[side].y + Math.sin(ang) * CELL * 1.5 });
  function fire(vx, vy, tbId = null, power = false) {
    const side = S.turn, ang = Math.atan2(vy, vx);
    // (a miss's one more try doesn't heat the cannon up again)
    if (!S.retried && ++S.heat[side] >= 3) { S.heat[side] = 0; S.cool[side] = 2; toast(`${TEAM[side].name}'s cannon OVERHEATED - it cools down for 2 turns`); }
    S.aimAng[side] = ang;
    const m = muzzle(side, ang);
    let tb = null;                                   // a launchable fighter climbs into the cannon and becomes the ball
    const tbu = tbId != null && units.find(x => x.gm.id === tbId && !x.gm.dead);
    if (tbu) { tb = tbOf(tbu); poof(tbu.position.x, tbu.position.y); removeBody(tbu); }
    const pw = !tb && power && powerOf(side);        // the side's cannonball power, once a match
    if (pw) { S.powerUsed[side] = true; S.ammo = 'ball'; }
    makeBall(m.x, m.y, vx, vy, side, { tb, cpu: S.cpu === side, pw: pw || null, theme: tb ? null : skinOf(side, 'cannon'), cannon: true });
    S.act = 'fly'; S.quiet = 0; S.settleT = 0; S.aimVec = null;
    S.shotLog = { blocks: 0, hits: 0, kills: 0 };
    S.flyView = 'ball';
    cam.shake = 6;
    Sfx.play('boom');
    for (let i = 0; i < 12; i++) parts.push({ t: 'smoke', x: m.x, y: m.y, vx: Math.cos(ang) * rand(1, 4) + rand(-1, 1), vy: Math.sin(ang) * rand(1, 4) + rand(-1, 1), s: rand(10, 24), life: rand(0.5, 1), max: 1, col: '220,220,220' });
    parts.push({ t: 'flash', x: m.x, y: m.y, s: CELL * 1.2, life: 0.12, max: 0.12 });
  }
  // cannonballs, launched fighters (gm.tb) and fireballs (gm.fire) are all "balls"; they never hit their own side
  function makeBall(x, y, vx, vy, side, extra = {}) {
    const r = extra.shot === 'blue' ? 0.34 : extra.shot ? 0.28 : extra.tb ? 0.42 : 0.35;
    const b = Bodies.circle(x, y, CELL * r, { density: 0.012, frictionAir: 0, restitution: 0.3, friction: 0.5, label: 'ball', isSensor: extra.shot === 'cookie' || extra.shot === 'festive',
      collisionFilter: { category: 0x0001, mask: 0xFFFFFFFF ^ CAT.cloud ^ CAT[side] } });
    b.gm = { type: 'ball', power: extra.shot ? 0 : 10, live: true, still: 0, age: 0, side, tb: null, cpu: false, ...extra };
    if (extra.shot === 'cookie') b.gm.v = { x: vx, y: vy };
    Composite.add(engine.world, b);
    Body.setVelocity(b, { x: vx, y: vy });
    balls.push(b);
    return b;
  }
  // a ball has stopped (or left the map): a launched fighter gets up where he landed
  function landBall(b) {
    const g = b.gm;
    if (g.dead) return;
    removeBody(b);
    if (g.shot) { puff(b.position.x, b.position.y, g.shot === 'ooze' ? '255,110,210' : g.shot === 'rad' ? '120,255,80' : g.shot === 'festive' ? '140,255,160' : g.shot === 'blue' ? '90,150,255' : '120,120,120', 6); return; }
    if (g.pw && !g.pwDone && zoneOf(Math.floor(clamp(b.position.x, 0, W - 1) / CELL)) === other(g.side) && b.position.y < H + CELL) firePower(b);
    if (g.theme && b.position.x > WORLD_X0 && b.position.x < WORLD_X1 && b.position.y < H + CELL) ballStopped(b);
    if (!g.tb) return;
    if (b.position.x < WORLD_X0 || b.position.x > WORLD_X1 || b.position.y > H + CELL) {
      toast(`${kdOf(g.tb.kind, g.tb.up, g.tb.ab).name} flew off the map!`);
      if (g.tb.kind === 'king') S.flee[g.side]++;      // a King lost off the map counts as a fallen King
      return;
    }
    // past the map's edge (by the cannons) he tumbles back onto the last square
    const lx = clamp(b.position.x, CELL * 0.5, W - CELL * 0.5), ly = lx === b.position.x ? b.position.y - 4 : Math.min(b.position.y, (groundRow(Math.floor(lx / CELL)) - 1) * CELL);
    const u = makeUnit(g.side, g.tb.kind, lx, ly, g.tb.id, g.tb.hp, 0, g.tb.up, g.tb.ab, g.tb.mhp);
    u.gm.spent = !!g.tb.spent;
    if (kd(u).dust && zoneOf(Math.floor(lx / CELL)) === other(g.side)) dustBurst(other(g.side));
    Body.setVelocity(u, { x: b.velocity.x * 0.3, y: 0 });
    poof(b.position.x, b.position.y);
  }
  const inField = u => zoneOf(unitCell(u).c) === 'field';
  // a cannonball from a themed cannon has come to rest
  function ballStopped(b) {
    const g = b.gm, x = b.position.x, y = b.position.y, R = CELL * 0.35;
    if (g.theme === 'samurai') {                     // the Red Samurai Cannon: the block it's touching vanishes
      for (let i = 0; i < 16; i++) {
        const a = Math.PI / 2 + i * Math.PI / 8, o = solidAt(x + Math.cos(a) * (R + 10), y + Math.sin(a) * (R + 10));
        if (o && o.gm && o.gm.type === 'block' && !o.gm.dead && o.gm.side !== g.side) {
          destroyBlock(o);
          for (let k = 0; k < 14; k++) parts.push({ t: 'spark', x: o.position.x, y: o.position.y, vx: rand(-5, 5), vy: rand(-5, 2), life: 0.6, max: 0.6, col: pick(['#d61f2c', '#ff5050', '#ffd24a']), grav: 0.1 });
          break;
        }
      }
    } else if (g.theme === 'storm') {                // the Blue Storm Destroyer: an enemy it's touching is struck down
      for (const u of units.slice()) {
        if (u.gm.dead || u.gm.side === g.side || u.gm.dig || inField(u)) continue;
        if (Math.hypot(u.position.x - x, u.position.y - y) < R + CELL * 0.47 + 6) { if (kd(u).onlyCrush) shrug(u); else killUnit(u); }
      }
    }
  }
  // the Frost cannon: frozen in an ice cube, the unit can't do anything on its side's next turn
  const isFrozen = u => !!(u.gm.frozenUntil && S.turnNo < u.gm.frozenUntil);
  function freeze(u) {
    u.gm.frozenUntil = S.turnNo + 2;
    Sfx.play('glass');
    for (let i = 0; i < 12; i++) parts.push({ t: 'spark', x: u.position.x + rand(-15, 15), y: u.position.y + rand(-15, 15), vx: rand(-2, 2), vy: rand(-3, 1), life: 0.6, max: 0.6, col: pick(['#dff5ff', '#8fdcff', '#ffffff']), grav: 0.05 });
    toast(`${kd(u).name} is frozen solid for a turn!`);
  }

  // ---- cannon kill effects: an enemy that dies during a side's cannon shot gets that cannon's little show,
  // right where it died. The turn (and the camera) waits until it's over.
  const TRAIL = { gold: '255,220,80', rose: '255,150,200', jungle: '90,160,60', scale: '150,230,60', bone: '235,230,220', frost: '200,240,255',
    torch: '255,140,40', storm: '120,160,255', phantom: '170,90,255', samurai: '220,50,50' };
  const KILL_FX = { gold: 'confetti', rose: 'flowers', jungle: 'weeds', scale: 'spikes', bone: 'skull', frost: 'icicle', torch: 'flames', storm: 'bolt', phantom: 'souls' };
  function surfaceBelow(x, y) { for (let yy = y; yy < H; yy += 4) { const o = solidAt(x, yy); if (o && o.gm && o.gm.type !== 'unit') return yy; } return Math.min(H, groundRow(Math.floor(x / CELL)) * CELL); }
  function killFx(theme, x, y) {
    const fx = KILL_FX[theme];
    if (!fx) return;
    const gy = surfaceBelow(x, y + CELL * 0.3);
    if (fx === 'confetti') {
      for (let i = 0; i < 46; i++) parts.push({ t: 'confetti', kfx: true, x, y, vx: rand(-6, 6), vy: rand(-11, -3), grav: 0.28, rot: rand(0, 6), vr: rand(-0.4, 0.4), s: rand(5, 9),
        col: pick(['#ffd23a', '#ffe98a', '#e8b923', '#fff6d0', '#c8961a']), life: rand(1.3, 1.9), max: 1.9 });
      Sfx.play('win');
    } else if (fx === 'flowers') {
      for (let i = 0; i < 14; i++) parts.push({ t: 'flower', kfx: true, x, y, vx: rand(-5, 5), vy: rand(-9, -3), grav: 0.22, rot: rand(0, 6), vr: rand(-0.2, 0.2), s: rand(6, 10),
        col: pick(['#ff8fb8', '#ffb0d0', '#ff5a9a', '#ffd0e0']), life: rand(1.4, 1.9), max: 1.9 });
      Sfx.play('magic');
    } else {
      const dur = { weeds: 1.8, spikes: 1.4, skull: 2.0, icicle: 1.6, flames: 2.0, bolt: 1.0, souls: 2.0 }[fx];
      const bits = Array.from({ length: 7 }, () => Math.random());
      const p = { t: 'kfx', kfx: true, fx, x, y, gy, bits, life: dur, max: dur };
      if (fx === 'bolt') {                            // a jagged path down from the sky, fixed when it strikes
        p.path = []; let px = x + rand(-60, 60);
        for (let yy = gy - 620; yy < gy; yy += 40) { p.path.push([px, yy]); px += rand(-26, 26); px += (x - px) * 0.25; }
        p.path.push([x, gy]);
        cam.shake = Math.max(cam.shake, 12); Sfx.play('blast');
        parts.push({ t: 'flash', x, y: gy - 10, s: CELL * 1.6, life: 0.2, max: 0.2 });
      }
      if (fx === 'icicle') Sfx.play('glass');
      if (fx === 'flames') Sfx.play('fire');
      if (fx === 'spikes' || fx === 'weeds') Sfx.play('stone');
      parts.push(p);
    }
  }
  // what a unit turns into while it flies as a ball (and back again when it lands)
  // (a Bidybab can only ever be launched once: she and her clone land 'spent')
  const tbOf = u => ({ id: u.gm.id, hp: u.gm.hp, kind: u.gm.kind, up: u.gm.up, ab: u.gm.ab, mhp: u.gm.mhp, spent: !!(u.gm.spent || kd(u).split) });
  const canLaunch = u => !!kd(u).ammo && !u.gm.spent;
  // Dust Mangle landed in enemy land: a green dust cloud over every enemy
  function dustBurst(side) {
    Sfx.play('magic');
    toast(`Dust Mangle covered ${TEAM[side].name} in dust - their dice rolls are cut in half!`);
    for (const u of aliveUnits(side)) for (let i = 0; i < 8; i++)
      parts.push({ t: 'smoke', x: u.position.x + rand(-14, 14), y: u.position.y + rand(-14, 14), vx: rand(-0.8, 0.8), vy: rand(-1.2, 0.2), s: rand(8, 15), life: 1.2, max: 1.2, col: '110,190,90' });
  }
  // a side is dusted while an enemy Dust Mangle stands in its land
  const dusted = side => units.some(u => !u.gm.dead && u.gm.side !== side && kd(u).dust && zoneOf(unitCell(u).c) === side);
  const puff = (x, y, col, n) => { for (let i = 0; i < n; i++) parts.push({ t: 'smoke', x: x + rand(-8, 8), y: y + rand(-8, 8), vx: rand(-1, 1), vy: rand(-1.5, 0), s: rand(6, 12), life: 0.6, max: 0.6, col }); };
  // a launchable fighter (Toy Bonnie, Bidybab, Electrobab) throws HIMSELF from where he stands,
  // and DJ Music Man throws a comrade who is touching him (both fly like a cannonball and get up where they land)
  function launchUnit(id, vx, vy) {
    const u = units.find(x => x.gm.id === id && !x.gm.dead);
    S.act = 'dice'; S.throwBy = null;
    if (!u) { afterPoints(); return; }
    const x = u.position.x, y = u.position.y;
    poof(x, y); removeBody(u);
    if (S.throwKind === 'dj') for (let i = 0; i < 10; i++) parts.push({ t: 'text', x: x + rand(-20, 20), y: y - rand(10, 40), vx: rand(-1.5, 1.5), vy: rand(-2, -1), life: 0.9, max: 0.9, txt: pick(['♪', '♫']), col: pick(['#ff4ad8', '#4a8cff', '#ffe04a']) });
    makeBall(x, y - 4, vx, vy, u.gm.side, { tb: tbOf(u) });
    S.flyView = 'ball'; S.flyDice = true;
    Sfx.play('boom');
    afterPoints();
  }
  // a fighter's shot: Burnt Foxy's fireball, Missing Mangle's ooze, Cookie Bonnie's cookie, Radioactive Foxy's goo
  function shootShot(id, shot, vx, vy) {
    const u = units.find(x => x.gm.id === id && !x.gm.dead);
    S.act = 'dice'; S.throwBy = null;
    if (!u) { afterPoints(); return; }
    if (SHOTS[shot].magic) S.magic++;
    // a cookie leaves at body height so it skims along the ground; the rest are thrown from above the head
    makeBall(u.position.x, u.position.y - (shot === 'cookie' ? 0 : CELL * 1.05), vx, vy, u.gm.side, { shot, fire: shot === 'fire', bounces: 0, pierce: BLUE_PIERCE });
    S.flyView = 'ball'; S.flyDice = true;
    Sfx.play(shot === 'fire' ? 'fire' : shot === 'cookie' ? 'step' : 'magic');
    afterPoints();
  }
  // wood set alight burns down over a few seconds and spreads to wood it touches
  function ignite(b) {
    if (!b || b.gm.dead || b.gm.mat !== 'wood') return;
    if (!b.gm.burn) Sfx.play('fire');
    b.gm.burn = Math.max(b.gm.burn || 0, 5);
    if (!b.isStatic) Sleeping.set(b, false);
  }
  function shotHit(ball, o, p) {
    const g = ball.gm, og = o.gm;
    if (g.shot === 'cookie') {                        // a cookie flies straight: through units (1 damage each) and glass, stopped by wood and stone
      p.isActive = false;
      if (og && og.type === 'unit') { damageUnit(o, 1, 'cookie'); return; }
      if (og && og.type === 'block' && og.mat === 'glass') return;
      if (og && (og.type === 'cloud' || og.type === 'ball')) return;
      for (let i = 0; i < 8; i++) parts.push({ t: 'chip', x: ball.position.x, y: ball.position.y, vx: rand(-3, 3), vy: rand(-4, 0), rot: 0, vr: 0.2, s: 5, col: pick(['#c68a4a', '#5a3218']), life: 0.7, max: 0.7, grav: 0.3 });
      landBall(ball);
      return;
    }
    if (g.shot === 'blue') { blueHit(ball, o, p); return; }
    if (og && og.type === 'block' && og.mat === 'glass' && g.bounces < 4) {     // magic: glass bounces it back
      const n = p.collision.normal, v = ball.velocity, d = v.x * n.x + v.y * n.y;
      Body.setVelocity(ball, { x: (v.x - 2 * d * n.x) * 0.9, y: (v.y - 2 * d * n.y) * 0.9 });
      g.bounces++; p.isActive = false;
      Sfx.play('magic');
      for (let i = 0; i < 6; i++) parts.push({ t: 'spark', x: ball.position.x, y: ball.position.y, vx: rand(-3, 3), vy: rand(-3, 3), life: 0.4, max: 0.4, col: '#ffb040', grav: 0 });
      return;
    }
    if (g.shot === 'festive') { festiveHit(ball, o); return; }
    const x = ball.position.x, y = ball.position.y, foe = other(g.side);
    if (g.shot === 'fire') {
      if (og && og.type === 'unit') damageUnit(o, 1, 'fire');
      if (og && og.type === 'block') ignite(o);
    } else if (g.shot === 'ooze') {                   // every enemy block in the splash turns to pink plastic
      for (const b of blocks) if (!b.gm.dead && b.gm.side === foe && Math.hypot(b.position.x - x, b.position.y - y) < CELL * 3.2) toPlastic(b);
      Sfx.play('magic');
    } else if (g.shot === 'rad') {                    // every enemy block in the splash melts away
      for (const b of blocks.slice()) if (!b.gm.dead && b.gm.side === foe && Math.hypot(b.position.x - x, b.position.y - y) < CELL * 3.0) destroyBlock(b);
    }
    p.isActive = false;
    const cols = g.shot === 'ooze' ? ['#ff6ecf', '#ffb0e8'] : g.shot === 'rad' ? ['#8cff3a', '#d8ff6a'] : ['#ffd23a', '#ff6a00'];
    for (let i = 0; i < (g.shot === 'fire' ? 10 : 24); i++) parts.push({ t: 'spark', x, y, vx: rand(-4, 4), vy: rand(-5, 1), life: 0.6, max: 0.6, col: pick(cols), grav: 0.15 });
    landBall(ball);
  }
  // Black Light Freddy's blue cannonball: smashes straight through stone and glass (pink plastic too), hurts units,
  // but can't break wood at all - wood stops it dead
  function blueHit(ball, o, p) {
    const g = ball.gm, og = o.gm, x = ball.position.x, y = ball.position.y;
    const sparks = n => { for (let i = 0; i < n; i++) parts.push({ t: 'spark', x, y, vx: rand(-4, 4), vy: rand(-5, 1), life: 0.5, max: 0.5, col: pick(['#4a8cff', '#bfe0ff', '#1e5bff']), grav: 0.15 }); };
    if (og && (og.type === 'cloud' || og.type === 'ball')) return;
    if (og && og.type === 'block' && og.mat !== 'wood' && g.pierce > 0) {
      g.pierce--; destroyBlock(o); p.isActive = false;
      Body.setVelocity(ball, { x: ball.velocity.x * 0.9, y: ball.velocity.y * 0.9 });
      sparks(6); return;
    }
    if (og && og.type === 'unit') {
      damageUnit(o, 1, 'blue'); p.isActive = false;
      Body.setVelocity(ball, { x: ball.velocity.x * 0.85, y: ball.velocity.y * 0.85 });
      sparks(6); return;
    }
    if (og && og.type === 'block') Sfx.play('wood');
    p.isActive = false; sparks(12);
    landBall(ball);
  }
  // Festive Mangle's magic (a sensor, so it can pass through things): straight through wood and pink plastic,
  // shoves stone over as if it were foam, kills any enemy it touches (and keeps going); glass bounced it already
  function festiveHit(ball, o) {
    const og = o.gm, x = ball.position.x, y = ball.position.y;
    const sparks = n => { for (let i = 0; i < n; i++) parts.push({ t: 'spark', x, y, vx: rand(-4, 4), vy: rand(-5, 1), life: 0.6, max: 0.6, col: pick(['#e0283c', '#2ecc40', '#ffffff', '#ffd23a']), grav: 0.15 }); };
    if (og && (og.type === 'cloud' || og.type === 'ball')) return;
    if (og && og.type === 'unit') { if (kd(o).onlyCrush) shrug(o); else killUnit(o); sparks(12); return; }
    if (og && og.type === 'block' && (og.mat === 'wood' || og.mat === 'plastic')) { sparks(3); return; }
    if (og && og.type === 'block' && og.mat === 'stone') {
      const v = ball.velocity, sp = Math.hypot(v.x, v.y) || 1;
      if (og.stuck) unstick(o);
      if (!o.isStatic) {
        Sleeping.set(o, false);
        Body.setVelocity(o, { x: o.velocity.x + v.x / sp * 7, y: o.velocity.y + Math.min(0, v.y / sp * 7) - 2 });
        Body.setAngularVelocity(o, Math.sign(v.x || 1) * 0.12);
        wakeAround(o.bounds);
      }
      Sfx.play('stone');
    }
    sparks(18);
    landBall(ball);                                   // stone, the ground, or glass after too many bounces
  }
  function firePower(ball) {
    const g = ball.gm, P = BALL_POWERS[g.pw], foe = other(g.side);
    g.pwDone = true;
    const hit = blocks.filter(b => !b.gm.dead && b.gm.side === foe && b.gm.mat === P.mat);
    for (const b of hit) {
      destroyBlock(b);
      for (let i = 0; i < 4; i++) parts.push({ t: 'spark', x: b.position.x + rand(-12, 12), y: b.position.y + rand(-12, 12), vx: rand(-2, 2), vy: rand(-3, 0), life: 0.8, max: 0.8, col: pick(P.col), grav: 0.1 });
    }
    parts.push({ t: 'flash', x: ball.position.x, y: ball.position.y, s: CELL * 3, life: 0.35, max: 0.35 });
    Sfx.play('blast'); cam.shake = 14;
    bigText(`${P.name.toUpperCase()}!`, P.col[0]);
    toast(`${P.name} wiped out ${hit.length} of ${TEAM[foe].name}'s ${P.mat} block${hit.length === 1 ? '' : 's'}!`);
  }
  function toPlastic(b) {
    const g = b.gm;
    if (g.mat === 'plastic') return;
    g.mat = 'plastic';
    g.max = MAT.plastic.hp * Math.sqrt(area(g.shape)); g.hp = Math.min(g.hp, g.max); g.burn = 0;
    if (!b.isStatic) Body.setDensity(b, MAT.plastic.density);
    b.friction = MAT.plastic.friction;
    poof(b.position.x, b.position.y);
  }
  // Electrobab: blows up a big patch of the enemy's fort (and herself)
  function electroBlast(ball) {
    const g = ball.gm;
    g.tb = null; removeBody(ball);
    blastAt(ball.position.x, ball.position.y, g.side);
    toast('Electrobab exploded!');
  }
  // a big explosion that wrecks side's ENEMY: their blocks and units nearby (Electrobab, Funtime Freddy)
  function blastAt(x, y, side) {
    const R = CELL * 4.5, foe = other(side);
    Sfx.play('blast'); cam.shake = 16;
    parts.push({ t: 'flash', x, y, s: R, life: 0.3, max: 0.3 });
    for (let i = 0; i < 40; i++) parts.push({ t: 'spark', x, y, vx: rand(-9, 9), vy: rand(-9, 5), life: rand(0.4, 0.9), max: 0.9, col: pick(['#7fe7ff', '#ffffff', '#3ab8ff']), grav: 0.1 });
    for (const b of blocks.slice()) if (!b.gm.dead && b.gm.side === foe && Math.hypot(b.position.x - x, b.position.y - y) < R) destroyBlock(b);
    for (const u of units.slice()) {
      if (u.gm.dead || u.gm.dig) continue;          // Chipper is safe down his tunnel
      const d = Math.hypot(u.position.x - x, u.position.y - y);
      if (u.gm.side === foe && d < R) damageUnit(u, 3, 'blast');
      else if (d < R * 1.6 && !u.isStatic) { Sleeping.set(u, false); Body.setVelocity(u, { x: u.velocity.x + (u.position.x - x) / (d || 1) * 6, y: u.velocity.y - 5 }); }
    }
    S.recheck = true;
  }
  function throwCupcake(id, vx, vy) {
    const chica = units.find(u => u.gm.id === id && !u.gm.dead);
    S.act = 'dice'; S.throwBy = null;
    if (!chica) { afterPoints(); return; }
    chica.gm.threw = true;
    const c = makeUnit(chica.gm.side, 'cupcake', chica.position.x, chica.position.y - CELL * 1.05);
    Body.setVelocity(c, { x: vx, y: vy });
    Body.setAngularVelocity(c, vx > 0 ? 0.15 : -0.15);
    S.flyView = 'cup'; S.flyBody = c; S.flyT = 0;
    Sfx.play('step');
    afterPoints();
  }
  const THROW_V = { cupcake: VTHROW, self: VMAX, dj: VMAX, fire: SHOTS.fire.v, ooze: SHOTS.ooze.v, rad: SHOTS.rad.v, cookie: SHOTS.cookie.v, festive: SHOTS.festive.v, blue: SHOTS.blue.v };
  const canShoot = shot => !SHOTS[shot].magic || S.magic < MAGIC_PER_TURN;
  // where a throw leaves from: the fighter himself when he launches, just above his head otherwise
  function throwOrigin() {
    const u = units.find(x => x.gm.id === S.throwBy && !x.gm.dead);
    if (!u) return null;
    return S.throwKind === 'self' || S.throwKind === 'dj' || S.throwKind === 'cookie' ? { x: u.position.x, y: u.position.y - 4 } : { x: u.position.x, y: u.position.y - CELL * 1.05 };
  }
  function aimVelocity(vec, vmax = VMAX) {   // vec = drag in screen pixels (pull back) -> launch velocity
    const len = Math.hypot(vec.x, vec.y), full = Math.min(SW, SH) * 0.34;
    const pow = clamp(len / full, 0, 1);
    return { vx: -vec.x / (len || 1) * pow * vmax, vy: -vec.y / (len || 1) * pow * vmax, pow };
  }

  // --- the campaign CPU (always fires the cannon; the higher the level, the steadier its aim)
  const rollDie = () => 5 + Math.floor(Math.random() * 6);     // the dice read 5, 6, 7, 8, 9, 10
  function cpuTurn() {
    if (!S || S.cpu !== S.turn || S.result) return;
    const side = S.cpu;
    // the dice when its cannon is gone, often when a raid is already under way, sometimes just to start one
    const raiding = cpuRaiders().some(u => zoneOf(unitCell(u).c) !== side);
    // Funtime Freddy at full health: bring a fallen comrade back instead of firing, then roll
    const ft = abilityUnit(side, 'revive'), sp = ft && S.act === 'choose' && !S.final && S.graves[side].length && ft.gm.hp >= ft.gm.mhp && reviveSpot(ft);
    if (sp && Math.random() < 0.6) { doAct({ t: 'revive', i: S.graves[side].length - 1, c: sp.c, r: sp.r }); cpuDice(); return; }
    if (S.act === 'choose' && !S.final && (S.cannonDown[side] || S.hot || Math.random() < (raiding ? 0.55 : 0.3))) { cpuDice(); return; }
    if (S.act === 'choose') doAct({ t: 'mode', v: 'cannon' });
    setTimeout(() => {
      if (!S || S.cpu !== S.turn || S.act !== 'aim') return;
      const tb = aliveUnits(side).find(canLaunch);
      const usePw = powerOf(side) && Math.random() < 0.4, useTb = !usePw && tb && Math.random() < 0.35;
      if (useTb) doAct({ t: 'ammo', v: vk(tb.gm) });
      if (usePw) doAct({ t: 'ammo', v: 'power' });
      const v = cpuAim();
      doAct({ t: 'shot', vx: v.vx, vy: v.vy, tb: useTb ? tb.gm.id : null, power: !!usePw });
    }, 900);
  }
  // the soldiers it sends toward the enemy (fast or cannon-wrecking fighters first, then whoever is closest)
  function cpuRaiders() {
    const side = S.cpu, foeEdge = side === 'red' ? 0 : COLS - 1;
    let ids = S.cpuRaid.filter(id => units.some(u => u.gm.id === id && !u.gm.dead));
    const want = (S.level || 0) >= 4 ? 3 : 2;
    if (ids.length < want) {
      const pool = aliveUnits(side).filter(u => isSoldier(u.gm.kind) && !ids.includes(u.gm.id))
        .sort((a, b) => (kd(b).cannonKiller ? 2 : kd(b).steps ? 1 : 0) - (kd(a).cannonKiller ? 2 : kd(a).steps ? 1 : 0)
          || Math.abs(unitCell(a).c - foeEdge) - Math.abs(unitCell(b).c - foeEdge) || unitCell(b).r - unitCell(a).r);
      ids = ids.concat(pool.slice(0, want - ids.length).map(u => u.gm.id));
    }
    S.cpuRaid = ids;
    return ids.map(id => units.find(u => u.gm.id === id));
  }
  function cpuDice() {
    doAct({ t: 'mode', v: 'dice' });
    const n = S.turnNo;
    let shots = 0;
    // Dread Bear's gift goes to a raider (or anyone)
    const db = abilityUnit(S.cpu, 'bless');
    if (db && !db.gm.blessed) {
      const t = cpuRaiders().find(u => u && u !== db && !u.gm.dead) || aliveUnits(S.cpu).find(u => u !== db);
      if (t) doAct({ t: 'bless', id: db.gm.id, to: t.gm.id });
    }
    const step = () => {
      if (!S || S.turnNo !== n || S.cpu !== S.turn || S.act !== 'dice' || S.result) return;
      if (S.rolling || balls.some(b => !b.gm.dead)) { setTimeout(step, 300); return; }
      if (S.pts <= 0 && !hasBonus()) {
        // sometimes a roll is spent on a shooter's shot instead
        if (S.rolls > 0 && shots < 2 && Math.random() < 0.55 && cpuShoot()) { shots++; setTimeout(step, 900); return; }
        if (S.rolls > 0) { doAct({ t: 'roll', v: rollDie() }); setTimeout(step, 1000); }
        return;
      }
      const mv = cpuBestMove();
      if (mv) doAct(mv); else doAct({ t: S.rolls > 0 ? 'endroll' : 'endturn' });
      setTimeout(step, 280);
    };
    setTimeout(step, 700);
  }
  // a CPU shooter fires at an enemy it can reach (a flat, low arc; the cookie flies straight)
  function cpuShoot() {
    const side = S.cpu, lv = LEVELS[S.level] || LEVELS[0], g = G_STEP();
    const shooters = aliveUnits(side).filter(u => kd(u).shoot && canShoot(kd(u).shoot) && !u.gm.dig);
    const targets = aliveUnits(other(side)).filter(t => !kd(t).onlyCrush && !t.gm.dig);
    if (!shooters.length || !targets.length) return false;
    const u = pick(shooters), sh = kd(u).shoot, v = SHOTS[sh].v;
    const fx = u.position.x, fy = u.position.y - (sh === 'cookie' ? 0 : CELL * 1.05);
    for (const t of targets.sort(() => Math.random() - 0.5).slice(0, 6)) {
      const dx = t.position.x - fx, dy = fy - t.position.y, ax = Math.abs(dx);
      let vx, vy;
      if (sh === 'cookie') { const d = Math.hypot(dx, dy) || 1; vx = dx / d * v; vy = -dy / d * v; }
      else {
        const disc = v ** 4 - g * (g * ax * ax + 2 * dy * v * v);
        if (disc < 0 || ax < CELL) continue;
        const th = Math.atan((v * v - Math.sqrt(disc)) / (g * ax)) + (Math.random() * 2 - 1) * lv.noise * 0.2;
        vx = Math.sign(dx) * v * Math.cos(th); vy = -v * Math.sin(th);
      }
      doAct({ t: 'throwmode', id: u.gm.id, kind: sh });
      doAct({ t: 'throw', id: u.gm.id, kind: sh, vx: Math.round(vx * 1000) / 1000, vy: Math.round(vy * 1000) / 1000 });
      return true;
    }
    return false;
  }
  // one greedy step: take enemies, smash in, march raiders toward the far edge (a Balloon Boy there wrecks the cannon)
  function cpuBestMove() {
    const side = S.cpu, goalC = side === 'red' ? 0 : COLS - 1;
    const raidIds = cpuRaiders().map(u => u.gm.id);
    let best = null, bestS = 0;
    for (const u of aliveUnits(side)) {
      if (!canStep(u)) continue;
      const raider = raidIds.includes(u.gm.id), cell = unitCell(u);
      for (const t of moveTargets(u)) {
        let sc = 0;
        if (t.cap) sc = 100 + (t.cap.gm.kind === 'king' ? 30 : 0);
        else if (raider) sc = (Math.abs(cell.c - goalC) - Math.abs((t.tele || t).c - goalC)) * 10 + (t.r < cell.r ? 2 : 0) + (kd(u).cannonKiller ? 1 : 0);
        if (sc > bestS) { bestS = sc; best = { t: 'move', id: u.gm.id, c: t.c, r: t.r }; }
      }
      if (S.pts > 0 && canHitCannon(u) && 60 > bestS) { bestS = 60; best = { t: 'hitcannon', id: u.gm.id }; }
      if (raider && S.pts > 0) for (const { b, cost } of breakTargets(u)) {
        if (S.pts < cost) continue;
        const ahead = Math.sign(goalC - cell.c) === Math.sign(b.position.x / CELL - (cell.c + 0.5));
        const sc = ahead ? 9 - cost : 0;
        if (sc > bestS) { bestS = sc; best = { t: 'break', id: u.gm.id, bid: b.gm.id }; }
      }
    }
    return best;
  }
  // after each CPU shot: compare where it first hit with where it meant to land, and adjust its power next time
  function cpuLearn(hit) {
    const s = S.cpuShot;
    if (!s) return;
    const want = Math.abs(s.tx - s.mx), got = Math.abs(hit.x - s.mx);
    if (got > CELL * 2 && Math.abs(hit.x - s.tx) > CELL * 1.5) S.cpuCorr = clamp(S.cpuCorr * clamp(Math.sqrt(want / got), 0.9, 1.1), 0.8, 1.25);
    S.cpuShot = null;
  }
  function cpuAim() {
    const side = S.cpu, foe = other(side), lv = LEVELS[S.level] || LEVELS[0];
    const all = aliveUnits(foe), home = all.filter(u => !inField(u));
    const targets = home.length ? home : all;          // (the cannon can't hurt units out in the battlefield)
    const king = targets.find(u => u.gm.kind === 'king');
    const t = king && Math.random() < 0.3 ? king : pick(targets);
    const g = G_STEP(), dir = t.position.x > CANNON[side].x ? 1 : -1;
    for (const deg of [60, 55, 65, 50, 70, 45]) {
      const th = deg * Math.PI / 180, m = muzzle(side, dir > 0 ? -th : -(Math.PI - th));
      const dx = Math.abs(t.position.x - m.x), dy = t.position.y - m.y;
      const den = 2 * Math.cos(th) ** 2 * (dy + dx * Math.tan(th));
      if (den <= 0) continue;
      let v = Math.sqrt(g * dx * dx / den) * S.cpuCorr;
      if (v > VMAX) continue;
      const noise = lv.noise * 0.55;
      v *= 1 + (Math.random() * 2 - 1) * noise;
      const a = th + (Math.random() * 2 - 1) * noise * 0.25;
      S.cpuShot = { tx: t.position.x, mx: m.x };
      return { vx: dir * v * Math.cos(a), vy: -v * Math.sin(a) };
    }
    return { vx: dir * VMAX * 0.7, vy: -VMAX * 0.7 };
  }

  // --- the dice: moving units and repairing
  const unitCell = u => ({ c: Math.floor(u.position.x / CELL), r: Math.floor(u.position.y / CELL) });
  function solidAt(x, y) {
    for (const b of blocks) if (!b.gm.dead && Bounds.contains(b.bounds, { x, y }) && Vertices.contains(b.vertices, { x, y })) return b;
    for (const b of clouds) if (Bounds.contains(b.bounds, { x, y })) return b;
    if (mapSolid(Math.floor(x / CELL), Math.floor(y / CELL))) return GROUND_HIT;         // a jungle tree's canopy
    if (y >= groundRow(Math.floor(x / CELL)) * CELL) return GROUND_HIT;
    return null;
  }
  function unitIn(c, r, excl) {
    const x = (c + 0.5) * CELL, y = (r + 0.5) * CELL;
    return units.find(u => !u.gm.dead && u !== excl && Math.hypot(u.position.x - x, u.position.y - y) < CELL * 0.75) || null;
  }
  const isRamp = b => !!(b && b.gm && b.gm.type === 'block' && SHAPES[b.gm.shape].tri);
  // strict: nothing solid at all (for placing blocks); otherwise a slope may fill the bottom of the square (units slide on it)
  function cellFree(c, r, excl, strict = false) {
    if (c < 0 || c >= COLS || r < 0 || r >= groundRow(c)) return false;
    const x = (c + 0.5) * CELL, y = (r + 0.5) * CELL;
    for (const [dx, dy] of [[0, 0], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
      const b = solidAt(x + dx * CELL, y + dy * CELL);
      if (b && (strict || !isRamp(b))) return false;
    }
    if (!strict && solidAt(x, y - CELL * 0.25)) return false;
    if (arrowAt(c, r)) return false;
    return !unitIn(c, r, excl);
  }
  function cellSupported(c, r, groundOnly = false, u = null) {
    if (r >= groundRow(c) - 1) return true;
    const y = (r + 1) * CELL + 6;
    if ([-0.3, 0, 0.3].some(dx => solidAt((c + 0.5 + dx) * CELL, y))) return true;
    if (isRamp(solidAt((c + 0.5) * CELL, (r + 0.8) * CELL))) return true;     // standing on a slope (and about to slide)
    return !groundOnly && holdAt(u, c, r);      // hanging on a rope (or Mangle on a block) counts as standing
  }
  // something to hang from here: a rope, or for Mangle the side or underside of any block bigger than one square
  function holdAt(u, c, r) {
    if (ropeAt(c, r)) return true;
    if (u && kd(u).fly && u.gm.hang) return true;       // Games Freddy stays up once he's flying
    if (!u || !kd(u).climb) return false;
    const big = b => !!(b && b.gm && ((b.gm.type === 'block' && area(b.gm.shape) > 1) || b.gm.type === 'cloud'));
    const x = (c + 0.5) * CELL, y = (r + 0.5) * CELL;
    return big(solidAt(x - CELL * 0.75, y)) || big(solidAt(x + CELL * 0.75, y)) || big(solidAt(x, y - CELL * 0.75));
  }
  // invaders can hit defenders at home, anyone can fight in the battlefield, only a King fights invaders in his own land
  function canCapture(mover, target, c) {
    const z = zoneOf(c);
    if (z === 'field') return true;
    if (z === target.gm.side) return true;
    return mover.gm.kind === 'king' || !!kd(mover).guard || rallied(mover.gm.side);
  }
  // a Glamrock Endo is alive on this side: his whole army fights invaders at home
  const rallied = side => units.some(u => !u.gm.dead && u.gm.side === side && kd(u).rally);
  // Chipper's squares: the earth itself, no deeper than DIG_DEPTH under the flat floor
  const isEarth = (c, r) => c >= 0 && c < COLS && r >= groundRow(c) && r < ROWS + DIG_DEPTH;
  // burrowed: he sits still in his tunnel and nothing can touch him (no physics until he climbs out)
  function setBurrow(u, on) {
    if (!!u.gm.dig === on) return;
    u.gm.dig = on;
    Body.setStatic(u, on);
    u.collisionFilter.mask = on ? 0 : 0xFFFFFFFF;
    if (!on) Sleeping.set(u, false);
  }
  function moveTargets(u) {
    const { c, r } = unitCell(u), out = [], digger = !!kd(u).dig;
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
      if (!dc && !dr) continue;
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= (digger ? ROWS + DIG_DEPTH : ROWS)) continue;
      const foe = unitIn(nc, nr, u);
      if (foe) { if (foe.gm.side !== u.gm.side && !foe.gm.dig && !kd(foe).onlyCrush && canCapture(u, foe, nc)) out.push({ c: nc, r: nr, cap: foe }); continue; }
      if (digger && isEarth(nc, nr)) { out.push({ c: nc, r: nr, dig: true }); continue; }
      if (!cellFree(nc, nr, u)) {
        // a wall one block thick: step straight through it to the square beyond, if the wall is yours
        // (Phantom Puppet also slips through the enemy's stone)
        if (dc && dr) continue;
        const b = solidAt((nc + 0.5) * CELL, (nr + 0.5) * CELL), fc = nc + dc, fr = nr + dr;
        if (!b || !b.gm || b.gm.type !== 'block' || !canPassThrough(u, b)) continue;
        if (fr < 0 || fc < 0 || fc >= COLS || unitIn(fc, fr, u) || !cellFree(fc, fr, u) || solidAt((fc + 0.5) * CELL, (fr + 0.5) * CELL)) continue;
        if (!out.some(t => t.c === fc && t.r === fr)) out.push({ c: fc, r: fr, through: true });
        continue;
      }
      // mid-air is fine: the unit simply falls (or hangs, on a rope / Mangle on a wall)
      const d = doorAt(nc, nr), exit = d && d.color === 'gold' && specials.find(s => s.id === d.link);
      if (exit && cellFree(exit.c, exit.r, u)) out.push({ c: nc, r: nr, tele: { c: exit.c, r: exit.r } });
      else if (!out.some(t => t.c === nc && t.r === nr)) out.push({ c: nc, r: nr });
    }
    return out;
  }
  const canPassThrough = (u, b) => b.gm.side === u.gm.side || kd(u).phase === 'all' || kd(u).phase === b.gm.mat;
  // Foxy moves two squares for every dice point: the second square is a free "bonus" step
  const hasBonus = id => !!(S.bonus && S.bonus.n > 0 && (id == null || S.bonus.id === id));
  const canStep = u => (S.pts > 0 || hasBonus(u.gm.id)) && !isFrozen(u);
  function moveUnit(u, c, r) {
    if (!canStep(u)) return;
    const t = moveTargets(u).find(t => t.c === c && t.r === r);
    if (!t) return;
    if (hasBonus(u.gm.id)) S.bonus.n--;
    else { S.pts--; S.bonus = (kd(u).steps || 1) > 1 ? { id: u.gm.id, n: kd(u).steps - 1 } : null; }
    const from = { min: { x: u.bounds.min.x, y: u.bounds.min.y }, max: { x: u.bounds.max.x, y: u.bounds.max.y } };
    if (t.cap) {
      damageUnit(t.cap, 1, 'capture');
      Sfx.play('death');
      if (!t.cap.gm.dead) { afterPoints(); return; }      // two-heart fighters take two hits
    }
    const to = t.tele || t;
    if (u.gm.hang) setHang(u, false);
    const dig = !!kd(u).dig && isEarth(to.c, to.r);
    setBurrow(u, dig);
    if (dig) {
      if (!S.tunnels.includes(key(to.c, to.r))) S.tunnels.push(key(to.c, to.r));
      for (let i = 0; i < 8; i++) parts.push({ t: 'chip', x: (to.c + 0.5) * CELL, y: (to.r + 0.5) * CELL, vx: rand(-3, 3), vy: rand(-5, -1), rot: 0, vr: rand(-0.3, 0.3), s: rand(4, 8),
        col: pick(MAPK === 'desert' ? ['#c0633a', '#8e3d20'] : ['#5a3d24', '#3b2a1c']), life: 0.8, max: 0.8, grav: 0.3 });
    }
    if (!dig) Sleeping.set(u, false);
    const px = (to.c + 0.5) * CELL;
    let py = (to.r + 0.5) * CELL - 1;
    for (let k = 0; k < 12 && isRamp(solidAt(px, py + CELL * 0.4)); k++) py -= 4;    // sit ON a slope, then slide down it
    Body.setPosition(u, { x: px, y: py });
    Body.setVelocity(u, { x: 0, y: 0 }); Body.setAngularVelocity(u, 0);
    if ((kd(u).fly || holdAt(u, to.c, to.r)) && !cellSupported(to.c, to.r, true)) setHang(u, true);
    u.gm.hop = 0.25;
    if (t.tele) { poof((c + 0.5) * CELL, (r + 0.5) * CELL); poof((to.c + 0.5) * CELL, (to.r + 0.5) * CELL); }
    if (kd(u).cannonKiller) {
      const foe = other(u.gm.side);
      if (!S.cannonDown[foe] && to.c === (foe === 'red' ? COLS - 1 : 0)) wreckCannon(foe, kd(u).name);
    }
    wakeAround(from, 4);
    Sfx.play('step');
    afterPoints();
  }
  // a unit at the far edge of the enemy's land, down near the ground, is standing right next to their cannon
  function canHitCannon(u) {
    if (!u || u.gm.dead || isFrozen(u) || u.gm.dig) return false;
    const foe = other(u.gm.side), { c, r } = unitCell(u);
    return !S.cannonDown[foe] && c === (foe === 'red' ? COLS - 1 : 0) && r >= landFloor(foe) - 3;
  }
  function hitCannon(u) {
    if (!canHitCannon(u) || S.pts <= 0) return;
    const foe = other(u.gm.side), dmg = kd(u).cannonKiller ? CANNON_HP : 1, cp = CANNON[foe];
    S.pts--; S.bonus = null;
    S.cannonHp[foe] = Math.max(0, S.cannonHp[foe] - dmg);
    u.gm.hop = 0.25;
    parts.push({ t: 'text', x: cp.x, y: cp.y - CELL, vx: 0, vy: -1, life: 1, max: 1, txt: '-' + dmg, col: '#ff5050' });
    for (let i = 0; i < 10; i++) parts.push({ t: 'spark', x: cp.x + rand(-20, 20), y: cp.y + rand(-15, 10), vx: rand(-4, 4), vy: rand(-5, 1), life: 0.5, max: 0.5, col: pick(['#ffd24a', '#ff8a3a', '#cccccc']), grav: 0.2 });
    Sfx.play('thud'); cam.shake = Math.max(cam.shake, 6);
    if (S.cannonHp[foe] <= 0) wreckCannon(foe, kd(u).name);
    else toast(`${kd(u).name} hit ${TEAM[foe].name}'s cannon! (${S.cannonHp[foe]}/${CANNON_HP} left)`);
    afterPoints();
  }
  function wreckCannon(side, by = 'Balloon Boy') {
    S.cannonDown[side] = true; S.cannonHp[side] = 0;
    const cp = CANNON[side];
    Sfx.play('blast'); cam.shake = 12;
    parts.push({ t: 'flash', x: cp.x, y: cp.y, s: CELL * 2, life: 0.25, max: 0.25 });
    for (let i = 0; i < 20; i++) parts.push({ t: 'smoke', x: cp.x + rand(-30, 30), y: cp.y + rand(-20, 10), vx: rand(-1, 1), vy: rand(-2, 0), s: rand(12, 26), life: rand(0.8, 1.6), max: 1.6, col: '60,60,60' });
    for (let i = 0; i < 12; i++) parts.push({ t: 'chip', x: cp.x, y: cp.y, vx: rand(-5, 5), vy: rand(-7, -1), rot: 0, vr: rand(-0.3, 0.3), s: rand(5, 9), col: '#2b2b30', life: 1.2, max: 1.2, grav: 0.3 });
    toast(`${by} wrecked ${TEAM[side].name}'s cannon!`);
  }
  // comrades touching a DJ Music Man: he can throw any of them (not another DJ, not Chipper down his tunnel)
  function djReach(side) {
    const djs = aliveUnits(side).filter(u => kd(u).tosser);
    if (!djs.length) return [];
    return aliveUnits(side).filter(u => !kd(u).tosser && !u.gm.dig && !isFrozen(u)
      && djs.some(d => Math.hypot(d.position.x - u.position.x, d.position.y - u.position.y) < CELL * 1.6));
  }
  // Pitch Black Ennard can appear on any free square next to one of his comrades
  function teleCells(u) {
    const out = [], seen = new Set();
    for (const m of aliveUnits(u.gm.side)) {
      if (m === u || m.gm.dig) continue;
      const { c, r } = unitCell(m);
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
        const k = key(c + dc, r + dr);
        if ((!dc && !dr) || seen.has(k)) continue;
        seen.add(k);
        if (r + dr < ROWS && cellFree(c + dc, r + dr, u) && !doorAt(c + dc, r + dr)) out.push({ c: c + dc, r: r + dr });
      }
    }
    return out;
  }
  // where Funtime Freddy puts a revived comrade: a free square beside him (toward the enemy first)
  function reviveSpot(k) {
    const { c, r } = unitCell(k), d = k.gm.side === 'blue' ? 1 : -1;
    for (const [dc, dr] of [[d, 0], [-d, 0], [0, -1], [d, -1], [-d, -1]]) if (r + dr < ROWS && cellFree(c + dc, r + dr, null) && !doorAt(c + dc, r + dr)) return { c: c + dc, r: r + dr };
    return null;
  }
  function teleport(u, c, r) {
    const from = { min: { x: u.bounds.min.x, y: u.bounds.min.y }, max: { x: u.bounds.max.x, y: u.bounds.max.y } };
    const x0 = u.position.x, y0 = u.position.y;
    if (u.gm.hang) setHang(u, false);
    Sleeping.set(u, false);
    Body.setPosition(u, { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL - 1 });
    Body.setVelocity(u, { x: 0, y: 0 }); Body.setAngularVelocity(u, 0);
    u.gm.hop = 0.25;
    for (const [x, y] of [[x0, y0], [u.position.x, u.position.y]])
      for (let i = 0; i < 14; i++) parts.push({ t: 'smoke', x: x + rand(-14, 14), y: y + rand(-14, 14), vx: rand(-1.5, 1.5), vy: rand(-1.5, 0.5), s: rand(8, 15), life: 0.7, max: 0.7, col: pick(['15,10,20', '60,10,20']) });
    Sfx.play('magic');
    wakeAround(from, 4);
    afterPoints();
  }
  // enemy blocks a unit standing in the ENEMY's land can smash: [{b, cost}]
  function breakTargets(u) {
    const { c, r } = unitCell(u), foe = other(u.gm.side), out = [];
    if (zoneOf(c) === u.gm.side) return out;         // in the battlefield or the enemy's land
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
      if (!dc && !dr) continue;
      const x = (c + dc + 0.5) * CELL, y = (r + dr + 0.5) * CELL;
      for (const [ox, oy] of [[0, 0], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
        const b = solidAt(x + ox * CELL, y + oy * CELL);
        if (b && b.gm.type === 'block' && b.gm.side === foe && !out.some(o => o.b === b)) out.push({ b, cost: (kd(u).freeWood && b.gm.mat === 'wood') || (kd(u).freeGlass && b.gm.mat === 'glass') ? 0 : BREAK_COST[b.gm.mat] });
      }
    }
    return out;
  }
  // take away one of your OWN blocks (to free a trapped unit): it costs what it costs to place one
  const unbuildCost = b => (MAT[b.gm.mat] || MAT.wood).dice;
  function unbuild(b) {
    if (!b || b.gm.dead || b.gm.type !== 'block' || b.gm.side !== S.turn || S.pts < unbuildCost(b)) return;
    const cost = unbuildCost(b);
    S.pts -= cost; S.bonus = null;
    destroyBlock(b);
    toast(`Removed your ${MAT[b.gm.mat].name.toLowerCase()} for ${cost} point${cost > 1 ? 's' : ''}`);
    afterPoints();
  }
  function breakBlock(u, b) {
    const t = breakTargets(u).find(t => t.b === b);
    if (!t || S.pts < t.cost) return;
    S.pts -= t.cost; if (t.cost) S.bonus = null;
    destroyBlock(b);
    toast(`Smashed their ${MAT[b.gm.mat].name.toLowerCase()} for ${t.cost} point${t.cost > 1 ? 's' : ''}!`);
    afterPoints();
  }
  // mid-game blocks go ONLY in the battlefield (never in your own land)
  const CLOUD_COST = 2;
  function canRepair(mat, c, r) {
    if (zoneOf(c) !== 'field') return false;
    if (mat === 'cloud') return MAPK === 'towers' && S.pts >= CLOUD_COST && cellFree(c, r, null, true) && !mapSolid(c, r);
    return S.pts >= MAT[mat].dice && cellFree(c, r, null, true);
  }
  function repair(mat, c, r) {
    if (!canRepair(mat, c, r)) return;
    if (mat === 'cloud') {                            // the Towers: a little cloud to stand and build on
      S.pts -= CLOUD_COST;
      makeCloud('c11', (c + 0.5) * CELL, (r + 0.5) * CELL);
      Sfx.play('place'); afterPoints(); return;
    }
    S.pts -= MAT[mat].dice;
    setOwner(makeBlock('s11', mat, (c + 0.5) * CELL, (r + 0.5) * CELL), S.turn);
    Sfx.play('place');
    afterPoints();
  }

  // --- the end of a turn (only the device running the turn decides; the other phone is told)
  function endSettle() {
    for (const b of balls.slice()) landBall(b);
    flushRemovals();
    checkSpecials();
    if (isAuth()) resolveTurn();
    else S.act = 'wait';
  }
  function resolveTurn() {
    for (const side of ['blue', 'red'])
      while (S.flee[side] > 0) { S.flee[side]--; const id = fleeOne(side); if (id != null) { S.fled.push(id); toast(`A ${TEAM[side].name} soldier ran away in fear!`); } }
    flushRemovals();
    // a cannon shot that smashed no block and took out no unit gets ONE more try; a second miss ends the turn
    const L0 = S.shotLog;
    if (L0 && S.lastMode === 'cannon' && !L0.blocks && !L0.kills && !S.retried && !S.cannonDown[S.turn] && !S.cool[S.turn] && !S.fled.length && soldiers('blue') && soldiers('red')) {
      S.shotLog = null;
      if (S.mode === 'online') Net.send({ type: 'sync', snap: snapshot(), st: { turn: S.turn, retry: true, final: S.final, fled: [], cannonDown: S.cannonDown, cannonHp: S.cannonHp, heat: S.heat, cool: S.cool, powerUsed: S.powerUsed } });
      retryShot();
      return;
    }
    if (S.shotLog && S.lastMode === 'cannon' && localCtrl(S.turn) && S.cpu !== S.turn) {
      const L = S.shotLog;
      toast(L.blocks || L.hits ? `Your shot smashed ${L.blocks} block${L.blocks === 1 ? '' : 's'}` + (L.kills ? ` and took out ${L.kills} unit${L.kills === 1 ? '' : 's'}!` : L.hits ? ' and hurt a unit!' : '') : 'Your shot missed...');
    }
    S.shotLog = null;
    const bl = soldiers('blue'), rl = soldiers('red');
    let res = null, next = null;
    if (S.final) res = soldiers(other(S.final)) === 0 ? 'draw' : other(S.final);
    else if (!bl && !rl) res = 'draw';
    else if (!bl) { if (S.cannonDown.blue) res = 'red'; else { S.final = 'blue'; next = 'blue'; } }
    else if (!rl) { if (S.cannonDown.red) res = 'blue'; else { S.final = 'red'; next = 'red'; } }
    else next = other(S.turn);
    const fled = S.fled.slice();
    if (S.mode === 'online') Net.send({ type: 'sync', snap: snapshot(), st: { turn: next, final: S.final, result: res, fled, cannonDown: S.cannonDown, cannonHp: S.cannonHp, heat: S.heat, cool: S.cool, powerUsed: S.powerUsed } });
    if (res) finish(res);
    else beginTurn(next);
  }
  function retryShot() {
    S.retried = true; S.act = 'aim'; S.lastMode = 'cannon'; S.flyView = null; S.aimVec = null; S.ammo = 'ball';
    bigText('MISSED! ONE MORE TRY', TEAM[S.turn].col);
    refocus();
    if (S.cpu === S.turn) { const n = S.turnNo; setTimeout(() => { if (S && S.turnNo === n && running && S.act === 'aim') cpuTurn(); }, 1400); }
  }
  function finish(res) {
    S.result = res; S.act = 'over';
    Store.set('activeMatch', false);
    const me = S.mode === 'online' ? S.mySide : 'blue';
    const outcome = res === 'draw' ? 'draw' : res === me ? 'win' : 'loss';
    const coins = Store.reward(outcome);
    if (S.mode === 'campaign' && outcome === 'win') {
      const b = Store.get('beaten');
      if (!b.includes(S.level + 1)) { b.push(S.level + 1); Store.set('beaten', b); }
    }
    Sfx.play(outcome === 'loss' && S.mode !== 'hotseat' ? 'lose' : res === 'draw' ? 'draw' : 'win');
    refocus();
    setTimeout(() => showOverlay('result', { res, coins, outcome }), 900);
  }

  function snapshot() {
    const r2 = v => Math.round(v * 100) / 100;
    return {
      nextId,
      blocks: blocks.filter(b => !b.gm.dead).map(b => [b.gm.id, b.gm.shape, b.gm.mat, r2(b.position.x), r2(b.position.y), r2(b.angle), r2(b.gm.hp),
        b.gm.stuck ? 1 : 0, b.gm.mover, b.gm.adj, b.gm.side, b.gm.maxis || 'x']),
      clouds: clouds.map(b => [b.gm.id, b.gm.shape, r2(b.position.x), r2(b.position.y), b.gm.adj]),
      units: units.filter(u => !u.gm.dead).map(u => [u.gm.id, u.gm.side, u.gm.kind, r2(u.position.x), r2(u.position.y), r2(u.angle), u.gm.hp, u.gm.hang ? 1 : 0, u.gm.threw ? 1 : 0, u.gm.dig ? 1 : 0, u.gm.up, u.gm.ab, u.gm.mhp, u.gm.blessed ? 1 : 0, u.gm.spent ? 1 : 0, u.gm.frozenUntil || 0]),
      specials: specials.map(s => ({ ...s })),
      tunnels: S.tunnels.slice(), graves: JSON.parse(JSON.stringify(S.graves)),
    };
  }
  function applySnapshot(s, fled = []) {
    for (const id of fled) { const u = units.find(x => x.gm.id === id && !x.gm.dead); if (u) fleeOne(u.gm.side, id); }
    Composite.clear(engine.world, true);           // keep the ground, walls and platforms
    for (const b of Composite.allBodies(engine.world)) if (b.gm) Composite.remove(engine.world, b);
    blocks = []; clouds = []; units = []; balls = []; removeQ = [];
    nextId = Math.max(nextId, s.nextId);
    for (const [id, shape, x, y, adj] of s.clouds) makeCloud(shape, x, y, id, adj);
    for (const [id, shape, mat, x, y, a, hp, stuck, mover, adj, side, maxis] of s.blocks) {
      const b = makeBlock(shape, mat, x, y, a, id, hp);
      Object.assign(b.gm, { adj, mover, maxis, stuck: !!stuck }); setOwner(b, side);
      if (mat === 'plastic') { b.gm.max = MAT.plastic.hp * Math.sqrt(area(shape)); b.gm.hp = Math.min(b.gm.hp, b.gm.max); }
      if (stuck || mover || mat === 'concrete') Body.setStatic(b, true); else Sleeping.set(b, true);
    }
    for (const [id, side, kind, x, y, a, hp, hang, threw, dig, up, ab, mhp, blessed, spent, frozenUntil] of s.units) {
      const u = makeUnit(side, kind, x, y, id, hp, a, up, ab, mhp);
      u.gm.threw = !!threw; u.gm.blessed = !!blessed; u.gm.spent = !!spent; u.gm.frozenUntil = frozenUntil || 0;
      if (dig) setBurrow(u, true); else if (hang) setHang(u, true); else Sleeping.set(u, true);
    }
    specials = s.specials.map(x => ({ ...x }));
    if (s.tunnels) S.tunnels = s.tunnels.slice();
    if (s.graves) S.graves = JSON.parse(JSON.stringify(s.graves));
    towerGround();
  }

  // ------------------------------------------------------------------ simulation step
  function flushRemovals() {
    if (!removeQ.length) return;
    for (const b of removeQ) Composite.remove(engine.world, b);
    removeQ = [];
    blocks = blocks.filter(b => !b.gm.dead);
    units = units.filter(u => !u.gm.dead);
    balls = balls.filter(b => !b.gm.dead);
  }
  function physicsStep() {
    riding = new Set();
    // cookies fly in a straight line: cancel gravity on them
    for (const b of balls) if (b.gm.shot === 'cookie') b.force.y -= b.mass * engine.gravity.y * engine.gravity.scale;
    for (const b of blocks) if (b.gm.mover && !b.gm.dead) moveMover(b);
    if (MAPK === 'towers') {                          // fell off into the clouds below: gone
      for (const u of units) if (!u.gm.dead && u.position.y > H + CELL * 2) { toast(`${kd(u).name} fell into the clouds!`); killUnit(u); }
      for (const b of blocks) if (!b.gm.dead && b.position.y > H + CELL * 2) removeBody(b);
    }
    Engine.update(engine, STEP);
    flushRemovals();
    if (S.recheck) recheckStuck();
    wakeSweep();
    const dt = STEP / 1000;
    for (const u of units) {
      if (u.isSleeping || u.isStatic) continue;
      Body.setAngularVelocity(u, u.angularVelocity * 0.985);   // rolling resistance, so heads don't roll forever
      if (u.gm.crushCD > 0) u.gm.crushCD -= dt;
    }
    for (const b of balls) {
      const g = b.gm;
      g.age++;
      if (b.position.x < WORLD_X0 - 300 || b.position.x > WORLD_X1 + 300 || b.position.y > H + 400) { landBall(b); continue; }
      if (g.shot === 'cookie') { if (g.age > 150) { landBall(b); continue; } Body.setVelocity(b, g.v); }
      if (b.speed < 0.6) g.still++; else g.still = 0;
      if (g.still > 45 || g.age > 60 * 12) { landBall(b); continue; }
      if (g.age % 2 === 0 && !g.tb && g.shot !== 'cookie') parts.push({ t: 'smoke', x: b.position.x, y: b.position.y, vx: 0, vy: 0, s: g.shot ? 10 : 6, life: 0.5, max: 0.5,
        col: g.shot === 'ooze' ? '255,110,210' : g.shot === 'rad' ? '140,255,80' : g.shot === 'festive' ? (g.age % 4 ? '80,230,110' : '240,60,80') : g.shot === 'blue' ? '80,140,255' : g.shot ? '255,140,40' : TRAIL[g.theme] || '230,230,230' });
      // Bidybab splits in two near the top of the flight: a clone flies off beside her
      if (g.tb && g.tb.kind !== 'king' && kdOf(g.tb.kind, g.tb.up, g.tb.ab).split && !g.split && g.age > 12 && b.velocity.y > -3) {
        g.split = true;
        makeBall(b.position.x, b.position.y, b.velocity.x * 0.8, b.velocity.y - 2.5, g.side, { tb: { id: nextId++, hp: KINDS[g.tb.kind].hp, kind: g.tb.kind, spent: true }, split: true, cpu: g.cpu });
        poof(b.position.x, b.position.y);
      }
    }
    // fire eats wood and spreads to wood touching it
    let burning = 0;
    for (const b of blocks) {
      const g = b.gm;
      if (!g.burn || g.dead) continue;
      burning++;
      g.burn -= STEP / 1000;
      damageBlock(b, 1.3 * STEP / 1000);
      if (Math.random() < 0.25) parts.push({ t: 'spark', x: b.position.x + rand(-15, 15), y: b.position.y + rand(-10, 10), vx: rand(-0.3, 0.3), vy: rand(-2, -1), life: 0.6, max: 0.6, col: pick(['#ffd23a', '#ff6a00']), grav: -0.02 });
      if (Math.random() < 0.5 * STEP / 1000) for (const o of blocks) {
        if (o === b || o.gm.mat !== 'wood' || o.gm.burn || o.gm.dead) continue;
        const A = b.bounds, B = o.bounds;
        if (A.min.x - 6 <= B.max.x && A.max.x + 6 >= B.min.x && A.min.y - 6 <= B.max.y && A.max.y + 6 >= B.min.y) { ignite(o); break; }
      }
      if (g.burn <= 0) g.burn = 0;
    }
    flushRemovals();
    if (S.act === 'fly' || S.act === 'settle') {
      S.settleT += STEP;
      let moving = balls.length > 0 || burning > 0 || parts.some(p => p.kfx);   // (kill effects finish before the camera moves on)
      if (!moving) for (const b of blocks.concat(units))
        if (!b.isSleeping && !b.isStatic && !riding.has(b) && (b.speed > 0.25 || Math.abs(b.angularVelocity) > 0.012)) { moving = true; break; }
      S.quiet = moving ? 0 : S.quiet + 1;
      if (S.quiet > 40 || S.settleT > 15000) endSettle();
    }
  }

  // ------------------------------------------------------------------ per-frame update
  function blinkStep(o, dt) {           // o.blink counts down; below zero the lids close and open again
    o.blink = (o.blink == null ? rand(1, 5) : o.blink) - dt;
    if (o.blink < -0.16) o.blink = rand(1.5, 5.5);
    o.lid = o.blink < 0 ? Math.sin(Math.min(1, -o.blink / 0.16) * Math.PI) : 0;
  }
  function update(dt) {
    for (const u of units) { blinkStep(u.gm, dt); if (u.gm.hop > 0) u.gm.hop -= dt; }
    if (S.phase === 'build' || S.phase === 'units') for (const side of ['blue', 'red']) for (const u of S.layouts[side].units) blinkStep(u, dt);
    if (S.rolling > 0) {
      S.rolling -= dt;
      S.die = 5 + Math.floor(Math.random() * 6);
      if (S.rolling <= 0) { S.rolling = 0; S.die = S.rollTo; S.pts = S.rollTo; }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      if (p.vx != null) { p.x += p.vx; p.y += p.vy; }
      if (p.grav) p.vy += p.grav;
      if (p.vr) p.rot += p.vr;
    }
    if (parts.length > 900) parts.splice(0, parts.length - 900);
    stepCamera();
    cam.shake *= 0.88;
    hud();
  }

  // ------------------------------------------------------------------ drawing
  const STARS = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random() * 0.7, s: Math.random() * 1.6 + 0.4, t: Math.random() * 6 }));
  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, SH);
    const SKY = { desert: ['#12070d', '#4a1a1c', '#a4452a'], snow: ['#0c1630', '#2a4470', '#7d9cc4'], jungle: ['#04120a', '#0e2a18', '#24462a'],
      wasteland: ['#140806', '#3a120a', '#7a2a10'], towers: ['#0a0f2a', '#28336a', '#7a86c0'] }[MAPK] || ['#07060f', '#161232', '#2a1d3c'];
    sky.addColorStop(0, SKY[0]); sky.addColorStop(0.58, SKY[1]); sky.addColorStop(1, SKY[2]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, SW, SH);
    if (MAPK === 'wasteland') drawVolcanoes(now);
    for (const s of STARS) {
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(now / 700 + s.t);
      ctx.fillStyle = '#fff'; ctx.fillRect(((s.x * SW - cam.x * cam.z * 0.05) % SW + SW) % SW, s.y * SH, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,250,220,0.9)'; ctx.beginPath(); ctx.arc(SW * 0.82, SH * 0.16, 26, 0, 7); ctx.fill();
    ctx.fillStyle = SKY[0]; ctx.beginPath(); ctx.arc(SW * 0.82 + 10, SH * 0.16 - 6, 22, 0, 7); ctx.fill();
    if (MAPK === 'snow') {                            // falling snow
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const s of STARS) { const y = ((s.y * SH + now * 0.03 * (0.6 + s.s)) % SH), x = ((s.x * SW + Math.sin(now / 900 + s.t) * 20) % SW + SW) % SW; ctx.beginPath(); ctx.arc(x, y, s.s * 1.3, 0, 7); ctx.fill(); }
    }

    const sx = cam.shake ? rand(-cam.shake, cam.shake) : 0, sy = cam.shake ? rand(-cam.shake, cam.shake) : 0;
    const z = cam.z * dpr;
    ctx.setTransform(z, 0, 0, z, (-cam.x + sx / cam.z) * z, (-cam.y + sy / cam.z) * z);
    drawBoard();
    for (const side of ['blue', 'red']) drawCannon(side);
    if (S.phase === 'build' || S.phase === 'units') drawLayouts(now);
    else {
      for (const c of clouds) drawCloud(c.position.x, c.position.y, c.gm.shape, c.gm.seed);
      drawTunnels();
      for (const s of specials) drawSpecial(s, now);
      for (const b of blocks) {
        drawBlock(b.position.x, b.position.y, b.angle, b.gm.shape, b.gm.mat, b.gm.hp / b.gm.max, b.gm.seed, now, 1, b.gm.stuck, b.gm.side);
        if (b.gm.mat === 'concrete' && b.gm.side) {    // the Towers' concrete base, in its team's colour
          ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle); blockPath(b.gm.shape);
          ctx.fillStyle = `rgba(${TEAM[b.gm.side].rgb},0.55)`; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = `rgba(0,0,0,0.5)`; ctx.stroke(); ctx.restore();
        } else if (b.gm.side && zoneOf(Math.floor(b.position.x / CELL)) !== b.gm.side) {     // outside its owner's land: team colour shows whose it is
          ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle); blockPath(b.gm.shape);
          ctx.fillStyle = `rgba(${TEAM[b.gm.side].rgb},0.28)`; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = TEAM[b.gm.side].col; ctx.stroke(); ctx.restore();
        }
        if (b.gm.burn) {                              // on fire
          ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle); blockPath(b.gm.shape);
          ctx.fillStyle = `rgba(255,106,0,${0.3 + 0.15 * Math.sin(now / 80 + b.gm.seed)})`; ctx.fill(); ctx.restore();
        }
      }
      drawDust(now);
      for (const u of units) {
        drawUnit(u.position.x, u.position.y - (u.gm.hop > 0 ? Math.sin(u.gm.hop / 0.25 * Math.PI) * 10 : 0), u.angle, u.gm.side, vk(u.gm), u.gm.lid, u.gm.hp, 1, u.gm.id === S.sel, u.gm.mhp);
        if (isFrozen(u)) drawIce(u.position.x, u.position.y);
      }
      for (const b of balls) drawBall(b);
    }
    drawParts();
    drawOverlays(now);
    if (S.phase === 'build' || S.phase === 'units') drawFog();
  }
  function drawBoard() {
    const v0 = toWorld(0, 0), v1 = toWorld(SW, SH);
    ctx.fillStyle = `rgba(${TEAM.blue.rgb},0.16)`; ctx.fillRect(0, 0, BLUE_END * CELL, H);
    ctx.fillStyle = `rgba(${TEAM.red.rgb},0.16)`; ctx.fillRect(RED_START * CELL, 0, (COLS - RED_START) * CELL, H);
    ctx.fillStyle = 'rgba(120,200,120,0.06)'; ctx.fillRect(BLUE_END * CELL, 0, (RED_START - BLUE_END) * CELL, H);
    const every = cam.z < 0.2 ? 5 : 1;
    ctx.lineWidth = 1 / cam.z;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    const c0 = Math.max(0, Math.floor(v0.x / CELL)), c1 = Math.min(COLS, Math.ceil(v1.x / CELL));
    for (let c = c0; c <= c1; c++) if (c % every === 0) { ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, Math.min(ROWS, groundRow(c), groundRow(c - 1)) * CELL); }
    for (let r = 0; r <= ROWS; r++) if (r % every === 0) { ctx.moveTo(Math.max(0, v0.x), r * CELL); ctx.lineTo(Math.min(W, v1.x), r * CELL); }
    ctx.stroke();
    ctx.lineWidth = 3 / cam.z;
    ctx.strokeStyle = `rgba(${TEAM.blue.rgb},0.7)`; ctx.beginPath(); ctx.moveTo(BLUE_END * CELL, 0); ctx.lineTo(BLUE_END * CELL, H); ctx.stroke();
    ctx.strokeStyle = `rgba(${TEAM.red.rgb},0.7)`; ctx.beginPath(); ctx.moveTo(RED_START * CELL, 0); ctx.lineTo(RED_START * CELL, H); ctx.stroke();
    ctx.setLineDash([12, 12]); ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.stroke(); ctx.setLineDash([]);
    const LOOK = GROUND_LOOK[MAPK] || GROUND_LOOK.field;
    if (MAPK === 'towers') drawCloudSea();
    else {
      const g = ctx.createLinearGradient(0, H, 0, H + 400);
      g.addColorStop(0, LOOK.dirt[0]); g.addColorStop(1, LOOK.dirt[1]);
      ctx.fillStyle = g; ctx.fillRect(WORLD_X0 - 2000, H, WORLD_X1 - WORLD_X0 + 4000, 800);
      ctx.fillStyle = LOOK.top; ctx.fillRect(WORLD_X0 - 2000, H, WORLD_X1 - WORLD_X0 + 4000, 10);
      if (GROUND.some(g => g < ROWS)) drawTerrain(LOOK);
      if (TREES.length) drawTrees();
    }
    ctx.fillStyle = `rgba(${TEAM.blue.rgb},0.35)`; ctx.fillRect(0, H + 10, BLUE_END * CELL, 6);
    ctx.fillStyle = `rgba(${TEAM.red.rgb},0.35)`; ctx.fillRect(RED_START * CELL, H + 10, (COLS - RED_START) * CELL, 6);
    for (const s of ['blue', 'red']) {                // the low cannon platforms
      const p = PLAT[s];
      ctx.fillStyle = '#3a3b40'; ctx.fillRect(p.x0, p.y - PLAT_H, p.x1 - p.x0, PLAT_H + 4);
      ctx.fillStyle = '#55575e'; ctx.fillRect(p.x0, p.y - PLAT_H, p.x1 - p.x0, 4);
      ctx.strokeStyle = '#1e1f22'; ctx.lineWidth = 2; ctx.strokeRect(p.x0, p.y - PLAT_H, p.x1 - p.x0, PLAT_H + 4);
    }
    ctx.font = 'bold 60px Impact, Arial Black, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(${TEAM.blue.rgb},0.35)`; ctx.fillText(TEAM.blue.name, BLUE_END * CELL / 2, H + 90);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillText('BATTLEFIELD', (BLUE_END + RED_START) / 2 * CELL, H + 90);
    ctx.fillStyle = `rgba(${TEAM.red.rgb},0.35)`; ctx.fillText(TEAM.red.name, (RED_START + COLS) / 2 * CELL, H + 90);
  }
  // each map's ground: the soil below, the grass/snow/ash on top, and the raised ground's colours and bands
  const GROUND_LOOK = {
    field: { dirt: ['#3b2a1c', '#120c07'], top: '#2f6b2a' },
    desert: { dirt: ['#9c4526', '#3a160c'], top: '#d9824a', fill: ['#c0633a', '#8e3d20'], band: 'rgba(90,30,12,0.35)', edge: '#e39a5e' },
    snow: { dirt: ['#6f7f9a', '#2a3448'], top: '#f4f8ff', fill: ['#eef4ff', '#b8c8e4'], band: 'rgba(120,140,180,0.3)', edge: '#ffffff' },
    jungle: { dirt: ['#3a2a14', '#120c06'], top: '#2e8a2a' },
    wasteland: { dirt: ['#4a3020', '#1a0f08'], top: '#6a4a30', fill: ['#6e4a30', '#3e2616'], band: 'rgba(30,15,5,0.4)', edge: '#8a6440' },
  };
  // the Towers: a sea of clouds where the ground would be
  function drawCloudSea() {
    const t = performance.now();
    ctx.fillStyle = 'rgba(200,210,245,0.95)'; ctx.fillRect(WORLD_X0 - 2000, H + 30, WORLD_X1 - WORLD_X0 + 4000, 900);
    for (let x = WORLD_X0 - 200, i = 0; x < WORLD_X1 + 200; x += 90, i++) {
      const y = H + 20 + Math.sin(i * 1.7 + t / 1600) * 10;
      ctx.fillStyle = i % 2 ? '#eef2ff' : '#dfe6ff'; ctx.beginPath(); ctx.arc(x, y, 70 + (i % 3) * 14, 0, 7); ctx.fill();
    }
  }
  // the Volcano Wasteland's background: dark volcanoes, glowing lava
  function drawVolcanoes(now) {
    const base = SH * 0.78, par = cam.x * cam.z * 0.03;
    for (const [fx, w, h] of [[0.12, 0.34, 0.42], [0.5, 0.42, 0.55], [0.86, 0.3, 0.36]]) {
      const x = ((fx * SW - par) % (SW * 1.2) + SW * 1.2) % (SW * 1.2) - SW * 0.1, top = base - SH * h;
      ctx.fillStyle = '#1a0c08';
      ctx.beginPath(); ctx.moveTo(x - SW * w / 2, base + 40); ctx.lineTo(x - SW * 0.04, top); ctx.lineTo(x + SW * 0.04, top); ctx.lineTo(x + SW * w / 2, base + 40); ctx.fill();
      const glow = 0.6 + 0.4 * Math.sin(now / 400 + fx * 10);
      ctx.fillStyle = `rgba(255,${90 + 60 * glow},20,0.9)`; ctx.beginPath(); ctx.ellipse(x, top, SW * 0.04, 6, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(255,120,30,${0.7 * glow})`; ctx.lineWidth = 4;              // lava running down
      ctx.beginPath(); ctx.moveTo(x - 6, top + 2); ctx.quadraticCurveTo(x - SW * 0.05, top + (base - top) * 0.5, x - SW * 0.09, base); ctx.stroke();
      ctx.fillStyle = `rgba(90,40,30,${0.25 + 0.1 * glow})`;                              // smoke
      ctx.beginPath(); ctx.arc(x + Math.sin(now / 900) * 10, top - 30, 26, 0, 7); ctx.arc(x + 20, top - 60, 34, 0, 7); ctx.fill();
    }
    const lava = ctx.createLinearGradient(0, base, 0, SH);
    lava.addColorStop(0, 'rgba(255,110,20,0.55)'); lava.addColorStop(1, 'rgba(120,20,0,0.2)');
    ctx.fillStyle = lava; ctx.fillRect(0, base + 30, SW, SH - base);
  }
  // the Jungle's trees: trunk and vines (climbable), a leafy canopy (solid, build on it)
  function drawTrees() {
    const t = performance.now();
    for (const tr of TREES) {
      const cx = (tr.c + 0.5) * CELL, top = tr.top * CELL;
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(cx - CELL * 0.28, top + CELL * 0.5, CELL * 0.56, H - top - CELL * 0.5);
      ctx.strokeStyle = '#3e2810'; ctx.lineWidth = 2;
      for (let y = top + CELL; y < H; y += 22) { ctx.beginPath(); ctx.moveTo(cx - CELL * 0.2, y); ctx.lineTo(cx + CELL * 0.1, y + 8); ctx.stroke(); }
      for (const v of [-2, 2]) {                       // vines
        const vx = (tr.c + v + 0.5) * CELL;
        ctx.strokeStyle = '#2f8a2a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(vx, top + CELL);
        for (let y = top + CELL; y <= top + CELL * 6; y += 10) ctx.lineTo(vx + Math.sin(y * 0.08 + t / 700) * 3, y);
        ctx.stroke();
        ctx.fillStyle = '#4fc23a';
        for (let y = top + CELL * 1.4; y < top + CELL * 6; y += 24) { ctx.beginPath(); ctx.ellipse(vx + 5, y, 6, 3, 0.6, 0, 7); ctx.fill(); }
      }
      ctx.fillStyle = '#1f6a24';                        // the canopy (two leafy halves, the trunk coming up between them)
      for (const [x0, x1] of [[tr.c - 2, tr.c], [tr.c + 1, tr.c + 3]]) {
        ctx.beginPath(); ctx.roundRect(x0 * CELL - 4, top - 8, (x1 - x0) * CELL + 8, CELL + 12, 14); ctx.fill();
      }
      ctx.fillStyle = '#2e8a2a';
      for (let i = 0; i < 7; i++) { if (i === 3) continue; ctx.beginPath(); ctx.arc((tr.c - 2) * CELL + 12 + i * CELL * 0.72, top + 2, 15, Math.PI, 0); ctx.fill(); }
    }
  }
  // raised ground: the plateau / hill / wasteland slopes, in layered bands
  function drawTerrain(LOOK = GROUND_LOOK.desert) {
    ctx.beginPath();
    ctx.moveTo(WORLD_X0 - 2000, H);
    ctx.lineTo(WORLD_X0 - 2000, groundRow(0) * CELL);
    for (let c = 0; c < COLS; c++) { ctx.lineTo(c * CELL, GROUND[c] * CELL); ctx.lineTo((c + 1) * CELL, GROUND[c] * CELL); }
    ctx.lineTo(WORLD_X1 + 2000, groundRow(COLS - 1) * CELL);
    ctx.lineTo(WORLD_X1 + 2000, H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, (ROWS - PLATEAU) * CELL, 0, H);
    g.addColorStop(0, (LOOK.fill || GROUND_LOOK.desert.fill)[0]); g.addColorStop(1, (LOOK.fill || GROUND_LOOK.desert.fill)[1]);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    for (let y = (ROWS - PLATEAU) * CELL + 14; y < H; y += 22) {
      ctx.strokeStyle = LOOK.band || 'rgba(90,30,12,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(WORLD_X0 - 2000, y); for (let x = WORLD_X0 - 2000; x < WORLD_X1 + 2000; x += 160) ctx.lineTo(x, y + Math.sin(x * 0.01 + y) * 5); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = LOOK.edge || '#e39a5e'; ctx.lineWidth = 5; ctx.stroke();
  }
  // Chipper's burrows: dark holes dug into the earth
  function drawTunnels() {
    if (!S.tunnels.length) return;
    ctx.fillStyle = MAPK === 'desert' ? '#3a1408' : '#140d07';
    ctx.beginPath();                                 // the squares overlap a little so a row of them reads as one tunnel
    for (const k of S.tunnels) { const [c, r] = k.split(',').map(Number); ctx.roundRect(c * CELL - 3, r * CELL - 1, CELL + 6, CELL + 2, 14); }
    ctx.fill();
  }
  function blockPath(shape) {
    const lv = LV[shape].lv;
    ctx.beginPath(); ctx.moveTo(lv[0].x, lv[0].y);
    for (let i = 1; i < lv.length; i++) ctx.lineTo(lv[i].x, lv[i].y);
    ctx.closePath();
  }
  function drawBlock(x, y, ang, shape, mat, hpf, seed, now, alpha = 1, stuck = false, side = null) {
    const skin = SKINS[mat][skinOf(side, mat)];
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = alpha;
    blockPath(shape);
    ctx.fillStyle = PAT[mat + ':' + skinOf(side, mat)] || skin.fill; ctx.fill();
    if (mat === 'plastic') {                          // shiny pink plastic
      ctx.save(); ctx.clip(); const sh = SHAPES[shape];
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-sh.w * CELL / 2, -sh.h * CELL / 2, sh.w * CELL, sh.h * CELL * 0.25); ctx.restore();
    }
    if (mat === 'glass') {
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 5;
      const sh = SHAPES[shape];
      ctx.beginPath(); ctx.moveTo(-sh.w * CELL / 2, sh.h * CELL * 0.1); ctx.lineTo(-sh.w * CELL * 0.1, -sh.h * CELL / 2); ctx.stroke();
      ctx.restore();
    }
    ctx.lineWidth = 2.5; ctx.strokeStyle = skin.edge; ctx.stroke();
    if (stuck) { ctx.lineWidth = 2; ctx.strokeStyle = `rgba(170,230,255,${0.35 + 0.25 * Math.sin(now / 300 + seed)})`; ctx.stroke(); }
    if (hpf < 0.75) {                                 // cracks
      ctx.save(); blockPath(shape); ctx.clip();
      ctx.strokeStyle = mat === 'glass' ? 'rgba(255,255,255,0.9)' : 'rgba(20,15,10,0.75)'; ctx.lineWidth = 1.6;
      const n = hpf < 0.4 ? 5 : 2, sh = SHAPES[shape];
      let s = seed;
      const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      for (let i = 0; i < n; i++) {
        let px = (rnd() - 0.5) * sh.w * CELL * 0.8, py = (rnd() - 0.5) * sh.h * CELL * 0.8;
        ctx.beginPath(); ctx.moveTo(px, py);
        for (let k = 0; k < 3; k++) { px += (rnd() - 0.5) * 22; py += (rnd() - 0.5) * 22; ctx.lineTo(px, py); }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  function drawCloud(x, y, shape, seed = 1, alpha = 1) {
    const sh = SHAPES[shape], w = sh.w * CELL, h = sh.h * CELL;
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha;
    let s = Math.floor(seed * 7) + 3;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const puffs = [];
    const n = sh.w * 2 + 1;
    for (let i = 0; i < n; i++) puffs.push([-w / 2 + (i + 0.5) * w / n, -h * 0.08 - rnd() * h * 0.12, Math.min(h * (0.36 + rnd() * 0.16), CELL * 0.75)]);
    ctx.fillStyle = '#9aa3c4';
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2 + 4, w, h - 2, h / 2); ctx.fill();
    ctx.fillStyle = '#eef2ff';
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h - 6, h / 2);
    for (const [px, py, pr] of puffs) { ctx.moveTo(px + pr, py); ctx.arc(px, py, Math.min(pr, w / 2), 0, 7); }
    ctx.fill();
    ctx.restore();
  }
  function drawSpecial(s, now, alpha = 1) {
    const x = s.c * CELL, y = s.r * CELL;
    ctx.save(); ctx.globalAlpha = alpha;
    if (s.mat === 'rope') {
      const h = SHAPES[s.shape].h * CELL, cx = x + CELL / 2;
      const vine = MAPK === 'jungle';                   // in the jungle, ropes are green vines
      ctx.strokeStyle = vine ? '#2f8a2a' : '#6e4f24'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, y + h); ctx.stroke();
      ctx.strokeStyle = vine ? '#6fd24a' : '#b8914e'; ctx.lineWidth = 2;
      for (let yy = y + 3; yy < y + h; yy += 8) { ctx.beginPath(); ctx.moveTo(cx - 3, yy); ctx.lineTo(cx + 3, yy + 5); ctx.stroke(); }
      ctx.fillStyle = vine ? '#2f8a2a' : '#6e4f24'; ctx.beginPath(); ctx.arc(cx, y + h - 3, 6, 0, 7); ctx.fill();
    } else if (s.mat === 'door') {
      const gold = s.color === 'gold';
      ctx.fillStyle = gold ? '#7a5a08' : '#6a1010'; ctx.fillRect(x + 5, y + 1, CELL - 10, CELL - 1);
      ctx.fillStyle = gold ? '#e8b923' : '#d63030'; ctx.fillRect(x + 8, y + 4, CELL - 16, CELL - 5);
      ctx.strokeStyle = gold ? '#fff2a8' : '#ff9a9a'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 11, y + 7, CELL - 22, CELL / 2 - 8);
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x + CELL - 13, y + CELL * 0.62, 2.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
      ctx.fillText(gold ? 'IN' : 'OUT', x + CELL / 2, y + CELL - 5);
    } else if (s.mat === 'varrow') {                  // blue up/down arrow
      const cx = x + CELL / 2 + Math.sin(now / 400 + s.r) * 2, cy = y + CELL / 2;
      ctx.fillStyle = '#1f6fd6'; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.42, 0, 7); ctx.fill();
      ctx.strokeStyle = '#0a2a6a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath();
      const d = s.dir || -1;
      ctx.moveTo(cx, cy + d * 11); ctx.lineTo(cx - 9, cy - d * 3); ctx.lineTo(cx - 4, cy - d * 3); ctx.lineTo(cx - 4, cy - d * 11);
      ctx.lineTo(cx + 4, cy - d * 11); ctx.lineTo(cx + 4, cy - d * 3); ctx.lineTo(cx + 9, cy - d * 3); ctx.closePath(); ctx.fill();
    } else if (s.mat === 'arrow') {
      const cx = x + CELL / 2, cy = y + CELL / 2 + Math.sin(now / 400 + s.c) * 2;
      ctx.fillStyle = '#d61f2c'; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.42, 0, 7); ctx.fill();
      ctx.strokeStyle = '#7a0a12'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath();
      const d = s.dir || 1;
      ctx.moveTo(cx + d * 11, cy); ctx.lineTo(cx - d * 3, cy - 9); ctx.lineTo(cx - d * 3, cy - 4); ctx.lineTo(cx - d * 11, cy - 4);
      ctx.lineTo(cx - d * 11, cy + 4); ctx.lineTo(cx - d * 3, cy + 4); ctx.lineTo(cx - d * 3, cy + 9); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // a side covered in Dust Mangle's green dust
  function drawDust(now) {
    for (const side of ['blue', 'red']) {
      if (!dusted(side)) continue;
      for (const u of aliveUnits(side)) {
        ctx.fillStyle = `rgba(110,190,90,${0.22 + 0.08 * Math.sin(now / 300 + u.gm.id)})`;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(u.position.x + Math.sin(now / 500 + i * 2 + u.gm.id) * 10, u.position.y - 6 + Math.cos(now / 600 + i * 2) * 8, CELL * 0.42, 0, 7); ctx.fill(); }
      }
    }
  }
  function drawHead(kind, lid) {
    const k = KINDS[kind], im = IMG[kind];
    const R = CELL * (kind === 'king' || KINDS[kind].kingUp ? 0.48 : 0.45);
    const h = CELL * k.dh, w = h * k.w / k.h, top = R + 2 - h;       // the picture stands on the bottom of the ball
    if (im.complete && im.naturalWidth) ctx.drawImage(im, -w / 2, top, w, h);
    if (lid > 0) {                                  // eyelids come down over each eye
      const sx = w / k.w, sy = h / k.h;
      for (const [ex0, ey0, rx0, ry0] of k.eyes) {
        const ex = -w / 2 + ex0 * sx, ey = top + ey0 * sy, rx = rx0 * sx, ry = ry0 * sy;
        ctx.save(); ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, 7); ctx.clip();
        ctx.fillStyle = k.lid; ctx.fillRect(ex - rx, ey - ry, rx * 2, ry * 2 * lid);
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(ex - rx, ey - ry + ry * 2 * lid - 1.2, rx * 2, 1.2);
        ctx.restore();
      }
    }
    return top;
  }
  // kind = the picture (a King's upgrade when he wears one); mhp = most hearts (defaults to the picture's)
  function drawUnit(x, y, ang, side, kind, lid, hp, alpha = 1, selected = false, mhp = null) {
    const nh = mhp || KINDS[kind].hp;
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha;
    const R = CELL * (kind === 'king' || KINDS[kind].kingUp ? 0.5 : 0.47);
    ctx.beginPath(); ctx.arc(0, 0, R + 3, 0, 7);
    ctx.fillStyle = `rgba(${TEAM[side].rgb},0.28)`; ctx.fill();
    ctx.lineWidth = selected ? 5 : 3; ctx.strokeStyle = selected ? '#ffe04a' : TEAM[side].col; ctx.stroke();
    ctx.save(); ctx.rotate(ang);
    const top = drawHead(kind, lid);
    ctx.restore();
    if (nh > 1) {                                     // hearts over the two-hit fighters
      for (let i = 0; i < nh; i++) {
        ctx.fillStyle = i < hp ? '#ff3b5c' : 'rgba(0,0,0,0.5)';
        heart((i - (nh - 1) / 2) * 15, Math.min(top, -R) - 8, 6);
      }
    }
    ctx.restore();
  }
  function heart(x, y, s) {
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.3, x, y - s * 0.4);
    ctx.bezierCurveTo(x + s * 0.6, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
    ctx.fill();
  }
  function drawBall(b) {
    if (b.gm.pw) {                                    // a cannonball power: its picture, spinning
      const P = BALL_POWERS[b.gm.pw], im = P.im, r = CELL * 0.55;
      ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
      if (im.complete && im.naturalWidth) { const k = r * 2 / Math.max(im.naturalWidth, im.naturalHeight); ctx.drawImage(im, -im.naturalWidth * k / 2, -im.naturalHeight * k / 2, im.naturalWidth * k, im.naturalHeight * k); }
      ctx.restore(); return;
    }
    if (b.gm.tb) { drawUnit(b.position.x, b.position.y, b.angle, b.gm.side, b.gm.tb.up || b.gm.tb.kind, 0, b.gm.tb.hp, 1, false, b.gm.tb.mhp); return; }
    if (b.gm.shot === 'cookie') {
      ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.gm.age * 0.3);
      ctx.fillStyle = '#c68a4a'; ctx.beginPath(); ctx.arc(0, 0, CELL * 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = '#4a2410'; for (const [a, d] of [[0, 5], [2, 7], [4, 4], [5.5, 8]]) { ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 2.2, 0, 7); ctx.fill(); }
      ctx.restore(); return;
    }
    if (b.gm.shot) {
      const t = performance.now(), sh = b.gm.shot;
      const c1 = sh === 'ooze' ? '#ffd0f0' : sh === 'rad' ? '#f0ffb0' : sh === 'festive' ? '#ffffff' : sh === 'blue' ? '#d8ecff' : '#fff6b0';
      const c2 = sh === 'ooze' ? '#ff3ab8' : sh === 'rad' ? '#5ae020' : sh === 'festive' ? '#e0283c' : sh === 'blue' ? '#1e4bd8' : '#ff5a00';
      const rr = CELL * (sh === 'blue' ? 0.34 : 0.28);
      ctx.save(); ctx.translate(b.position.x, b.position.y);
      ctx.fillStyle = sh === 'ooze' ? 'rgba(255,90,200,0.35)' : sh === 'rad' ? 'rgba(120,255,60,0.35)' : sh === 'festive' ? 'rgba(60,230,100,0.4)' : sh === 'blue' ? 'rgba(60,110,255,0.4)' : 'rgba(255,120,20,0.35)';
      ctx.beginPath(); ctx.arc(0, 0, CELL * 0.5 + Math.sin(t / 60) * 3, 0, 7); ctx.fill();
      const gr = ctx.createRadialGradient(-3, -3, 1, 0, 0, rr); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rr, 0, 7); ctx.fill(); ctx.restore();
      return;
    }
    const r = CELL * 0.35, T = b.gm.theme && b.gm.theme !== 'default' && CANNON_THEMES[b.gm.theme];
    ctx.save(); ctx.translate(b.position.x, b.position.y);
    if (b.gm.theme === 'torch' || b.gm.theme === 'storm' || b.gm.theme === 'frost') {       // a glow around the hotter / colder balls
      ctx.fillStyle = b.gm.theme === 'torch' ? 'rgba(255,120,20,0.35)' : b.gm.theme === 'storm' ? 'rgba(120,170,255,0.35)' : 'rgba(190,235,255,0.35)';
      ctx.beginPath(); ctx.arc(0, 0, r * 1.6 + Math.sin(performance.now() / 60) * 2, 0, 7); ctx.fill();
    }
    const gr = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
    gr.addColorStop(0, T ? T.band || T.barrel : '#777'); gr.addColorStop(1, T ? T.dark : '#2b2b30');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawCannon(side) {
    const cp = CANNON[side], dir = side === 'blue' ? 1 : -1;
    let ang = S.aimAng[side];
    if (S.cannonDown && S.cannonDown[side]) {        // wrecked: barrel in the dirt, still smoking
      const cp = CANNON[side], dir = side === 'blue' ? 1 : -1;
      ctx.save(); ctx.translate(cp.x, cp.y + CELL * 0.35); ctx.rotate(dir * 0.5);
      ctx.fillStyle = '#1c1c1f'; ctx.fillRect(-CELL * 0.8, -CELL * 0.3, CELL * 1.7, CELL * 0.55);
      ctx.fillStyle = '#3a2410'; ctx.beginPath(); ctx.arc(-dir * CELL * 0.9, CELL * 0.1, CELL * 0.3, 0, 7); ctx.fill();
      ctx.restore();
      if (Math.random() < 0.08) parts.push({ t: 'smoke', x: cp.x + rand(-10, 10), y: cp.y, vx: rand(-0.3, 0.3), vy: -1, s: rand(8, 14), life: 1.2, max: 1.2, col: '70,70,70' });
      return;
    }
    if (S.phase === 'battle' && S.cannonHp) {                 // its 5 health pips
      for (let i = 0; i < CANNON_HP; i++) {
        ctx.fillStyle = i < S.cannonHp[side] ? '#ff3b5c' : 'rgba(0,0,0,0.55)'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(cp.x - 2.5 * 13 + i * 13, cp.y - CELL * 1.35, 10, 8, 2); ctx.fill(); ctx.stroke();
      }
      const sel = S.act === 'dice' && myTurn() && S.dtool === 'move' && units.find(u => u.gm.id === S.sel && !u.gm.dead);
      if (sel && sel.gm.side !== side && canHitCannon(sel)) {
        ctx.strokeStyle = `rgba(255,70,70,${0.55 + 0.4 * Math.sin(performance.now() / 150)})`; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(cp.x, cp.y, CELL * 1.6, 0, 7); ctx.stroke();
      }
    }
    if (S.phase === 'battle' && S.turn === side && S.act === 'aim' && S.aimVec) { const v = aimVelocity(S.aimVec); if (v.pow > 0.02) ang = Math.atan2(v.vy, v.vx); }
    ctx.save(); ctx.translate(cp.x, cp.y);
    if (S.phase === 'battle' && S.turn === side && S.act === 'aim' && !S.result) {     // highlight the cannon in use
      const t = performance.now() / 250;
      ctx.fillStyle = `rgba(255,224,74,${0.18 + 0.1 * Math.sin(t)})`; ctx.beginPath(); ctx.arc(0, 0, CELL * 2.2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ffe04a'; ctx.lineWidth = 4; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 6;
      ctx.beginPath(); ctx.arc(0, 0, CELL * 2.2, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    drawCannonBody(ctx, skinOf(side, 'cannon'), TEAM[side].col, ang, dir, performance.now());
    ctx.restore();
  }
  function drawLayouts(now) {
    if (MAPK === 'towers') for (const s of ['blue', 'red']) {         // the concrete bases (they become real blocks when the battle starts)
      ctx.fillStyle = TEAM[s].col; ctx.globalAlpha = 0.75; ctx.fillRect(PLATE[s][0] * CELL, (ROWS - 1) * CELL, (PLATE[s][1] - PLATE[s][0] + 1) * CELL, CELL);
      ctx.globalAlpha = 1; ctx.strokeStyle = '#303238'; ctx.lineWidth = 3; ctx.strokeRect(PLATE[s][0] * CELL, (ROWS - 1) * CELL, (PLATE[s][1] - PLATE[s][0] + 1) * CELL, CELL);
    }
    for (const side of ['blue', 'red']) {
      const L = S.layouts[side];
      for (const it of L.blocks) {
        const lv = LV[it.shape];
        if (it.mat === 'cloud') drawCloud((it.c + lv.cx) * CELL, (it.r + lv.cy) * CELL, it.shape, it.id % 97);
        else if (!isSolid(it.mat)) drawSpecial(it, now);
        else drawBlock((it.c + lv.cx) * CELL, (it.r + lv.cy) * CELL, 0, it.shape, it.mat, 1, it.id, now, 1, false, side);
      }
      for (const u of L.units) { const h = kdOf(u.kind, u.up, u.ab).hp; drawUnit((u.c + 0.5) * CELL, (u.r + 0.5) * CELL, 0, side, u.up || u.kind, u.lid || 0, h, 1, false, h); }
    }
  }
  function drawFog() {
    const hide = S.mode === 'online' ? other(S.mySide) : S.mode === 'campaign' ? 'red' : other(S.buildSide);
    const x0 = hide === 'blue' ? WORLD_X0 - 400 : RED_START * CELL, x1 = hide === 'blue' ? BLUE_END * CELL : WORLD_X1 + 400;
    ctx.fillStyle = 'rgba(5,4,12,0.93)'; ctx.fillRect(x0, -1200, x1 - x0, H + 1200);
    ctx.fillStyle = `rgba(${TEAM[hide].rgb},0.8)`; ctx.textAlign = 'center';
    ctx.font = 'bold 110px Impact, Arial Black, sans-serif';
    const msg = S.mode === 'online' ? (S.ready[hide] ? 'READY' : 'BUILDING...') : S.mode === 'campaign' ? 'IS WAITING' : 'HIDDEN';
    const cx = hide === 'blue' ? BLUE_END * CELL / 2 : (RED_START + COLS) * CELL / 2;
    for (let y = 300; y < H; y += 600) ctx.fillText(`${TEAM[hide].name} ${msg}`, cx, y);
  }
  // k = how far through the effect (0 -> 1)
  function drawIce(x, y) {                          // a unit frozen solid by the Frost cannon
    const s = CELL * 1.25;
    ctx.save(); ctx.translate(x, y - CELL * 0.2);
    ctx.fillStyle = 'rgba(170,225,255,0.45)'; ctx.strokeStyle = 'rgba(235,250,255,0.9)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(-s / 2, -s / 2, s, s, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-s * 0.36, -s * 0.1); ctx.lineTo(-s * 0.1, -s * 0.36); ctx.moveTo(-s * 0.36, s * 0.12); ctx.lineTo(s * 0.12, -s * 0.36); ctx.stroke();
    ctx.restore();
  }
  function drawKillFx(p, k) {
    const { x, gy, bits } = p, fade = k > 0.7 ? (1 - k) / 0.3 : 1, now = performance.now();
    ctx.save(); ctx.globalAlpha = fade;
    if (p.fx === 'weeds') {                          // weeds grow up out of the ground and sway
      const grow = Math.min(1, k / 0.4);
      for (let i = 0; i < 5; i++) {
        const bx = x + (i - 2) * 13 + bits[i] * 6, h = (44 + bits[i] * 38) * grow, sw = Math.sin(now / 250 + i) * 6 * grow;
        ctx.strokeStyle = i % 2 ? '#3f7a24' : '#5a9a2e'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(bx, gy); ctx.quadraticCurveTo(bx - 8 + bits[i + 1] * 16, gy - h * 0.6, bx + sw, gy - h); ctx.stroke();
        ctx.fillStyle = '#6fbf3a';
        for (const t of [0.45, 0.75]) { ctx.beginPath(); ctx.ellipse(bx + sw * t + (i % 2 ? 7 : -7), gy - h * t, 10 * grow, 4 * grow, i % 2 ? -0.6 : 0.6, 0, 7); ctx.fill(); }
      }
    } else if (p.fx === 'spikes') {                  // lime spikes burst up out of the ground, then sink back
      const up = k < 0.12 ? k / 0.12 : k > 0.75 ? (1 - k) / 0.25 : 1;
      for (let i = 0; i < 6; i++) {
        const bx = x + (i - 2.5) * 12, h = (34 + bits[i] * 34) * up, lean = (bits[i] - 0.5) * 12;
        ctx.fillStyle = '#8fdc2e'; ctx.strokeStyle = '#2f5a10'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx - 7, gy); ctx.lineTo(bx + lean, gy - h); ctx.lineTo(bx + 7, gy); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(bx - 3, gy); ctx.lineTo(bx + lean, gy - h); ctx.lineTo(bx, gy); ctx.fill();
      }
    } else if (p.fx === 'skull') {                   // a ghostly skull and crossbones floats up
      const yy = p.y - k * 90, xx = x + Math.sin(k * 9) * 10;
      ctx.globalAlpha = fade * (k < 0.15 ? k / 0.15 : 1) * 0.9;
      ctx.translate(xx, yy);
      ctx.shadowColor = 'rgba(255,255,255,0.8)'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#f4f1e8';
      for (const r of [0.7, -0.7]) { ctx.save(); ctx.rotate(r); ctx.beginPath(); ctx.roundRect(-22, -3.5, 44, 7, 3.5); ctx.fill();
        for (const e of [-22, 22]) { ctx.beginPath(); ctx.arc(e, -3, 4, 0, 7); ctx.arc(e, 3, 4, 0, 7); ctx.fill(); } ctx.restore(); }
      ctx.beginPath(); ctx.arc(0, -6, 13, 0, 7); ctx.fill(); ctx.beginPath(); ctx.roundRect(-8, 2, 16, 10, 3); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#15151a';
      ctx.beginPath(); ctx.arc(-5, -6, 3.6, 0, 7); ctx.arc(5, -6, 3.6, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(-2, 2); ctx.lineTo(2, 2); ctx.fill();
      for (const tx of [-4, 0, 4]) ctx.fillRect(tx - 0.8, 6, 1.6, 5);
    } else if (p.fx === 'icicle') {                  // an icicle drops out of the sky and spears the ground
      const fall = Math.min(1, k / 0.3), tip = gy + 8 - (1 - fall * fall) * 520, len = 64;
      ctx.translate(x, tip);
      const gr = ctx.createLinearGradient(-9, 0, 9, 0); gr.addColorStop(0, '#bfeaff'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#6fc4ee');
      ctx.fillStyle = gr; ctx.strokeStyle = '#3a8ec0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10, -len); ctx.lineTo(10, -len); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (fall >= 1) {                              // shattered ice around where it hit
        ctx.fillStyle = 'rgba(220,245,255,0.9)';
        for (let i = 0; i < 6; i++) { const d = (k - 0.3) * 60 * (0.5 + bits[i]); ctx.fillRect((i - 2.5) * 6 + (i < 3 ? -d : d), -6 - bits[i] * 10 + (k - 0.3) * 30, 4, 4); }
      }
    } else if (p.fx === 'flames') {                  // a fire burning on the spot
      for (let i = 0; i < 5; i++) {
        const bx = x + (i - 2) * 9, h = (26 + bits[i] * 22) * (0.75 + 0.25 * Math.sin(now / 70 + i * 2)) * Math.min(1, k / 0.12);
        const gr = ctx.createLinearGradient(bx, gy, bx, gy - h); gr.addColorStop(0, '#ff5a00'); gr.addColorStop(0.6, '#ffb020'); gr.addColorStop(1, 'rgba(255,240,120,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(bx - 8, gy); ctx.quadraticCurveTo(bx - 9, gy - h * 0.5, bx + Math.sin(now / 90 + i) * 4, gy - h); ctx.quadraticCurveTo(bx + 9, gy - h * 0.5, bx + 8, gy); ctx.fill();
      }
    } else if (p.fx === 'bolt') {                    // a lightning bolt from the sky
      ctx.globalAlpha = fade * (0.6 + 0.4 * Math.abs(Math.sin(now / 30)));
      for (const [w, c] of [[12, 'rgba(90,150,255,0.45)'], [5, '#bcd8ff'], [2, '#ffffff']]) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath();
        p.path.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(160,200,255,0.5)'; ctx.beginPath(); ctx.ellipse(x, gy, 26, 7, 0, 0, 7); ctx.fill();
    } else if (p.fx === 'souls') {                   // purple demon souls wriggle up out of the ground and fade
      for (let i = 0; i < 6; i++) {
        const t = Math.max(0, k - bits[i] * 0.25), bx = x + (i - 2.5) * 15 + Math.sin(t * 14 + i) * 9, by = gy - 8 - t * (70 + bits[i] * 40);
        ctx.globalAlpha = fade * Math.max(0, Math.min(1, t * 5)) * (1 - t * 0.6);
        ctx.fillStyle = i % 2 ? '#8a3ad8' : '#b36bff';
        ctx.beginPath(); ctx.arc(bx, by, 11, Math.PI, 0);
        ctx.lineTo(bx + 11, by + 14); ctx.lineTo(bx + 5, by + 9); ctx.lineTo(bx, by + 15); ctx.lineTo(bx - 5, by + 9); ctx.lineTo(bx - 11, by + 14); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1a0628'; ctx.beginPath(); ctx.arc(bx - 4, by - 1, 2.4, 0, 7); ctx.arc(bx + 4, by - 1, 2.4, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawParts() {
    for (const p of parts) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.t === 'chip') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.7); ctx.restore();
      } else if (p.t === 'smoke') {
        ctx.globalAlpha = a * 0.5; ctx.fillStyle = `rgb(${p.col})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1.6 - a * 0.6), 0, 7); ctx.fill();
      } else if (p.t === 'spark') {
        ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 7); ctx.fill();
      } else if (p.t === 'flash') {
        ctx.globalAlpha = a; ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill();
      } else if (p.t === 'text') {
        ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.font = 'bold 28px Impact, Arial Black, sans-serif'; ctx.textAlign = 'center';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeText(p.txt, p.x, p.y); ctx.fillText(p.txt, p.x, p.y);
      } else if (p.t === 'confetti') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, a * 2.5); ctx.fillStyle = p.col;
        ctx.fillRect(-p.s / 2, -p.s * 0.3, p.s, p.s * 0.6 * Math.abs(Math.cos(p.rot * 3))); ctx.restore();
      } else if (p.t === 'flower') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, a * 2.5);
        ctx.fillStyle = p.col;
        for (let k = 0; k < 5; k++) { const an = k * 1.2566; ctx.beginPath(); ctx.ellipse(Math.cos(an) * p.s * 0.55, Math.sin(an) * p.s * 0.55, p.s * 0.45, p.s * 0.3, an, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#ffe04a'; ctx.beginPath(); ctx.arc(0, 0, p.s * 0.3, 0, 7); ctx.fill(); ctx.restore();
      } else if (p.t === 'kfx') {
        drawKillFx(p, 1 - a);
      } else if (p.t === 'head') {
        ctx.globalAlpha = 1; drawUnit(p.x, p.y, p.rot, p.side, p.kind, 1, 0, a);
      } else if (p.t === 'flee') {                     // hop, hop, hop... off the map
        const k = 1 - a, hops = k * 6;
        const x = p.x + p.dir * k * CELL * 10, y = p.y - Math.abs(Math.sin(hops * Math.PI)) * CELL * 1.5;
        ctx.globalAlpha = 1; drawUnit(x, y, Math.sin(hops * Math.PI * 2) * 0.3, p.side, p.kind, 0, 1, Math.min(1, a * 2));
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawOverlays(now) {
    const hv = S.hover;
    if ((S.phase === 'build' || S.phase === 'units') && hv) {
      const side = bs();
      if (S.phase === 'build' && S.tool === 'block' && !S.ready[side]) {
        const it = placedShape(hv.c, hv.r), ok = !placeProblem(it, side, occMap()), lv = LV[it.shape];
        const x = (it.c + lv.cx) * CELL, y = (it.r + lv.cy) * CELL;
        if (it.mat === 'cloud') drawCloud(x, y, it.shape, 3, 0.55);
        else if (!isSolid(it.mat)) drawSpecial({ ...it, dir: side === 'blue' ? 1 : -1, color: S.doorPending[side] ? 'red' : 'gold' }, now, 0.6);
        else drawBlock(x, y, 0, it.shape, it.mat, 1, 1, now, 0.55, false, side);
        ctx.save(); ctx.translate(x, y); blockPath(SHAPES[it.shape].tri ? it.shape : it.shape);
        ctx.lineWidth = 4; ctx.strokeStyle = ok ? '#5cff7a' : '#ff4a4a'; ctx.stroke(); ctx.restore();
      } else {
        ctx.strokeStyle = '#ffe04a'; ctx.lineWidth = 3; ctx.strokeRect(hv.c * CELL, hv.r * CELL, CELL, CELL);
      }
    }
    if (S.phase !== 'battle' || S.result) return;
    if (S.act === 'dice' && myTurn()) {
      if (S.dtool === 'move') {
        const sel = units.find(u => u.gm.id === S.sel && !u.gm.dead);
        if (sel && canStep(sel)) for (const t of moveTargets(sel)) {
          ctx.fillStyle = t.cap ? 'rgba(255,60,60,0.45)' : t.tele ? 'rgba(232,185,35,0.5)' : t.dig ? 'rgba(230,150,60,0.45)' : 'rgba(90,255,120,0.35)';
          ctx.fillRect(t.c * CELL + 3, t.r * CELL + 3, CELL - 6, CELL - 6);
          ctx.strokeStyle = t.cap ? '#ff4a4a' : t.tele ? '#ffe04a' : t.dig ? '#ffb05a' : '#5cff7a'; ctx.lineWidth = 2; ctx.strokeRect(t.c * CELL + 3, t.r * CELL + 3, CELL - 6, CELL - 6);
        }
        if (sel && S.pts > 0) for (const { b, cost } of breakTargets(sel)) {      // enemy blocks it can smash, with their price
          ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle); blockPath(b.gm.shape);
          ctx.lineWidth = 4; ctx.strokeStyle = S.pts >= cost ? `rgba(255,150,30,${0.6 + 0.4 * Math.sin(now / 150)})` : 'rgba(120,120,120,0.7)'; ctx.stroke();
          ctx.rotate(-b.angle);
          ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill();
          ctx.fillStyle = S.pts >= cost ? '#ffb13a' : '#888'; ctx.font = 'bold 18px Impact, Arial Black, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(cost, 0, 1); ctx.textBaseline = 'alphabetic';
          ctx.restore();
        }
        if (!sel && S.pts > 0) for (const u of aliveUnits(S.turn)) {
          ctx.strokeStyle = `rgba(255,224,74,${0.5 + 0.4 * Math.sin(now / 200)})`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(u.position.x, u.position.y, CELL * 0.62, 0, 7); ctx.stroke();
        }
      } else if (S.dtool === 'djpick') {                // the comrades DJ Music Man can grab
        ctx.strokeStyle = `rgba(255,74,216,${0.55 + 0.4 * Math.sin(now / 150)})`; ctx.lineWidth = 4;
        for (const u of djReach(S.turn)) { ctx.beginPath(); ctx.arc(u.position.x, u.position.y, CELL * 0.64, 0, 7); ctx.stroke(); }
      } else if (S.dtool === 'tele') {                  // where Pitch Black Ennard can appear
        const en = abilityUnit(S.turn, 'tele');
        if (en) for (const t of teleCells(en)) {
          ctx.fillStyle = `rgba(200,30,60,${0.25 + 0.15 * Math.sin(now / 200)})`; ctx.fillRect(t.c * CELL + 3, t.r * CELL + 3, CELL - 6, CELL - 6);
          ctx.strokeStyle = '#ff3a5a'; ctx.lineWidth = 2; ctx.strokeRect(t.c * CELL + 3, t.r * CELL + 3, CELL - 6, CELL - 6);
        }
      } else if (S.dtool === 'bless') {                 // who Dread Bear can give 3 hearts to
        const d = abilityUnit(S.turn, 'bless');
        ctx.strokeStyle = `rgba(255,90,122,${0.55 + 0.4 * Math.sin(now / 150)})`; ctx.lineWidth = 4;
        for (const u of aliveUnits(S.turn)) if (u !== d) { ctx.beginPath(); ctx.arc(u.position.x, u.position.y, CELL * 0.64, 0, 7); ctx.stroke(); }
      } else if (hv) {
        const ok = canRepair(S.dtool, hv.c, hv.r);
        ctx.fillStyle = ok ? 'rgba(90,255,120,0.3)' : 'rgba(255,60,60,0.3)'; ctx.fillRect(hv.c * CELL, hv.r * CELL, CELL, CELL);
      }
    }
    // the aimer: dotted flight path (cannon, or Chica's cupcake throw)
    const throwing = S.act === 'throw';
    if ((S.act === 'aim' || throwing) && S.aimVec && Store.get('aimOn') && myTurn()) {
      const v = aimVelocity(S.aimVec, throwing ? THROW_V[S.throwKind] : VMAX);
      const from = throwing ? throwOrigin() : muzzle(S.turn, Math.atan2(v.vy, v.vx));
      if (from && v.pow > 0.02) {
        const g = throwing && S.throwKind === 'cookie' ? 0 : G_STEP();      // the cookie flies dead straight
        let x = from.x, y = from.y, vx = v.vx, vy = v.vy;
        ctx.fillStyle = Store.get('aimColor');
        for (let i = 1; i < 220; i++) {
          vy += g; x += vx; y += vy;
          if (y > H || x < WORLD_X0 || x > WORLD_X1) break;
          if (i % 4 === 0) { ctx.globalAlpha = Math.max(0.25, 1 - i / 220); ctx.beginPath(); ctx.arc(x, y, 3 / Math.max(0.3, cam.z) * 0.8, 0, 7); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  // ------------------------------------------------------------------ HUD (buttons over the canvas)
  const $ = id => document.getElementById(id);
  let hudSig = '';
  function hud() {
    const sig = JSON.stringify([S.phase, S.act, S.turn, S.tool, S.mat, S.shape, S.unitTool, S.rolls, S.pts, S.die, !!S.rolling, S.sel, S.dtool,
      S.ready, S.buildSide, S.final, S.result, S.doorPending, S.used, S.bonus, S.ammo, S.cannonDown, S.throwKind, S.throwBy, S.looks, S.hot, S.heat, S.magic, S.powerUsed, S.layouts.blue.blocks.length, S.layouts.red.blocks.length,
      S.layouts.blue.units.map(u => u.kind).join(), S.layouts.red.units.map(u => u.kind).join(),
      S.phase === 'battle' ? units.map(u => u.gm.side[0] + vk(u.gm) + u.gm.hp + (u.gm.threw ? 't' : '') + (u.gm.blessed ? 'b' : '')).join('') : '',
      S.graves.blue.length, S.graves.red.length, S.phase === 'battle' && dusted(S.turn),
      S.layouts.blue.units.map(u => u.up || '').join(), S.layouts.red.units.map(u => u.up || '').join(),
      S.phase === 'battle' && S.act === 'dice' ? djReach(S.turn).length : 0, !!cam.free, S.cannonHp,
      S.phase === 'battle' && S.sel ? (u => u ? canHitCannon(u) : 0)(units.find(x => x.gm.id === S.sel)) : 0]);
    if (sig === hudSig) return;
    hudSig = sig;
    // on a phone the bar rows swipe sideways: keep each row where the player left it
    const keep = [...$('hudBar').querySelectorAll('.row')].map(r => r.scrollLeft);
    $('hudBar').innerHTML = barHTML();
    $('hudBar').querySelectorAll('.row').forEach((r, i) => { if (keep[i]) r.scrollLeft = keep[i]; });
    rowFades();
    $('status').innerHTML = statusHTML();
    $('banner').innerHTML = bannerHTML();
    $('zoomBtns').classList.toggle('hidden', S.phase === 'battle');
    equipHTML();
  }
  // a row that doesn't fit fades at the edge(s) there's more to swipe to
  function rowFades() {
    for (const r of $('hudBar').querySelectorAll('.row')) {
      r.classList.toggle('more', r.scrollLeft + r.clientWidth < r.scrollWidth - 2);
      r.classList.toggle('moreL', r.scrollLeft > 2);
    }
  }
  const btn = (a, label, o = {}) =>
    `<button class="tb${o.on ? ' on' : ''}${o.cls ? ' ' + o.cls : ''}" data-a="${a}" data-v="${o.v == null ? '' : o.v}"${o.off ? ' disabled' : ''}>${label}</button>`;
  function shapeSVG(k, mat) {
    const sh = SHAPES[k], s = Math.max(sh.w, sh.h);
    const fill = { stone: '#8b8f96', wood: '#a8733d', glass: '#a5e1ff', cloud: '#eef2ff', rope: '#8a6a3a', door: '#e8b923', arrow: '#d61f2c', varrow: '#1f6fd6' }[mat];
    const pts = shapeVerts(sh).map(([x, y]) => `${x + (s - sh.w) / 2},${y + (s - sh.h) / 2}`).join(' ');
    return `<svg viewBox="-0.25 -0.25 ${s + 0.5} ${s + 0.5}" width="24" height="24"><polygon points="${pts}" fill="${fill}" stroke="#111" stroke-width="${0.08 * s}"/></svg>`;
  }
  function barHTML() {
    if (S.phase === 'build' || S.phase === 'units') {
      const side = bs();
      if (S.ready[side]) return `<div class="note">Waiting for ${TEAM[other(side)].name} to finish building...</div>`;
      if (S.phase === 'build') {
        const L = S.layouts[side];
        let h = '<div class="row">';
        for (const m of ['stone', 'wood', 'glass']) h += btn('mat', MAT[m].name, { v: m, on: S.tool === 'block' && S.mat === m, cls: 'mat-' + m });
        h += '<span class="sep"></span>';
        for (const m in SPECIAL) h += btn('mat', SPECIAL[m].name, { v: m, on: S.tool === 'block' && S.mat === m, cls: 'mat-' + m });
        h += '<span class="sep"></span>' + btn('erase', 'Erase', { on: S.tool === 'erase' }) + `<span class="note">${L.blocks.length}/${MAX_ITEMS}</span>`;
        // the next-step buttons go first, so on a small phone they're never swiped out of sight
        h += '</div><div class="row">';
        h += btn('tounits', 'Place Units &#9654;', { cls: 'go' }) + btn('autofort', 'Auto Fort') + btn('savefort', 'Save Fort') + btn('clear', 'Clear') + '<span class="sep"></span>';
        if (S.doorPending[side]) h += '<span class="note warn">Place the RED exit door!</span>';
        const list = shapesFor(S.mat);
        if (list.length > 1) for (const k of list) h += btn('shape', shapeSVG(k, S.mat), { v: k, on: S.tool === 'block' && S.shape === k, cls: 'ico' });
        else h += `<span class="note tip">${SPECIAL[S.mat] ? SPECIAL[S.mat].tip : ''}</span>`;
        h += '</div>';
        return h;
      }
      const left = unitsLeft(side);
      let h = '<div class="row">';
      h += btn('ready', 'READY &#10004;', { cls: 'go', off: left.endo + left.king > 0 }) + btn('autounits', 'Auto Place');
      h += btn('unit', `<img src="img/endo.png" class="uimg"> Endo &times;${left.endo}`, { v: 'endo', on: S.unitTool === 'endo', off: !left.endo });
      h += btn('unit', `<img src="img/freddy.png" class="uimg"> King &times;${left.king}`, { v: 'king', on: S.unitTool === 'king', off: !left.king });
      h += btn('unit', 'Remove', { v: 'remove', on: S.unitTool === 'remove' });
      h += btn('savefort', 'Save Fort') + btn('tobuild', '&#9664; Blocks');
      return h + '</div>' + (S.equip[side].some(Boolean) ? '<div class="note">Drag a mask from the gold bar onto an Endo (or a King upgrade onto your King) to change it.</div>' : '');
    }
    if (S.phase !== 'battle' || S.result) return '';
    if (!myTurn()) return `<div class="note">${S.cpu === S.turn ? 'The enemy is taking aim...' : `${TEAM[S.turn].name} is playing${S.act === 'dice' ? ` (dice: ${S.pts} left)` : ''}...`}</div>`;
    if (S.act === 'choose') {
      const heat = S.heat[S.turn] ? ` <small>heat ${S.heat[S.turn]}/3</small>` : '';
      let rv = '';                                    // Funtime Freddy: revive a fallen comrade instead of firing
      const ft = abilityUnit(S.turn, 'revive');
      if (ft && S.graves[S.turn].length && !S.final) {
        const ok = ft.gm.hp >= ft.gm.mhp && reviveSpot(ft);
        const seen = new Set();
        S.graves[S.turn].forEach((g, i) => {
          if (seen.has(g.kind) || seen.size >= 4) return;
          seen.add(g.kind);
          const last = S.graves[S.turn].map(x => x.kind).lastIndexOf(g.kind);
          rv += btn('revive', `&#9851; <img src="${KINDS[g.kind].img}" class="uimg">`, { v: last, off: !ok });
        });
      }
      return `<div class="row">${btn('cannon', S.cannonDown[S.turn] ? 'CANNON WRECKED' : S.hot ? `OVERHEATED <small>(${S.cool[S.turn] + 1} turn${S.cool[S.turn] ? 's' : ''})</small>` : '&#128165; FIRE CANNON' + heat, { cls: 'big', off: S.cannonDown[S.turn] || S.hot })}${btn('dice', '&#127922; ROLL DICE &times;3', { cls: 'big' })}${rv}</div>`
        + (dusted(S.turn) ? '<div class="note" style="color:#8cdc6a">Dust Mangle is in your land: your dice rolls are cut in half!</div>' : '');
    }
    if (S.act === 'aim') {
      const ammo = launchKeys(S.turn), pw = powerOf(S.turn);
      let h = '<div class="row">';
      if (ammo.length || pw) {
        h += btn('ammo', 'Cannonball', { v: 'ball', on: !ammo.includes(S.ammo) && S.ammo !== 'power' });
        if (pw) h += btn('ammo', `<img src="${BALL_POWERS[pw].img}" class="uimg"> ${BALL_POWERS[pw].name} <small>(once)</small>`, { v: 'power', on: S.ammo === 'power', cls: 'power' });
        for (const k of ammo) h += btn('ammo', `<img src="${KINDS[k].img}" class="uimg"> ${KINDS[k].name}`, { v: k, on: S.ammo === k });
      }
      const what = S.ammo === 'power' && pw ? ` ${BALL_POWERS[pw].name} - it wipes out ALL their ${BALL_POWERS[pw].mat}` : ammo.includes(S.ammo) ? ' ' + KINDS[S.ammo].name : '';
      return h + `<span class="note">Drag back anywhere and let go to fire${what}.</span>${S.final ? '' : btn('back', '&#9664; Back')}</div>`;
    }
    if (S.act === 'throw') {
      const u = units.find(x => x.gm.id === S.throwBy), nm = u ? kd(u).name : '';
      const what = S.throwKind === 'self' ? `launch ${nm} across the map` : S.throwKind === 'dj' ? `have DJ Music Man throw ${nm} into enemy land` : SHOTS[S.throwKind] ? `shoot ${nm}'s ${SHOTS[S.throwKind].name.toLowerCase()}` : 'throw the Cupcake from Chica';
      return `<div class="row"><span class="note">Drag back anywhere and let go to ${what}.</span>${btn('throwcancel', 'Cancel')}</div>`;
    }
    if (S.act === 'dice') {
      const canRoll = S.pts <= 0 && S.rolls > 0 && !S.rolling;
      const chica = aliveUnits(S.turn, 'chica').find(c => !c.gm.threw);
      let h = '<div class="row">';
      h += btn('roll', `<span class="die">${S.die || 'ROLL'}</span>`, { cls: 'dieb' + (canRoll ? ' pulse' : '') + (S.die ? '' : ' fresh'), off: !canRoll });
      h += `<span class="note">Rolls <b>${S.rolls}</b> &middot; Points <b>${S.pts}</b>${hasBonus() ? ' <b style="color:#ff8a3a">+1 Foxy step</b>' : ''}${dusted(S.turn) ? ' <b style="color:#8cdc6a">DUSTED: rolls halved</b>' : ''}</span>`;
      h += btn('dtool', 'Move', { v: 'move', on: S.dtool === 'move' });
      h += btn('dtool', 'Wood (1)', { v: 'wood', on: S.dtool === 'wood', cls: 'mat-wood' });
      h += btn('dtool', 'Glass (1)', { v: 'glass', on: S.dtool === 'glass', cls: 'mat-glass' });
      h += btn('dtool', 'Stone (2)', { v: 'stone', on: S.dtool === 'stone', cls: 'mat-stone' });
      if (MAPK === 'towers') h += btn('dtool', `Cloud (${CLOUD_COST})`, { v: 'cloud', on: S.dtool === 'cloud', cls: 'mat-cloud' });
      h += btn('dtool', 'Remove', { v: 'remove', on: S.dtool === 'remove' });
      h += btn('endroll', 'End Roll', { off: S.pts <= 0 }) + btn('endturn', 'End Turn') + '</div>';
      // the fighters' abilities get their own row
      const main = h;
      h = '<div class="row">';
      // zoom in / out / show everyone, so the squares are easy to tap
      h += btn('zoom', '&#8722;', { v: 'out', cls: 'zb' }) + btn('zoom', '+', { v: 'in', cls: 'zb' }) + btn('zoom', '&#10530; All', { v: 'fit', on: !cam.free });
      const selU = units.find(u => u.gm.id === S.sel && !u.gm.dead);
      if (selU && canHitCannon(selU)) h += btn('hitcannon', `&#128165; Hit Cannon (${S.cannonHp[other(S.turn)]}/${CANNON_HP})`, { off: S.pts <= 0, cls: 'go' });
      const canAb = !S.rolling && (S.pts > 0 || S.rolls > 0);
      if (chica) h += btn('throwmode', '<img src="img/cupcake.png" class="uimg"> Cupcake', { off: !canAb, v: 'cupcake:' + chica.gm.id });
      for (const k of launchKeys(S.turn)) { const u = launchable(S.turn, k)[0]; if (u) h += btn('throwmode', `<img src="${KINDS[k].img}" class="uimg"> Launch`, { off: !canAb, v: 'self:' + u.gm.id }); }
      for (const k of new Set(aliveUnits(S.turn).filter(u => kd(u).shoot).map(u => vk(u.gm)))) {
        const u = aliveBy(S.turn, k)[0], sh = kd(u).shoot;
        if (u) h += btn('throwmode', `<img src="${KINDS[k].img}" class="uimg"> ${SHOTS[sh].name}${SHOTS[sh].magic ? ' &#10024;' : ''}`, { off: !canAb || !canShoot(sh), v: sh + ':' + u.gm.id });
      }
      if (aliveUnits(S.turn).some(u => kd(u).tosser))
        h += btn('dtool', '<img src="img/djmm.png" class="uimg"> DJ Throw', { v: 'djpick', on: S.dtool === 'djpick', off: !canAb || !djReach(S.turn).length });
      const tp = abilityUnit(S.turn, 'tele');
      if (tp) h += btn('dtool', `<img src="${KINDS[vk(tp.gm)].img}" class="uimg"> Teleport`, { v: 'tele', on: S.dtool === 'tele', off: !canAb });
      const bl = abilityUnit(S.turn, 'bless');
      if (bl && !bl.gm.blessed) h += btn('dtool', `<img src="${KINDS[vk(bl.gm)].img}" class="uimg"> 3 Hearts`, { v: 'bless', on: S.dtool === 'bless' });
      if (S.magic) h += `<span class="note">Magic ${S.magic}/${MAGIC_PER_TURN}</span>`;
      return main + h + '</div>';
    }
    return `<div class="note">${S.act === 'fly' ? 'Fire!' : 'Waiting for everything to stop moving...'}</div>`;
  }
  function statusHTML() {
    const row = side => {
      let n, king;
      if (S.phase === 'battle') { n = soldiers(side); const k = aliveUnits(side, 'king')[0]; king = k ? k.gm.hp : 0; }
      else { const u = S.layouts[side].units, k = u.find(x => x.kind === 'king'); n = u.filter(x => isSoldier(x.kind)).length; king = k ? kdOf('king', k.up, k.ab).hp : 0; }
      return `<div class="st" style="border-color:${TEAM[side].col}"><img src="img/endo.png"> ${n} <img src="img/freddy.png"> ${'&#10084;'.repeat(king) || '&#10006;'}</div>`;
    };
    return row('blue') + row('red');
  }
  function bannerHTML() {
    const t = s => `<span style="color:${TEAM[s].col}">${TEAM[s].name}</span>`;
    const lvl = S.mode === 'campaign' ? `LEVEL ${S.level + 1}: ${LEVELS[S.level].name.toUpperCase()} &middot; ` : '';
    if (S.phase === 'build') return `${lvl}${t(bs())} BUILD YOUR FORTRESS`;
    if (S.phase === 'units') return `${lvl}${t(bs())} PLACE 9 ENDOS + KING FREDDY`;
    if (S.result) return S.result === 'draw' ? 'DRAW' : `${t(S.result)} WINS`;
    if (S.final) return `${t(S.final)} FINAL SHOT`;
    const you = S.mode !== 'hotseat' ? (localCtrl(S.turn) ? ' (you)' : S.cpu === S.turn ? ' (CPU)' : '') : '';
    return `${lvl}${t(S.turn)}'S TURN${you}`;
  }

  // --- the gold equipment bar during a match: drag a mask onto one of your Endos
  // who may drag masks right now: while placing units, and at ANY moment of the battle (either player's turn)
  function equipSides() {
    if (!S) return [];
    if (S.phase === 'units' && !S.ready[bs()]) return [bs()];
    if (S.phase !== 'battle' || S.result) return [];
    if (S.mode === 'hotseat') return ['blue', 'red'];
    return [S.mode === 'online' ? S.mySide : 'blue'];
  }
  function equipHTML() {
    const sides = equipSides();
    const boxes = sides.length === 2 ? [['equip', 'blue'], ['equip2', 'red']] : [['equip', sides[0]], ['equip2', null]];
    for (const [id, side] of boxes) {
      const box = $(id);
      if (!side || !S.equip[side].some(Boolean)) { box.classList.add('hidden'); continue; }
      box.classList.remove('hidden');
      box.dataset.side = side;
      box.style.borderColor = TEAM[side].col;
      box.innerHTML = S.equip[side].map((iid, i) => iid && ITEMS[iid]
        ? `<div class="eslot${S.used[side].includes(i) ? ' used' : ''}" data-i="${i}" title="${ITEMS[iid].name}"><img src="${ITEMS[iid].img}" draggable="false"></div>` : '').join('');
    }
  }
  // an Endo, or an Endo already wearing a mask (a mask can be swapped for another)
  const maskable = k => k === 'endo' || Object.values(ITEMS).some(it => it.kind === k);
  // swapping a mask destroys the one that was on: it leaves the inventory and the gold bar for good
  function loseMask(side, kind) {
    const id = Object.keys(ITEMS).find(i => ITEMS[i].kind === kind);
    if (!id) return;
    const owned = Store.get('owned');
    if (owned[id]) {
      owned[id] = false; Store.set('owned', owned);
      Store.set('equip', Store.get('equip').map(x => (x === id ? null : x)));
    }
    for (const s of ['blue', 'red']) S.equip[s] = S.equip[s].map(x => (x === id ? null : x));
    toast(`The ${ITEMS[id].name} was destroyed - the shop has a new one to buy`);
  }
  let drag = null;
  function onEquipDown(e) {
    const el = e.target.closest('.eslot'), box = e.target.closest('[data-side]');
    const side = box && box.dataset.side;
    if (!el || !side || !equipSides().includes(side) || el.classList.contains('used')) return;
    e.preventDefault();
    const i = +el.dataset.i, id = S.equip[side][i];
    const g = $('dragGhost');
    g.src = ITEMS[id].img; g.classList.remove('hidden');
    drag = { i, id, side };
    moveGhost(e);
    window.addEventListener('pointermove', moveGhost);
    window.addEventListener('pointerup', dropEquip, { once: true });
  }
  function moveGhost(e) { const g = $('dragGhost'); g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; }
  function dropEquip(e) {
    window.removeEventListener('pointermove', moveGhost);
    $('dragGhost').classList.add('hidden');
    const d = drag; drag = null;
    if (!d || !S || !equipSides().includes(d.side)) return;
    const w = toWorld(e.clientX, e.clientY), kind = ITEMS[d.id].kind;
    // a King upgrade goes on the King (swapping one destroys the old one, like masks); a mask goes on an Endo
    const up = !!KINDS[kind].kingUp, bad = up ? 'Drop the King upgrade onto your King' : 'Drop the mask onto one of your Endos';
    const fits = k => (up ? k === 'king' : maskable(k));
    let ab = null;
    if (S.phase === 'units') {
      const c = Math.floor(w.x / CELL), r = Math.floor(w.y / CELL);
      const u = S.layouts[d.side].units.find(u => u.c === c && u.r === r);
      if (!u || !fits(u.kind)) { Sfx.play('bad'); toast(bad); return; }
      if (up) { if (u.up) loseMask(d.side, u.up); u.up = kind; delete u.ab; }
      else { if (u.kind !== 'endo') loseMask(d.side, u.kind); u.kind = kind; }
    } else {
      const u = units.find(u => !u.gm.dead && u.gm.side === d.side && Math.hypot(u.position.x - w.x, u.position.y - w.y) < CELL * 0.8);
      if (!u || !fits(u.gm.kind)) { Sfx.play('bad'); toast(bad); return; }
      if (up ? u.gm.up : u.gm.kind !== 'endo') loseMask(d.side, up ? u.gm.up : u.gm.kind);
      if (KINDS[kind].mystery) ab = rollMystery();
      doAct({ t: 'mask', id: u.gm.id, kind, ab });
      if (S.mode === 'online' && !isAuth()) S.maskPending.push({ id: u.gm.id, kind, ab });
    }
    S.used[d.side].push(d.i);
    Sfx.play('magic');
    if (ab) return;
    if (!document.getElementById('toast').textContent.includes('destroyed')) toast(up ? `Your King became ${KINDS[kind].name}!` : `An Endo became ${KINDS[kind].name}!`);
  }

  function onBar(a, v) {
    Sfx.play('click');
    const side = S.phase === 'build' || S.phase === 'units' ? bs() : null;
    switch (a) {
      case 'mat': S.tool = 'block'; S.mat = v; if (!shapesFor(v).includes(S.shape)) S.shape = shapesFor(v)[0]; break;
      case 'shape': S.tool = 'block'; S.shape = v; break;
      case 'erase': S.tool = 'erase'; break;
      case 'autofort':
      {
        const saved = Store.get('forts') || [], FS = fortStyles(), n = FS.length + saved.length;
        const i = S.autoStyle[side] = (S.autoStyle[side] + 1) % n;
        if (i < FS.length) S.layouts[side] = genFort(side, { style: FS[i] });
        else S.layouts[side] = loadFort(side, saved[i - FS.length]);
        S.doorPending[side] = null; S.used[side] = [];
        const name = i < FS.length ? FORT_NAMES[FS[i]] : saved[i - FS.length].name;
        toast(`Auto Fort: ${name} (${i + 1}/${n}) - tap again for another style`); break;
      }
      case 'savefort': saveFort(side); break;
      case 'clear': S.layouts[side].blocks = []; S.layouts[side].units = []; S.doorPending[side] = null; S.used[side] = []; break;
      case 'tounits':
        if (S.doorPending[side]) { Sfx.play('bad'); toast('Place the RED exit door for your gold door first'); break; }
        S.phase = 'units'; S.unitTool = unitsLeft(side).king ? 'king' : 'endo'; break;
      case 'tobuild': S.phase = 'build'; break;
      case 'unit': S.unitTool = v; break;
      case 'autounits': autoUnits(side); break;
      case 'ready': readyUp(side); break;
      case 'cannon': doAct({ t: 'mode', v: 'cannon' }); break;
      case 'dice': doAct({ t: 'mode', v: 'dice' }); break;
      case 'zoom':
        if (v === 'fit') { unfreeCam(); refocus(); break; }
        freeCam(); zoomAt(SW / 2, SH / 2, v === 'in' ? 1.35 : 1 / 1.35); break;
      case 'hitcannon': { const u = units.find(x => x.gm.id === S.sel && !x.gm.dead); if (u && canHitCannon(u) && S.pts > 0) doAct({ t: 'hitcannon', id: u.gm.id }); break; }
      case 'revive': {
        const ft = abilityUnit(S.turn, 'revive'), sp = ft && reviveSpot(ft);
        if (sp) doAct({ t: 'revive', i: +v, c: sp.c, r: sp.r });
        break;
      }
      case 'back': doAct({ t: 'back' }); break;
      case 'roll': if (S.pts <= 0 && S.rolls > 0 && !S.rolling) doAct({ t: 'roll', v: rollDie() }); break;
      case 'ammo': doAct({ t: 'ammo', v }); break;
      case 'dtool':
        S.dtool = v; S.sel = null;
        if (v === 'djpick') toast('Tap the comrade DJ Music Man should throw (or grab one next to him and drag back)');
        if (v === 'tele') toast('Tap a glowing square next to one of your units - Pitch Black Ennard appears there');
        if (v === 'bless') toast('Tap the unit Dread Bear should give 3 hearts to (once a match)');
        if (v === 'remove') toast('Tap one of YOUR blocks to take it away (stone 2 points, wood or glass 1)');
        if (v === 'wood' || v === 'glass' || v === 'stone') toast('New blocks can only go in the battlefield (the middle)');
        if (v === 'cloud') toast('Put clouds out in the battlefield, then build on them to cross - anything that falls is lost');
        break;
      case 'endroll': doAct({ t: 'endroll' }); break;
      case 'endturn': doAct({ t: 'endturn' }); break;
      case 'throwmode': {
        const [kind, id] = String(v).includes(':') ? v.split(':') : ['cupcake', v];
        if (!S.rolling && (S.pts > 0 || S.rolls > 0)) doAct({ t: 'throwmode', id: +id, kind });
        break;
      }
      case 'throwcancel': doAct({ t: 'throwcancel' }); break;
    }
    hudSig = '';
  }
  function readyUp(side) {
    S.ready[side] = true;
    S.hover = null;
    rollMysteries(S.layouts[side]);                  // Unidentified Freddy's ability for this match
    if (S.mode === 'online') {
      Net.send({ type: 'layout', side, layout: S.layouts[side], looks: S.looks[side] });
      if (S.ready.blue && S.ready.red) startBattle();
    } else if (S.mode === 'campaign') startBattle();
    else if (side === 'blue') {
      S.buildSide = 'red'; S.phase = 'build';
      showOverlay('pass', { side: 'red' });
    } else startBattle();
  }

  // ------------------------------------------------------------------ overlays / messages
  let toastT = null;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }
  let bigT = null;
  function bigText(msg, col) {
    const b = $('bigText'); b.textContent = msg; b.style.color = col || '#fff';
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(bigT); bigT = setTimeout(() => b.classList.remove('show'), 1600);
  }
  // a campaign level's enemy army: King (with his upgrade) and the masks, as little heads
  function lineupHTML(L) {
    const heads = [L.king || 'king', ...(L.kinds || [])];
    const ball = L.ball && BALL_POWERS[L.ball] ? ` + <img src="${BALL_POWERS[L.ball].img}" title="${BALL_POWERS[L.ball].name}">` : '';
    return `<div class="lineup">ENEMY: ${heads.map(k => `<img src="${KINDS[k].img}" title="${KINDS[k].name}">`).join('')}${ball}${L.kinds && L.kinds.length ? '' : ' <small>just Endos</small>'}</div>`;
  }
  function showOverlay(kind, o = {}) {
    const ov = $('overlay');
    let h = '';
    if (kind === 'pass') {
      h = `<h2 style="color:${TEAM[o.side].col}">${TEAM[o.side].name}'S TURN TO BUILD</h2>${mapLine()}<p>Pass the device to ${TEAM[o.side].name}.<br>${TEAM[other(o.side)].name}, no peeking!</p>
        <button class="mbtn" data-o="build">START BUILDING</button>`;
    } else if (kind === 'intro') {
      const L = LEVELS[S.level];
      h = `<h2>LEVEL ${S.level + 1}: ${L.name.toUpperCase()}</h2>${mapLine()}<p>The enemy's fortress is already built and hidden.<br>Build yours, place your army, then out-shoot the CPU.</p>
        ${lineupHTML(L)}<button class="mbtn" data-o="close">BUILD</button>`;
    } else if (kind === 'battle') {
      h = `<h2>BATTLE!</h2><p>Each turn: <b>fire the cannon</b> once, or <b>roll the dice 3 times</b> to move units and repair.<br>
        Your own cannonballs fly straight through everything that's yours. Wipe out all 9 enemy soldiers to win.</p><p style="color:${TEAM.blue.col}"><b>BLUE goes first.</b></p><button class="mbtn" data-o="close">FIGHT!</button>`;
    } else if (kind === 'pause') {
      h = `<h2>PAUSED</h2><button class="mbtn" data-o="close">RESUME</button><button class="mbtn" data-o="aimtoggle">AIMER: ${Store.get('aimOn') ? 'ON' : 'OFF'}</button>
        <button class="mbtn red" data-o="quit">QUIT MATCH</button>`;
    } else if (kind === 'result') {
      const camp = S.mode === 'campaign';
      const title = camp ? (o.outcome === 'win' ? `LEVEL ${S.level + 1} COMPLETE!` : o.outcome === 'draw' ? 'DRAW!' : 'LEVEL FAILED') : o.res === 'draw' ? 'DRAW!' : `${TEAM[o.res].name} WINS!`;
      const col = o.res === 'draw' ? '#ffe04a' : TEAM[o.res].col;
      const who = S.mode === 'online' ? `You ${o.outcome === 'win' ? 'won' : o.outcome === 'draw' ? 'drew' : 'lost'}.` : '';
      let btns = '';
      if (camp && o.outcome === 'win' && S.level < LEVELS.length - 1) btns += '<button class="mbtn" data-o="next">NEXT LEVEL</button>';
      if (camp && o.outcome !== 'win') btns += '<button class="mbtn" data-o="retry">TRY AGAIN</button>';
      h = `<h2 style="color:${col}">${title}</h2><p>${who} <span class="coin">${o.coins < 0 ? '' : '+'}${o.coins}</span> coins</p><p class="small">Win +10 &middot; Draw +5 &middot; Loss -10</p>
        ${btns}<button class="mbtn gray" data-o="quit">${camp ? 'CAMPAIGN' : 'MAIN MENU'}</button>`;
    } else if (kind === 'left') {
      h = `<h2>YOU WIN!</h2><p>${o.reason || 'Your opponent left.'}</p><p>They lose the match. <span class="coin">+${o.coins || 0}</span> coins</p><button class="mbtn" data-o="quit">BACK TO LOCAL</button>`;
    }
    ov.innerHTML = `<div class="panel">${h}</div>`;
    ov.classList.remove('hidden');
  }
  function onOverlay(a) {
    Sfx.play('click');
    const ov = $('overlay');
    if (a === 'close' || a === 'build') {
      ov.classList.add('hidden');
      if (a === 'build') lookBuild();
    } else if (a === 'aimtoggle') { Store.set('aimOn', !Store.get('aimOn')); showOverlay('pause'); }
    else if (a === 'next' || a === 'retry') {
      const lv = S.level + (a === 'next' ? 1 : 0);
      ov.classList.add('hidden'); stop(); start({ mode: 'campaign', level: lv });
    } else if (a === 'quit') {
      const wasCampaign = S && S.mode === 'campaign', mode = S && S.mode;
      if (S && !S.result && (mode === 'online' || mode === 'campaign')) {      // walking out of a match is a loss
        Store.reward('loss'); Store.set('activeMatch', false);
        setTimeout(() => window.UI && UI.toast('You left the match - that counts as a loss (-10 coins)'), 300);
      }
      ov.classList.add('hidden'); stop(); if (api.onExit) api.onExit(wasCampaign, mode);
    }
  }

  // ------------------------------------------------------------------ input
  const ptrs = new Map();
  let gest = null;
  const aimingNow = () => S && S.phase === 'battle' && (S.act === 'aim' || S.act === 'throw') && myTurn();
  // the fighters (by picture: a King's upgrade counts as its own) that can be launched, and the units wearing one
  const abilityUnit = (side, flag) => aliveUnits(side).find(u => kd(u)[flag]);
  const aliveBy = (side, key) => aliveUnits(side).filter(u => vk(u.gm) === key);
  const launchKeys = side => [...new Set(aliveUnits(side).filter(canLaunch).map(u => vk(u.gm)))];
  const launchable = (side, key) => aliveBy(side, key).filter(canLaunch);
  function onDown(e) {
    if (!S) return;
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      gest = cam.lock && !diceCam() ? { t: 'none' } : { t: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      S.aimVec = null;
    } else if (ptrs.size === 1) {
      if (aimingNow()) { gest = { t: 'aim', ox: e.clientX, oy: e.clientY }; S.aimVec = { x: 0, y: 0 }; return; }
      // on a dice turn, grabbing a launchable fighter and dragging back launches him
      if (S.phase === 'battle' && myTurn() && S.act === 'dice' && !S.rolling && (S.pts > 0 || S.rolls > 0)) {
        const w = toWorld(e.clientX, e.clientY), dj = djReach(S.turn);
        // what dragging this unit back does: launch itself, its shot, or DJ Music Man throws it
        const pickKind = u => canLaunch(u) ? 'self' : kd(u).shoot && canShoot(kd(u).shoot) ? kd(u).shoot : dj.includes(u) ? 'dj' : null;
        const u = units.find(u => !u.gm.dead && u.gm.side === S.turn && pickKind(u) && Math.hypot(u.position.x - w.x, u.position.y - w.y) < CELL * 0.75);
        if (u) { gest = { t: 'launchpick', ox: e.clientX, oy: e.clientY, id: u.gm.id, kind: pickKind(u) }; return; }
      }
      gest = { t: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    }
  }
  function onMove(e) {
    if (!S) return;
    const w = toWorld(e.clientX, e.clientY);
    S.hover = { c: Math.floor(w.x / CELL), r: Math.floor(w.y / CELL) };
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gest) return;
    if (gest.t === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (cam.lock) freeCam();
      cam.x -= (mx - gest.mx) / cam.z; cam.y -= (my - gest.my) / cam.z;
      zoomAt(mx, my, d / (gest.d || d));
      gest.d = d; gest.mx = mx; gest.my = my;
    } else if (gest.t === 'pan') {
      const dx = e.clientX - gest.sx, dy = e.clientY - gest.sy;
      if (Math.hypot(dx, dy) > 9) gest.moved = true;
      if (gest.moved && (!cam.lock || diceCam())) {
        if (cam.lock && !cam.free) { freeCam(); gest.cx = cam.x + dx / cam.z; gest.cy = cam.y + dy / cam.z; }
        cam.x = gest.cx - dx / cam.z; cam.y = gest.cy - dy / cam.z; clampCam();
      }
    } else if (gest.t === 'aim') {
      S.aimVec = { x: e.clientX - gest.ox, y: e.clientY - gest.oy };
    } else if (gest.t === 'launchpick' && Math.hypot(e.clientX - gest.ox, e.clientY - gest.oy) > 14) {
      doAct({ t: 'throwmode', id: gest.id, kind: gest.kind });
      gest = { t: 'aim', ox: gest.ox, oy: gest.oy, fromPick: true };
      S.aimVec = { x: e.clientX - gest.ox, y: e.clientY - gest.oy };
    }
  }
  function onUp(e) {
    if (!S) return;
    const had = ptrs.has(e.pointerId);
    ptrs.delete(e.pointerId);
    if (!had || !gest) return;
    if (gest.t === 'pinch' || gest.t === 'none') { if (ptrs.size === 0) gest = null; else gest = { t: 'none' }; return; }
    if (gest.t === 'aim') {
      const throwing = S.act === 'throw';
      const v = S.aimVec ? aimVelocity(S.aimVec, throwing ? THROW_V[S.throwKind] : VMAX) : { pow: 0 };
      S.aimVec = null;
      if (v.pow > 0.08 && aimingNow()) {
        const r3 = n => Math.round(n * 1000) / 1000;
        if (throwing) doAct({ t: 'throw', id: S.throwBy, kind: S.throwKind, vx: r3(v.vx), vy: r3(v.vy) });
        else {
          const tb = S.ammo !== 'ball' && S.ammo !== 'power' && launchable(S.turn, S.ammo)[0];
          doAct({ t: 'shot', vx: r3(v.vx), vy: r3(v.vy), tb: tb ? tb.gm.id : null, power: S.ammo === 'power' });
        }
      } else if (throwing && gest.fromPick) doAct({ t: 'throwcancel' });     // a grab that wasn't pulled back: give the roll back
    } else if (gest.t === 'launchpick' && e.type === 'pointerup') tap(e.clientX, e.clientY);
    else if (gest.t === 'pan' && !gest.moved && e.type === 'pointerup') tap(e.clientX, e.clientY);
    if (ptrs.size === 0) gest = null;
  }
  function tap(sx, sy) {
    const w = toWorld(sx, sy), c = Math.floor(w.x / CELL), r = Math.floor(w.y / CELL);
    S.hover = { c, r };
    if (S.phase === 'build' || S.phase === 'units') { if (!S.ready[bs()]) buildTap(c, r); return; }
    if (S.phase !== 'battle' || !myTurn() || S.rolling) return;
    const ar = arrowAt(c, r);
    if (ar && ar.side === S.turn && (S.act === 'choose' || S.act === 'dice')) { doAct({ t: 'flip', id: ar.id }); return; }
    if (S.act !== 'dice') return;
    if (S.dtool === 'bless') {                              // Dread Bear's gift is free (once a match)
      const d = abilityUnit(S.turn, 'bless');
      const t = units.find(u => !u.gm.dead && u.gm.side === S.turn && u !== d && Math.hypot(u.position.x - w.x, u.position.y - w.y) < CELL * 0.7);
      if (d && t && !d.gm.blessed) { S.dtool = 'move'; doAct({ t: 'bless', id: d.gm.id, to: t.gm.id }); }
      else { Sfx.play('bad'); toast('Tap one of your units (not the King himself)'); }
      return;
    }
    if (S.dtool === 'djpick' || S.dtool === 'tele') {     // the two abilities that spend a roll by tapping
      if (!(S.pts > 0 || S.rolls > 0)) { toast('No rolls left'); return; }
      if (S.dtool === 'djpick') {
        const u = djReach(S.turn).find(u => Math.hypot(u.position.x - w.x, u.position.y - w.y) < CELL * 0.7);
        if (u) { S.dtool = 'move'; doAct({ t: 'throwmode', id: u.gm.id, kind: 'dj' }); }
        else { Sfx.play('bad'); toast('Tap a comrade touching DJ Music Man'); }
      } else {
        const en = abilityUnit(S.turn, 'tele');
        if (en && teleCells(en).some(t => t.c === c && t.r === r)) { S.dtool = 'move'; doAct({ t: 'tele', id: en.gm.id, c, r }); }
        else { Sfx.play('bad'); toast('Tap a glowing square next to one of your units'); }
      }
      return;
    }
    const selU = units.find(u => u.gm.id === S.sel && !u.gm.dead);
    const freeBreak = S.dtool === 'move' && selU && breakTargets(selU).some(o => o.cost === 0);
    if (S.pts <= 0 && !hasBonus() && !freeBreak) { toast(S.rolls > 0 ? 'Roll the dice first!' : 'No points left'); return; }
    if (S.dtool === 'remove') {
      const b = solidAt(w.x, w.y);
      if (b && b.gm && b.gm.type === 'block' && b.gm.side === S.turn) {
        if (S.pts >= unbuildCost(b)) doAct({ t: 'unbuild', bid: b.gm.id });
        else { Sfx.play('bad'); toast(`Removing that costs ${unbuildCost(b)} points`); }
      } else { Sfx.play('bad'); toast('Tap one of your own blocks'); }
      return;
    }
    if (S.dtool === 'move') {
      const selC = units.find(u => u.gm.id === S.sel && !u.gm.dead), foeC = CANNON[other(S.turn)];
      if (selC && canHitCannon(selC) && Math.hypot(w.x - foeC.x, w.y - foeC.y) < CELL * 2.2) { doAct({ t: 'hitcannon', id: selC.gm.id }); return; }
      const mine = units.find(u => !u.gm.dead && u.gm.side === S.turn && Math.hypot(u.position.x - w.x, u.position.y - w.y) < CELL * 0.6);
      if (mine) { S.sel = mine.gm.id; Sfx.play('click'); return; }
      const sel = units.find(u => u.gm.id === S.sel && !u.gm.dead);
      if (!sel) return;
      const t = canStep(sel) && moveTargets(sel).find(t => t.c === c && t.r === r);
      if (t) { doAct({ t: 'move', id: sel.gm.id, c, r }); return; }
      const hit = solidAt(w.x, w.y), br = hit && breakTargets(sel).find(o => o.b === hit);
      if (br) {
        if (S.pts >= br.cost) doAct({ t: 'break', id: sel.gm.id, bid: hit.gm.id });
        else { Sfx.play('bad'); toast(`Breaking ${MAT[hit.gm.mat].name.toLowerCase()} costs ${br.cost} points`); }
        return;
      }
      Sfx.play('bad');
      toast(canStep(sel) ? 'Pick a green square next to your unit (not inside blocks or other units)' : 'That unit has no steps left - roll again or pick Foxy');
    } else {
      if (canRepair(S.dtool, c, r)) doAct({ t: 'place', mat: S.dtool, c, r });
      else {
        Sfx.play('bad');
        const z = zoneOf(c);
        toast(S.pts < (S.dtool === 'cloud' ? CLOUD_COST : MAT[S.dtool].dice) ? 'Not enough points' : z !== 'field' ? 'New blocks can only go in the battlefield (the middle)' : 'That square is taken');
      }
    }
  }
  function onWheel(e) {
    if (!S) return;
    e.preventDefault();
    if (cam.lock && !diceCam()) return;
    if (cam.lock) freeCam();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }
  function onKey(e) {
    if (!S || !running) return;
    if (e.key === 'Escape') showOverlay('pause');
    if (e.key === 'r' && myTurn() && S.act === 'dice') onBar('roll');
  }

  // ------------------------------------------------------------------ network messages (local play)
  function netMsg(m) {
    if (!S) return;
    if (m.type === 'layout') {
      S.layouts[m.side] = m.layout; S.ready[m.side] = true;
      if (m.looks) { S.looks[m.side] = m.looks; applyTeamLooks(); }
      nextId = Math.max(nextId, ...m.layout.blocks.map(b => b.id + 1), ...m.layout.units.map(u => u.id + 1), 1);
      if (S.ready.blue && S.ready.red && S.phase !== 'battle') startBattle();
    } else if (m.type === 'act') doAct(m.a, true);
    else if (m.type === 'sync') {
      if (S.phase !== 'battle') return;
      applySnapshot(m.snap, m.st.fled || []);
      S.final = m.st.final;
      if (m.st.cannonDown) S.cannonDown = m.st.cannonDown;
      if (m.st.cannonHp) S.cannonHp = m.st.cannonHp;
      if (m.st.heat) { S.heat = m.st.heat; S.cool = m.st.cool; }
      if (m.st.powerUsed) S.powerUsed = m.st.powerUsed;
      // a mask put on during the other phone's turn may have crossed its turn-end snapshot: put it back on
      for (const mk of S.maskPending) { const u = units.find(x => x.gm.id === mk.id); if (u && (KINDS[mk.kind].kingUp ? u.gm.up !== mk.kind : u.gm.kind === 'endo')) doAct({ t: 'mask', id: mk.id, kind: mk.kind, ab: mk.ab }); }
      S.maskPending = [];
      if (m.st.retry) { S.maskPending = []; retryShot(); }
      else if (m.st.result) finish(m.st.result);
      else beginTurn(m.st.turn);
    } else if (m.type === 'setup') {
      if (S.phase === 'build' && !S.ready[S.mySide]) {
        applyMap(m.map, m.high);
        S.layouts[S.mySide] = { blocks: [], units: [] };
        lookBuild();
        toast(m.map === 'desert' ? `Map: Red Desert - ${TEAM[m.high].name} holds the high ground` : `Map: ${MAPS[m.map].name}`);
      }
    } else if (m.type === 'left') {
      // the other player walked out (or dropped): that's their loss and our win
      if (!S.result) {
        S.result = S.mySide; S.act = 'over';
        const coins = Store.reward('win'); Store.set('activeMatch', false);
        showOverlay('left', { reason: m.reason, coins });
      }
    }
    hudSig = '';
  }

  // ------------------------------------------------------------------ lifecycle
  let last = 0, acc = 0;
  function frame(t) {
    if (!running) return;
    const dt = Math.min(0.1, (t - last) / 1000 || 0);
    last = t;
    if (S.phase === 'battle' && engine) {
      acc += dt * 1000;
      let n = 0;
      while (acc >= STEP && n < 4) { physicsStep(); acc -= STEP; n++; }
      if (n === 4) acc = 0;
    }
    update(dt);
    draw(t);
    requestAnimationFrame(frame);
  }
  function init() {
    cv = $('game'); ctx = cv.getContext('2d');
    makePatterns(ctx);
    resize();
    window.addEventListener('resize', resize);
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerleave', () => { if (S && !ptrs.size) S.hover = null; });
    cv.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    $('hudBar').addEventListener('scroll', rowFades, true);
    window.addEventListener('resize', () => setTimeout(rowFades, 50));
    cv.addEventListener('contextmenu', e => e.preventDefault());
    $('hudBar').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && !b.disabled && S) onBar(b.dataset.a, b.dataset.v); });
    $('overlay').addEventListener('click', e => { const b = e.target.closest('[data-o]'); if (b) onOverlay(b.dataset.o); });
    $('hudMenu').addEventListener('click', () => { if (S) { Sfx.play('click'); showOverlay('pause'); } });
    $('zoomBtns').addEventListener('click', e => { const b = e.target.closest('[data-z]'); if (b && !cam.lock) zoomAt(SW / 2, SH / 2, b.dataset.z === 'in' ? 1.3 : 1 / 1.3); });
    $('equip').addEventListener('pointerdown', onEquipDown);
    $('equip2').addEventListener('pointerdown', onEquipDown);
  }
  function start(opts) {
    S = newState(opts);
    engine = null; blocks = []; clouds = []; units = []; balls = []; specials = []; parts = [];
    cam.lock = false; cam.t = null;
    applyTeamLooks();
    hudSig = '';
    $('hud').classList.remove('hidden');
    $('overlay').classList.add('hidden');
    resize();
    // which map: a campaign level has its own; otherwise it's a coin flip (the online host flips and tells the other phone)
    if (S.mode === 'campaign') { const L = LEVELS[S.level]; applyMap(L.map || 'field', L.high); }
    else if (S.mode === 'hotseat' || S.mySide === 'blue') {
      applyMap(pick(Object.keys(MAPS)), Math.random() < 0.5 ? 'red' : 'blue');
      if (S.mode === 'online') Net.send({ type: 'setup', map: S.map, high: S.high });
    } else applyMap('field');
    if (S.mode === 'campaign') {
      const L = LEVELS[S.level];
      S.layouts.red = genFort('red', { ...L, rng: mulberry(S.level * 7919 + 13) });
      rollMysteries(S.layouts.red);
      if (L.ball) S.looks.red.ball = L.ball;
      S.ready.red = true;
    }
    lookBuild();
    if (S.mode === 'hotseat') showOverlay('pass', { side: 'blue' });
    if (S.mode === 'campaign') showOverlay('intro');
    if (S.mode === 'online' || S.mode === 'campaign') Store.set('activeMatch', true);
    running = true; last = performance.now();
    requestAnimationFrame(frame);
  }
  function applyMap(map, high) {
    setMap(map, high);
    S.map = MAPK; S.high = HIGH;
  }
  const MAP_TIPS = { snow: 'a snowy hill in the middle', jungle: 'climb the trees and build on them', wasteland: 'a pit in the middle',
    towers: 'no ground - build on your concrete base; fall and you\'re gone' };
  const mapLine = () => S.map === 'desert' ? `<p class="mapline">MAP: <b>RED DESERT</b> - ${TEAM[S.high].name} holds the high ground</p>`
    : `<p class="mapline">MAP: <b>${MAPS[S.map].name.toUpperCase()}</b>${MAP_TIPS[S.map] ? ' - ' + MAP_TIPS[S.map] : ''}</p>`;
  function lookBuild() {
    const side = bs();
    lookAt((side === 'blue' ? BLUE_END / 2 : (RED_START + COLS) / 2) * CELL, (landFloor(side) - 11) * CELL, buildZoom());
  }
  function stop() {
    running = false;
    if (S && S.mode === 'online') Net.close();
    S = null; engine = null; cam.lock = false;
    $('hud').classList.add('hidden');
  }

  const api = {
    init, start, stop, netMsg, onExit: null, LEVELS, KINDS, ABILITIES, lineupHTML, preview, CANNON_THEMES, SKINS, TEAM_COLORS,
    get running() { return running; },
    // handles for the automated tests in debug/
    debug: {
      get S() { return S; }, get blocks() { return blocks; }, get clouds() { return clouds; }, get units() { return units; }, get balls() { return balls; },
      get specials() { return specials; }, get engine() { return engine; },
      genFort, autoUnits, readyUp, checkSpecials, canHitCannon, canRepair, get camFree() { return !!cam.free; }, applyTeamLooks, makeBall, landBall, freeze, isFrozen, killFx, get parts() { return parts; }, doAct, moveTargets, aimVelocity, cpuAim, snapshot, applySnapshot, onBar, tap, buildTap, makeBlock, makeUnit,
      CELL, H, W, CANNON, unitCell, cam, toScreen, refocus, frameTarget, sideRect, breakTargets, setMap, get GROUND() { return GROUND; },
      frameNow: () => { update(0); draw(performance.now()); },
      saveFort, loadFort, skinOf, FORT_STYLES, TOWER_STYLES, get MAPK() { return MAPK; }, MAPS, get clouds2() { return clouds; }, BALL_POWERS, powerOf, TEAM, ignite, djReach, teleCells, dusted, kd, reviveSpot, damageUnit, cpuShoot, LEVELS,
    },
  };
  return api;
})();
