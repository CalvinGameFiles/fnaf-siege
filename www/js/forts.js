'use strict';
// The 50 campaign forts (levels 1-14 on the Field and the Red Desert; from level 15 the Snowy Hill, the Jungle,
// the Volcano Wasteland and the Towers join in): each one is built for its level's name (a pirate ship in Pirate Cove, a claw machine in the
// West Arcade...), so no two levels look alike and none of them is an Auto Fort.
// Coordinates are in BLUE's land (columns 0-24, 24 = the front, facing the battlefield); F = the land's ground row.
// Tools (made by genFort): put(shape, mat, x, row) | col(x, base, h, mat) a column standing on row `base`
// | beam(x, row, w, mat) | fill(x, base, w, h, mat) | rope(x, row, len) | door(x1, r1, x2, r2) gold -> red
// | lift(x, row, shape, mat, top) a blue-arrow lift over (x, row) that turns back at row `top`
// | S([x, r], ...) soldier spots (first ones get the masks) | K(x, r) the King | m() stone or wood (stone as levels climb)
const LEVEL_FORTS = [
  // 1 Show Stage: a wooden stage on legs, curtain posts with drapes and spotlights, a podium in the middle
  { map: 'field', b({ put, col, beam, rope, S, K, F, m }) {
    for (const x of [4, 7, 8, 11, 12, 15, 16, 19, 20, 23]) put('s12', m(), x, F - 2);
    beam(4, F - 3, 20, 'wood');
    put('rr2', 'wood', 2, F - 2);
    col(4, F - 3, 8, 'wood'); col(23, F - 3, 8, 'wood');
    put('s31', 'wood', 3, F - 12); put('s31', 'wood', 22, F - 12);
    rope(5, F - 11, 6); rope(22, F - 11, 6);
    put('s11', 'glass', 4, F - 13); put('s11', 'glass', 23, F - 13);
    put('s11', 'stone', 13, F - 4);
    K(12, F - 4);
    S([7, F - 4], [9, F - 4], [11, F - 4], [15, F - 4], [17, F - 4], [19, F - 4], [5, F - 1], [9, F - 1], [14, F - 1], [18, F - 1]);
  } },
  // 2 Dining Area: four party tables with napkin folds, and the pizza counter with its till
  { map: 'field', b({ put, col, S, K, F, m }) {
    for (const x of [1, 5, 9, 13]) {
      put('s11', m(), x, F - 1); put('s11', m(), x + 2, F - 1); put('s31', 'wood', x, F - 2);
      put('rr1', 'plastic', x, F - 3); put('rl1', 'plastic', x + 2, F - 3);
      S([x + 1, F - 3], [x + 1, F - 1]);
    }
    put('s13', 'stone', 18, F - 3); put('s13', 'stone', 21, F - 3); put('s41', 'wood', 18, F - 4); put('s11', 'glass', 19, F - 5);
    col(23, F, 3, 'glass');
    K(20, F - 1); S([19, F - 1], [17, F - 1]);
  } },
  // 3 Backstage: piles of crates with spare heads on them, a costume rack with suits hanging, a work table, the back wall
  { map: 'desert', high: 'blue', b({ put, col, rope, S, K, F, m }) {
    put('s22', 'wood', 0, F - 2); put('s22', m(), 0, F - 4); put('s22', 'wood', 0, F - 6);
    put('s22', 'wood', 2, F - 2); put('s22', m(), 2, F - 4); put('s22', 'wood', 4, F - 2);
    put('s11', 'glass', 2, F - 5);
    put('s11', m(), 7, F - 1); put('s11', m(), 9, F - 1); put('s31', 'wood', 7, F - 2); put('s11', 'glass', 8, F - 3);
    col(12, F, 5, m); col(18, F, 5, m); put('s41', 'wood', 12, F - 6); put('s31', 'wood', 16, F - 6);
    rope(14, F - 5, 3); rope(16, F - 5, 3);
    col(23, F, 8, 'stone');
    K(8, F - 1);
    S([0, F - 7], [1, F - 7], [3, F - 5], [4, F - 3], [5, F - 3], [13, F - 1], [15, F - 1], [17, F - 1], [21, F - 1], [13, F - 7]);
  } },
  // 4 West Hall: one long low corridor, shut at the front, posters on its roof
  { map: 'field', b({ put, beam, S, K, F, m }) {
    for (const x of [1, 5, 9, 13, 17, 21]) put('s12', m(), x, F - 2);
    beam(1, F - 3, 24, 'wood'); beam(3, F - 4, 20, m);
    put('s12', 'stone', 24, F - 2);
    for (const x of [5, 13, 21]) put('s11', 'glass', x, F - 5);
    K(12, F - 1);
    S([2, F - 1], [4, F - 1], [6, F - 1], [8, F - 1], [10, F - 1], [14, F - 1], [16, F - 1], [18, F - 1], [22, F - 1]);
  } },
  // 5 East Hall: a corridor raised high on stilts, rope ladders down, a guard room at its far end
  { map: 'desert', high: 'red', b({ put, col, rope, S, K, F, m }) {
    for (const x of [4, 7, 10, 13, 16, 19, 22]) { col(x, F, 8, m); put('s31', 'wood', x - 1, F - 9); }
    put('s11', 'glass', 3, F - 10); put('s11', 'glass', 23, F - 10);
    put('s13', m(), 19, F - 12); put('s13', m(), 22, F - 12); put('s41', 'stone', 19, F - 13);
    rope(5, F - 8, 8); rope(14, F - 8, 8);
    K(20, F - 10);
    S([21, F - 10], [5, F - 10], [7, F - 10], [9, F - 10], [11, F - 10], [13, F - 10], [15, F - 10], [17, F - 10], [9, F - 1], [17, F - 1]);
  } },
  // 6 Supply Closet: one tall narrow stone closet packed with shelves, a mop and bucket and boxes of supplies outside
  { map: 'field', b({ put, col, S, K, F }) {
    col(16, F, 15, 'stone'); col(21, F, 15, 'stone');
    for (let k = 0; k < 5; k++) {
      const r = F - 3 - 3 * k;
      put('s12', 'wood', 17, r + 1); put('s12', 'wood', 20, r + 1); put('s41', k === 4 ? 'stone' : k % 2 ? 'stone' : 'wood', 17, r);
      if (k < 4) S([18, r - 1], [19, r - 1]);
    }
    put('s11', 'glass', 13, F - 1);
    put('s22', 'wood', 8, F - 2); put('s22', 'wood', 10, F - 2); put('s22', 'wood', 9, F - 4);
    K(18, F - 1); S([19, F - 1]);
  } },
  // 7 Pirate Cove: Foxy's ship - a hull with a captain's cabin, a mast with a yard, a crow's nest and a rope ladder
  { map: 'field', b({ put, col, beam, rope, S, K, F, m }) {
    beam(5, F - 1, 15, 'wood'); beam(5, F - 2, 15, m); beam(5, F - 3, 15, 'wood');
    put('rr2', 'wood', 3, F - 2); put('rl2', 'wood', 20, F - 2);
    put('s13', m(), 5, F - 6); put('s13', m(), 8, F - 6); put('s41', 'stone', 5, F - 7);
    col(14, F - 3, 6, 'wood'); put('s41', 'wood', 12, F - 10); col(14, F - 10, 5, 'wood'); put('s31', 'wood', 13, F - 16);
    put('s11', 'stone', 14, F - 17);
    rope(12, F - 9, 6);
    K(6, F - 4);
    S([13, F - 17], [15, F - 17], [13, F - 11], [15, F - 11], [10, F - 4], [16, F - 4], [18, F - 4], [9, F - 4], [7, F - 4]);
  } },
  // 8 Kitchen: a stone oven with a glass door and pots on top, a tall chimney, a two-door fridge, the long counter
  { map: 'field', b({ put, col, fill, S, K, F, m }) {
    fill(2, F, 6, 2, 'stone');
    put('s12', 'stone', 2, F - 4); put('s12', 'glass', 7, F - 4); put('s41', 'stone', 2, F - 5); put('s21', 'stone', 6, F - 5);
    put('s11', 'glass', 3, F - 6); put('s11', 'glass', 6, F - 6);
    col(0, F, 14, 'stone');
    col(10, F, 3, m); col(12, F, 3, m); put('s31', m(), 10, F - 4); col(10, F - 4, 4, m); col(12, F - 4, 4, m); put('s31', 'stone', 10, F - 9);
    put('s12', m(), 15, F - 2); put('s12', m(), 19, F - 2); put('s12', m(), 22, F - 2);
    put('s41', 'wood', 15, F - 3); put('s41', 'wood', 19, F - 3);
    put('s11', 'glass', 18, F - 4); put('s11', 'glass', 22, F - 4);
    K(11, F - 1);
    S([3, F - 3], [4, F - 3], [5, F - 3], [6, F - 3], [11, F - 5], [16, F - 1], [17, F - 1], [20, F - 1], [21, F - 1], [16, F - 4]);
  } },
  // 9 Restrooms: a row of seven stalls with a toilet in each, the sink and mirror at the back, a door that pops out on a stall wall
  { map: 'desert', high: 'blue', b({ put, door, S, K, F, m }) {
    put('s11', m(), 0, F - 1); put('s31', 'stone', 0, F - 2); put('s12', 'glass', 0, F - 4);
    for (const x of [3, 6, 9, 12, 15, 18, 21, 24]) put('s14', m(), x, F - 4);
    for (const x of [3, 6, 9, 12, 15, 18, 21]) { put('s11', 'glass', x + 1, F - 1); if (x !== 12) S([x + 1, F - 2]); }
    door(1, F - 3, 12, F - 5);
    K(14, F - 1);
    S([13, F - 2], [5, F - 1], [8, F - 1], [17, F - 1], [20, F - 1], [23, F - 1], [11, F - 1]);
  } },
  // 10 The Office: the stone office with its two big door frames and windows, a desk and fan, halls either side
  { map: 'field', b({ put, col, S, K, F, m }) {
    col(8, F, 5, 'stone'); col(16, F, 5, 'stone');
    put('s12', 'glass', 7, F - 2); put('s12', 'glass', 17, F - 2);
    put('s41', m(), 8, F - 6); put('s41', m(), 13, F - 6); put('s41', 'stone', 10, F - 7); put('s21', 'stone', 14, F - 7);
    put('s11', m(), 11, F - 1); put('s11', m(), 13, F - 1); put('s31', 'wood', 11, F - 2); put('s11', 'glass', 12, F - 3);
    col(1, F, 4, 'stone'); col(23, F, 4, 'stone'); put('s41', m(), 1, F - 5); put('s41', m(), 20, F - 5);
    K(12, F - 1);
    S([9, F - 1], [10, F - 1], [14, F - 1], [15, F - 1], [8, F - 7], [11, F - 8], [3, F - 1], [5, F - 1], [19, F - 1], [21, F - 1]);
  } },
  // 11 Prize Corner: the Puppet's giant gift box - a ribbon down its middle and a bow on its lid - a plush display, the ticket counter
  { map: 'desert', high: 'red', b({ put, col, S, K, F, m }) {
    col(12, F, 6, m); col(19, F, 6, m); col(15, F, 6, 'plastic'); col(16, F, 6, 'plastic');
    put('s41', 'stone', 12, F - 7); put('s41', 'stone', 16, F - 7);
    put('rr1', 'plastic', 14, F - 8); put('s11', 'plastic', 15, F - 8); put('rl1', 'plastic', 16, F - 8);
    put('s12', m(), 2, F - 2); put('s12', m(), 5, F - 2); put('s41', 'wood', 2, F - 3);
    put('s12', 'wood', 3, F - 5); put('s12', 'glass', 5, F - 5); put('s31', 'wood', 3, F - 6);
    col(21, F, 3, 'wood'); col(23, F, 3, 'wood'); put('s31', 'wood', 21, F - 4);
    K(13, F - 1);
    S([14, F - 1], [17, F - 1], [18, F - 1], [2, F - 4], [4, F - 7], [5, F - 7], [22, F - 1], [24, F - 1], [3, F - 1], [4, F - 1]);
  } },
  // 12 Game Area: five arcade cabinets (glass screens, glowing marquees) and a gumball machine
  { map: 'field', b({ put, S, K, F, m }) {
    for (const x of [1, 5, 9, 13, 17]) { put('s22', m(), x, F - 2); put('s21', 'glass', x, F - 3); put('s22', m(), x, F - 5); put('s21', 'plastic', x, F - 6); }
    put('s31', 'stone', 21, F - 1); put('s11', 'stone', 22, F - 2); put('s33', 'glass', 21, F - 5);
    K(20, F - 1);
    S([3, F - 1], [7, F - 1], [11, F - 1], [15, F - 1], [4, F - 1], [8, F - 1], [12, F - 1], [16, F - 1], [1, F - 7], [9, F - 7], [17, F - 7]);
  } },
  // 13 Kid's Cove: Mangle's tangle - three clouds with a forest of ropes hanging from them, play cubes on the floor
  { map: 'field', b({ put, rope, S, K, F }) {
    for (const x of [2, 9, 16]) put('c62', 'cloud', x, F - 14);
    for (const x of [3, 7, 10, 14, 17, 21]) rope(x, F - 12, 12);
    put('s22', 'plastic', 5, F - 2); put('s22', 'plastic', 11, F - 2); put('s22', 'plastic', 18, F - 2);
    put('s11', 'glass', 24, F - 1);
    K(12, F - 3);
    S([3, F - 15], [6, F - 15], [10, F - 15], [13, F - 15], [17, F - 15], [20, F - 15], [5, F - 3], [11, F - 3], [18, F - 3]);
  } },
  // 14 Parts & Service: a 3x3 parts rack with a spare head in every cubby, a chain hoist and a workbench
  { map: 'desert', high: 'red', b({ put, col, rope, S, K, F, m }) {
    for (let k = 0; k < 3; k++) {
      const b = F - 3 * k;
      for (const x of [1, 5, 9]) {
        put('s12', m(), x, b - 2); put('s12', m(), x + 3, b - 2); put('s41', m(), x, b - 3);
        put('s11', 'glass', x + 1, b - 1);
        if (k || x !== 9) S([x + 2, b - 1]);
      }
    }
    col(20, F, 7, 'stone'); put('s31', 'wood', 19, F - 8); rope(19, F - 7, 4);
    put('s11', m(), 22, F - 1); put('s11', m(), 24, F - 1); put('s31', 'wood', 22, F - 2);
    K(11, F - 1); S([23, F - 1]);
  } },
  // 15 Main Hall: two great stone pillars with statues on top, a crystal chandelier hanging from the ceiling cloud,
  // benches down the middle and a doorway at the front
  { map: 'jungle', b({ put, S, K, F }) {
    for (const x of [6, 17]) for (let i = 0; i < 4; i++) put('s22', 'stone', x, F - 2 - 2 * i);
    put('s11', 'stone', 6, F - 9); put('s11', 'glass', 6, F - 10); put('s11', 'stone', 18, F - 9); put('s11', 'glass', 18, F - 10);
    put('c62', 'cloud', 9, F - 18); put('s21', 'stone', 11, F - 16); put('s11', 'glass', 11, F - 15); put('s11', 'glass', 12, F - 15); put('s11', 'glass', 11, F - 14);
    put('s31', 'wood', 9, F - 1); put('s31', 'wood', 13, F - 1);
    put('s12', 'stone', 22, F - 2); put('s12', 'stone', 24, F - 2); put('s31', 'stone', 22, F - 3);
    K(12, F - 1);
    S([7, F - 9], [17, F - 9], [9, F - 19], [14, F - 19], [10, F - 2], [14, F - 2], [4, F - 1], [20, F - 1], [23, F - 1]);
  } },
  // 16 Party Room 1: a long table with a big frosted birthday cake on it, candles lit
  { map: 'snow', b({ put, col, beam, S, K, F, m }) {
    for (const x of [3, 7, 11, 15, 19]) col(x, F, 4, m);
    beam(3, F - 5, 19, 'wood');
    beam(6, F - 6, 13, 'wood'); beam(6, F - 7, 13, 'plastic'); beam(6, F - 8, 13, 'plastic');
    for (const x of [7, 11, 15]) { put('s12', 'glass', x, F - 10); put('s11', 'plastic', x, F - 11); }
    K(12, F - 1);
    S([9, F - 9], [13, F - 9], [17, F - 9], [4, F - 1], [5, F - 1], [8, F - 1], [16, F - 1], [20, F - 1], [9, F - 1]);
  } },
  // 17 Party Room 2: a donkey pinata hanging under a cloud, a rope up to it, party stools and a present
  { map: 'field', b({ put, rope, S, K, F }) {
    put('c62', 'cloud', 8, F - 16);
    put('s33', 'plastic', 9, F - 14); put('s21', 'plastic', 12, F - 14); put('s11', 'plastic', 9, F - 11); put('s11', 'plastic', 11, F - 11);
    rope(8, F - 14, 14); rope(13, F - 13, 4);
    put('s11', 'wood', 15, F - 1); put('s11', 'wood', 19, F - 1);
    put('s11', 'plastic', 10, F - 1); put('s11', 'plastic', 12, F - 1);
    put('s22', 'stone', 1, F - 2);
    K(0, F - 1);
    S([9, F - 17], [11, F - 17], [13, F - 17], [15, F - 2], [19, F - 2], [4, F - 1], [6, F - 1], [17, F - 1], [21, F - 1]);
  } },
  // 18 Party Room 3: a toppling heap of presents of every size with bows on top; soldiers tucked in the gaps
  { map: 'desert', high: 'blue', b({ put, S, K, F, m }) {
    put('s33', m(), 2, F - 3); put('s22', 'plastic', 5, F - 2); put('s33', m(), 8, F - 3); put('s22', 'wood', 12, F - 2);
    put('s33', m(), 15, F - 3); put('s22', 'plastic', 19, F - 2); put('s11', m(), 22, F - 1);
    put('s22', 'wood', 3, F - 5); put('s33', m(), 5, F - 5); put('s22', 'plastic', 9, F - 5); put('s33', m(), 12, F - 5);
    put('s22', 'wood', 16, F - 5); put('s21', m(), 19, F - 3);
    put('s33', m(), 3, F - 8); put('s22', 'wood', 9, F - 7); put('s22', 'plastic', 12, F - 7);
    put('rr1', 'plastic', 3, F - 9); put('rl1', 'plastic', 5, F - 9);
    put('rr1', 'plastic', 9, F - 8); put('rl1', 'plastic', 10, F - 8); put('rr1', 'plastic', 12, F - 8); put('rl1', 'plastic', 13, F - 8);
    K(11, F - 1);
    S([7, F - 1], [14, F - 1], [18, F - 1], [16, F - 6], [17, F - 6], [19, F - 4], [20, F - 4], [6, F - 6], [14, F - 6], [21, F - 1], [23, F - 1]);
  } },
  // 19 Party Room 4: two towers of pizza boxes stacked up on pegs, party hats on top, a party table in between
  { map: 'snow', b({ put, S, K, F, m }) {
    const tower = (x, n) => {
      for (let k = 0; k < n; k++) {
        const r = F - 3 * k;
        put('s12', m(), x, r - 2); put('s12', m(), x + 3, r - 2); put('s41', k % 2 ? 'plastic' : 'wood', x, r - 3);
        S([x + 1, r - 1], [x + 2, r - 1]);
      }
      put('rr1', 'plastic', x + 1, F - 3 * n - 1); put('rl1', 'plastic', x + 2, F - 3 * n - 1);
    };
    K(7, F - 1);
    tower(6, 3); tower(14, 2);
    put('s11', 'wood', 11, F - 1); put('s21', 'wood', 11, F - 2);
    S([12, F - 1], [20, F - 1], [2, F - 1], [22, F - 1]);
  } },
  // 20 Left Air Vent: five closed duct boxes stepping up and back, each on two stilts, grates at their ends, a fan on top
  { map: 'field', b({ put, col, S, K, F, m }) {
    for (let k = 0; k < 5; k++) {
      const xs = 20 - 4 * k, fr = F - 1 - 2 * k;
      if (k) { col(xs, F, 2 * k, m); col(xs + 3, F, 2 * k, m); }
      put('s41', m(), xs, fr); put('s11', m(), xs, fr - 1); put('s11', 'glass', xs + 3, fr - 1); put('s41', k % 2 ? 'wood' : 'stone', xs, fr - 2);
      if (k !== 2) S([xs + 1, fr - 1], [xs + 2, fr - 1]);
    }
    put('s22', 'glass', 5, F - 13);
    K(13, F - 6); S([14, F - 6], [1, F - 1]);
  } },
  // 21 Right Air Vent: a tall shaft with a rope up the middle and closed ducts branching off it left and right on struts
  { map: 'field', b({ put, col, rope, S, K, F, m }) {
    col(12, F, 3, 'stone'); col(15, F, 3, m); put('s41', m(), 12, F - 4); put('s11', 'stone', 12, F - 5); put('s11', 'glass', 15, F - 5); put('s41', m(), 12, F - 6);
    col(12, F - 6, 5, 'stone'); put('s11', 'stone', 12, F - 12);
    col(10, F, 7, 'stone'); col(7, F, 7, m); put('s41', m(), 7, F - 8); put('s11', 'stone', 10, F - 9); put('s11', 'glass', 7, F - 9); put('s41', m(), 7, F - 10);
    col(10, F - 10, 2, 'stone'); put('s11', 'stone', 10, F - 13);
    rope(11, F - 12, 12);
    K(14, F - 5);
    S([13, F - 5], [8, F - 9], [9, F - 9], [13, F - 1], [14, F - 1], [18, F - 1], [20, F - 1], [3, F - 1], [5, F - 1]);
  } },
  // 22 Toy Stage: a shiny solid stage, three star-topped pedestals, a chequered backdrop and a spotlight cloud
  { map: 'desert', high: 'red', b({ put, beam, S, K, F }) {
    beam(4, F - 1, 18, 'wood'); beam(4, F - 2, 18, 'plastic');
    put('s22', 'glass', 6, F - 4); put('s22', 'wood', 12, F - 4); put('s22', 'glass', 12, F - 6); put('s22', 'wood', 18, F - 4);
    for (const [x, r] of [[6, F - 5], [12, F - 7], [18, F - 5]]) { put('rr1', 'plastic', x, r); put('rl1', 'plastic', x + 1, r); }
    for (let k = 0; k < 5; k++) put('s22', k % 2 ? 'glass' : 'plastic', 2, F - 2 - 2 * k);
    put('rl2', 'wood', 22, F - 2);
    put('c31', 'cloud', 8, F - 18); put('s11', 'glass', 9, F - 17);
    K(11, F - 3);
    S([5, F - 3], [9, F - 3], [10, F - 3], [14, F - 3], [15, F - 3], [16, F - 3], [21, F - 3], [9, F - 19], [0, F - 1]);
  } },
  // 23 Security Booth (the Towers): a glass booth on a tall pillar with a rope ladder, a barrier arm and sandbags
  { map: 'towers', b({ put, rope, S, K, F, m }) {
    for (let i = 0; i < 6; i++) put('s22', i < 2 ? 'stone' : m(), 11, F - 2 - 2 * i);
    put('s41', 'stone', 10, F - 13);
    put('s12', 'glass', 10, F - 15); put('s12', 'glass', 13, F - 15); put('s41', 'stone', 10, F - 16); put('s12', 'wood', 12, F - 18);
    rope(10, F - 12, 12);
    put('s12', 'stone', 17, F - 2); put('s31', 'wood', 15, F - 3);
    put('s21', 'stone', 7, F - 1); put('s21', 'stone', 14, F - 1);
    K(11, F - 14);
    S([12, F - 14], [10, F - 17], [13, F - 17], [6, F - 1], [13, F - 1], [16, F - 1], [18, F - 1], [19, F - 1], [9, F - 1], [5, F - 1]);
  } },
  // 24 Fazbear Frights: a crooked two-storey haunted house, broken windows, a leaning roof up to a spired tower, a fence
  { map: 'wasteland', b({ put, col, door, S, K, F, m }) {
    for (const x of [6, 17]) { put('s12', m(), x, F - 2); put('s11', 'glass', x, F - 3); put('s11', m(), x, F - 4); }
    for (const x of [9, 10, 13, 14]) col(x, F, 4, m);
    put('s41', 'wood', 6, F - 5); put('s41', 'wood', 10, F - 5); put('s41', 'wood', 14, F - 5);
    for (const x of [7, 10, 11, 14, 15, 16]) col(x, F - 5, 3, m);
    put('s41', m(), 7, F - 9); put('s41', m(), 11, F - 9); put('s21', m(), 15, F - 9);
    put('rr2', 'wood', 7, F - 11); put('s22', 'wood', 9, F - 11); put('rr2', 'wood', 9, F - 13);
    put('s22', 'wood', 11, F - 11); put('s22', 'wood', 11, F - 13); put('rr2', 'wood', 11, F - 15);
    put('s11', 'glass', 13, F - 10);
    for (let i = 0; i < 4; i++) put('s22', i ? m() : 'stone', 15, F - 11 - 2 * i);
    put('rr1', 'wood', 15, F - 18); put('rl1', 'wood', 16, F - 18);
    for (const x of [19, 21, 23]) { put('s12', 'wood', x, F - 2); put('rr1', 'wood', x, F - 3); }
    door(0, F - 1, 13, F - 6);
    K(9, F - 6);
    S([8, F - 6], [12, F - 6], [7, F - 1], [8, F - 1], [11, F - 1], [12, F - 1], [15, F - 1], [16, F - 1], [20, F - 1], [22, F - 1]);
  } },
  // 25 Hallway Maze: a three-storey block of little cells - walls that never line up, holes in the floors, doors that jump
  { map: 'field', b({ put, door, S, K, F, m }) {
    const storey = (base, walls, pieces) => {
      for (const x of walls) put('s13', m(), x, base - 3);
      for (const [x, w] of pieces) put('s' + w + '1', m(), x, base - 4);
    };
    storey(F, [2, 6, 9, 13, 16, 20, 24], [[2, 4], [6, 3], [9, 4], [13, 3], [16, 4], [20, 4], [24, 1]]);
    storey(F - 4, [2, 5, 10, 12, 17, 21, 24], [[2, 3], [5, 4], [10, 2], [12, 4], [17, 4], [21, 3], [24, 1]]);
    storey(F - 8, [2, 7, 11, 14, 19, 24], [[2, 4], [7, 4], [11, 3], [14, 4], [19, 4], [24, 1]]);
    door(23, F - 5, 3, F - 9); door(0, F - 1, 13, F - 9);
    K(12, F - 1);
    S([4, F - 1], [7, F - 1], [10, F - 1], [14, F - 1], [18, F - 1], [22, F - 1], [7, F - 5], [15, F - 5], [19, F - 5], [5, F - 9], [8, F - 9], [15, F - 9], [21, F - 9]);
  } },
  // 26 Ballora Gallery: a music box with a ballerina dancing on its lid, a wind-up handle, a glass disco ball under a cloud
  { map: 'snow', b({ put, col, S, K, F, m }) {
    col(4, F, 3, m); col(20, F, 3, m); for (const x of [8, 12, 16]) put('s13', m(), x, F - 3);
    put('s41', m(), 4, F - 4); put('s41', m(), 8, F - 4); put('s41', m(), 12, F - 4); put('s41', m(), 16, F - 4); put('s11', m(), 20, F - 4);
    put('s11', 'stone', 12, F - 5); put('s12', 'glass', 12, F - 7); put('s31', 'plastic', 11, F - 8);
    put('s12', 'plastic', 12, F - 10); put('s31', 'plastic', 11, F - 11); put('s11', 'glass', 12, F - 12);
    put('s11', 'wood', 21, F - 1); put('s21', 'wood', 21, F - 2);
    put('c21', 'cloud', 2, F - 16); put('s11', 'glass', 2, F - 15);
    K(13, F - 1);
    S([5, F - 1], [6, F - 1], [10, F - 1], [14, F - 1], [18, F - 1], [6, F - 5], [9, F - 5], [16, F - 5], [18, F - 5], [3, F - 17]);
  } },
  // 27 Funtime Auditorium: bleachers climbing up to the back on thin legs, the show stage with speakers at the front
  { map: 'desert', high: 'blue', b({ put, col, fill, S, K, F, m }) {
    for (let k = 0; k < 5; k++) {
      const x = 12 - 3 * k;
      if (k) col(x + 1, F, 2 * k, m);
      put('s31', 'wood', x, F - 2 * k - 1); put('s11', m(), x, F - 2 * k - 2);
      if (k !== 4) S([x + 1, F - 2 * k - 2], [x + 2, F - 2 * k - 2]);
    }
    fill(17, F, 7, 2, 'wood'); put('s12', 'glass', 17, F - 4); put('s12', 'glass', 23, F - 4);
    K(1, F - 10);
    S([2, F - 10], [20, F - 3], [3, F - 1], [5, F - 1]);
  } },
  // 28 Circus Control: a striped big-top tent on rising poles, a flag on the centre pole, a trapeze cloud up high
  { map: 'field', b({ put, col, rope, S, K, F, m }) {
    for (let k = 0; k < 5; k++) {
      const st = k % 2 ? 'plastic' : m();
      if (k) { col(2 + 2 * k, F, 2 * k, st); col(23 - 2 * k, F, 2 * k, st); }
      put('rr2', st, 2 + 2 * k, F - 2 - 2 * k); put('rl2', st, 22 - 2 * k, F - 2 - 2 * k);
    }
    for (let i = 0; i < 5; i++) put('s22', i % 2 ? 'plastic' : m(), 12, F - 2 - 2 * i);
    put('s12', 'wood', 12, F - 12); put('s11', 'plastic', 12, F - 13);
    put('c31', 'cloud', 3, F - 20); rope(4, F - 19, 4);
    K(11, F - 1);
    S([5, F - 1], [7, F - 1], [9, F - 1], [14, F - 1], [16, F - 1], [18, F - 1], [20, F - 1], [3, F - 21], [5, F - 21]);
  } },
  // 29 Scooping Room: the Scooper - a stepped arm hanging from the ceiling cloud with its blade and cable, the conveyor belt below
  { map: 'jungle', b({ put, rope, S, K, F, m }) {
    put('c62', 'cloud', 2, F - 20);
    [[6, F - 18], [8, F - 17], [10, F - 16], [12, F - 15], [14, F - 14]].forEach(([x, r], i) => put('s22', i % 2 ? m() : 'stone', x, r));
    put('rl2', 'stone', 16, F - 14); put('rr2', 'stone', 14, F - 12);
    rope(13, F - 13, 6);
    for (const x of [8, 11, 12, 15, 16, 19, 20, 23]) put('s12', m(), x, F - 2);
    for (const x of [8, 12, 16, 20]) put('s41', 'wood', x, F - 3);
    put('s12', 'glass', 0, F - 2);
    K(2, F - 1);
    S([9, F - 4], [10, F - 4], [13, F - 4], [14, F - 4], [17, F - 4], [18, F - 4], [21, F - 4], [9, F - 1], [17, F - 1], [3, F - 21], [1, F - 1]);
  } },
  // 30 Private Room (the Towers): a sealed room on a stone plinth split by glass monitor banks, a keyhole door in, a lift outside
  { map: 'towers', b({ put, col, fill, door, lift, S, K, F }) {
    fill(6, F, 12, 3, 'stone');
    col(6, F - 3, 4, 'stone'); col(17, F - 3, 4, 'stone');
    for (const x of [9, 10, 13, 14]) col(x, F - 3, 4, 'glass');
    put('s41', 'stone', 6, F - 8); put('s41', 'wood', 10, F - 8); put('s41', 'stone', 14, F - 8);
    lift(18, F - 1, 's11', 'stone', F - 9);
    door(5, F - 1, 16, F - 4);
    K(12, F - 4);
    S([7, F - 4], [8, F - 4], [11, F - 4], [15, F - 4], [7, F - 9], [11, F - 9], [12, F - 9], [15, F - 9], [18, F - 3]);
  } },
  // 31 Sister Location: a deep elevator shaft with a working lift, a crawl vent along the ground, a cloud perch up top
  { map: 'field', b({ put, col, beam, lift, S, K, F, m }) {
    col(14, F, 18, 'stone'); col(17, F, 18, 'stone'); put('s41', 'stone', 14, F - 19);
    lift(15, F - 1, 's21', 'stone', null);
    for (const x of [2, 6, 10]) put('s11', m(), x, F - 1);
    beam(2, F - 2, 12, m);
    put('s11', 'glass', 5, F - 3); put('s11', 'glass', 9, F - 3);
    put('c42', 'cloud', 19, F - 22);
    K(15, F - 3);
    S([16, F - 3], [3, F - 1], [4, F - 1], [7, F - 1], [8, F - 1], [11, F - 1], [12, F - 1], [15, F - 20], [20, F - 23]);
  } },
  // 32 Pizzeria Simulator: your own shop - a glass shopfront, a big plastic sign on the roof, an awning, tables, a ball pit
  { map: 'desert', high: 'red', b({ put, col, S, K, F, m }) {
    for (const x of [4, 8, 12, 16]) col(x, F, 5, m);
    put('s12', m(), 20, F - 2); put('s13', 'glass', 20, F - 5);
    put('s41', m(), 4, F - 6); put('s41', m(), 8, F - 6); put('s41', m(), 12, F - 6); put('s41', m(), 16, F - 6); put('s11', m(), 20, F - 6);
    put('s12', m(), 9, F - 8); put('s12', m(), 15, F - 8); put('s41', 'plastic', 9, F - 9); put('s31', 'plastic', 13, F - 9);
    col(23, F, 5, 'wood'); put('s31', 'wood', 21, F - 6);
    for (const x of [6, 10, 14, 18]) put('s11', 'wood', x, F - 1);
    put('s12', 'glass', 0, F - 2); put('s11', 'plastic', 1, F - 1); put('s11', 'plastic', 2, F - 1); put('s11', 'plastic', 1, F - 2);
    K(13, F - 1);
    S([5, F - 1], [7, F - 1], [9, F - 1], [11, F - 1], [15, F - 1], [17, F - 1], [19, F - 1], [5, F - 7], [17, F - 7]);
  } },
  // 33 Salvage Room: the salvage chair - huge legs, a tall backrest and armrest - a workbench and a heap of scrap
  { map: 'wasteland', b({ put, col, S, K, F, m }) {
    col(8, F, 4, 'stone'); col(14, F, 4, 'stone'); put('s41', m(), 8, F - 5); put('s31', m(), 12, F - 5);
    col(8, F - 5, 8, 'stone'); col(9, F - 5, 8, m); put('s21', 'stone', 8, F - 14); col(14, F - 5, 2, 'wood');
    put('s12', m(), 18, F - 2); put('s12', m(), 21, F - 2); put('s41', 'wood', 18, F - 3); put('s11', 'glass', 20, F - 4);
    put('s22', m(), 0, F - 2); put('s11', 'wood', 2, F - 1); put('rr1', 'stone', 3, F - 1); put('s21', 'wood', 0, F - 3); put('rl2', m(), 4, F - 2);
    col(23, F, 9, 'wood'); put('s31', 'wood', 21, F - 10);
    K(11, F - 1);
    S([10, F - 6], [12, F - 6], [13, F - 6], [10, F - 1], [12, F - 1], [19, F - 1], [20, F - 1], [1, F - 4], [16, F - 1]);
  } },
  // 34 Candy Cadet Corner: Candy Cadet himself - four stout legs, a hollow body with a spine, a head with glass eyes
  // and an antenna, candy bowls held out in his hands
  { map: 'snow', b({ put, col, S, K, F, m }) {
    for (const x of [8, 11, 12, 14]) col(x, F, 4, 'stone');
    put('s41', 'stone', 8, F - 5); put('s31', 'stone', 12, F - 5);
    col(8, F - 5, 5, m); col(14, F - 5, 5, m); col(11, F - 5, 5, 'stone'); col(12, F - 5, 5, 'stone');
    put('s41', m(), 8, F - 11); put('s31', m(), 12, F - 11);
    put('s31', 'stone', 10, F - 12); put('s11', 'glass', 10, F - 13); put('s11', m(), 11, F - 13); put('s11', 'glass', 12, F - 13);
    put('s31', 'stone', 10, F - 14); put('s12', 'wood', 11, F - 16); put('s11', 'plastic', 11, F - 17);
    col(6, F, 6, m); col(16, F, 6, m); put('s31', 'plastic', 5, F - 7); put('s31', 'plastic', 15, F - 7);
    K(10, F - 6);
    S([9, F - 6], [13, F - 6], [9, F - 1], [10, F - 1], [13, F - 1], [5, F - 8], [17, F - 8], [9, F - 12], [13, F - 12]);
  } },
  // 35 Fun With Balloons: two hot-air balloons with baskets (one tied down by a rope), a high loose balloon, a balloon cart
  { map: 'field', b({ put, rope, S, K, F }) {
    put('c62', 'cloud', 2, F - 20); put('s12', 'wood', 3, F - 18); put('s12', 'wood', 6, F - 18); put('s41', 'wood', 3, F - 16);
    rope(4, F - 15, 14);
    put('c42', 'cloud', 12, F - 13); put('s11', 'wood', 12, F - 11); put('s11', 'wood', 15, F - 11); put('s41', 'wood', 12, F - 10);
    put('c31', 'cloud', 19, F - 24);
    put('s11', 'stone', 18, F - 1); put('s11', 'stone', 21, F - 1); put('s41', 'wood', 18, F - 2);
    put('s13', 'wood', 18, F - 5); put('s13', 'wood', 21, F - 5); put('s11', 'plastic', 18, F - 6); put('s11', 'plastic', 21, F - 6);
    K(4, F - 17);
    S([5, F - 17], [3, F - 21], [6, F - 21], [13, F - 11], [14, F - 11], [13, F - 14], [20, F - 25], [19, F - 3], [20, F - 3]);
  } },
  // 36 Rockstar Row: four glass display cases on plinths that climb toward the front - a rockstar in each
  { map: 'jungle', b({ put, fill, S, K, F }) {
    for (let k = 0; k < 4; k++) {
      const x = 1 + 6 * k, top = F - (k + 1);
      fill(x, F, 3, k + 1, 'stone');
      put('s12', 'glass', x, top - 2); put('s12', 'glass', x + 2, top - 2); put('s31', 'glass', x, top - 3);
      if (k < 3) S([x + 1, top - 1]);
      S([x + 1, top - 4], [x + 4, F - 1]);
    }
    K(20, F - 5);
  } },
  // 37 Mega Pizzaplex: three full-width shopping decks on columns, an escalator on every floor, the big sign on the roof
  { map: 'field', b({ put, col, beam, S, K, F, m }) {
    for (let k = 0; k < 3; k++) {
      const b = F - 5 * k;
      for (const x of [1, 5, 9, 13, 17, 21]) col(x, b, 4, m);
      beam(1, b - 5, 23, k === 2 ? 'stone' : m);
      const e = [6, 14, 2][k];
      put('rr1', 'wood', e, b - 1); put('s11', 'wood', e + 1, b - 1); put('rr1', 'wood', e + 1, b - 2); put('s12', 'wood', e + 2, b - 2); put('rr1', 'wood', e + 2, b - 3);
    }
    put('s12', m(), 10, F - 17); put('s12', m(), 13, F - 17); put('s41', 'plastic', 10, F - 18); put('rr1', 'plastic', 11, F - 19); put('rl1', 'plastic', 12, F - 19);
    K(11, F - 6);
    S([3, F - 1], [11, F - 1], [19, F - 1], [3, F - 6], [19, F - 6], [7, F - 11], [11, F - 11], [19, F - 11], [2, F - 16], [22, F - 16]);
  } },
  // 38 Monty Golf: a mini-golf course - two grassy mounds, a windmill with its sails, the flag, a water hazard
  { map: 'snow', b({ put, col, S, K, F }) {
    put('rr2', 'wood', 1, F - 2); put('s22', 'stone', 3, F - 2); put('rl2', 'wood', 5, F - 2);
    col(11, F, 8, 'wood'); put('s31', 'wood', 10, F - 9); put('s13', 'wood', 11, F - 12);
    put('rr2', 'wood', 14, F - 2); put('s22', 'stone', 16, F - 2); put('rl2', 'wood', 18, F - 2); put('rr1', 'wood', 16, F - 3); put('rl1', 'wood', 17, F - 3);
    col(21, F, 3, 'wood'); put('rl1', 'plastic', 21, F - 4);
    put('s21', 'glass', 22, F - 1); put('s11', 'glass', 8, F - 1);
    K(0, F - 1);
    S([3, F - 3], [4, F - 3], [10, F - 10], [12, F - 10], [10, F - 1], [12, F - 1], [7, F - 1], [20, F - 1], [22, F - 2], [24, F - 1]);
  } },
  // 39 Roxy Raceway: a launch ramp, a jump over the tyre stacks, a landing ramp down, the pit garage at the finish
  { map: 'desert', high: 'blue', b({ put, col, S, K, F, m }) {
    put('rr2', 'wood', 0, F - 2); put('s22', m(), 2, F - 2); put('rr2', 'wood', 2, F - 4);
    put('s22', m(), 4, F - 2); put('s22', m(), 4, F - 4); put('rr2', 'wood', 4, F - 6);
    put('s22', 'stone', 6, F - 2); put('s22', m(), 6, F - 4); put('s22', m(), 6, F - 6);
    col(9, F, 2, 'stone'); col(13, F, 2, 'stone');
    put('s22', 'stone', 14, F - 2); put('s22', m(), 14, F - 4); put('s22', m(), 14, F - 6);
    put('s22', m(), 16, F - 2); put('s22', m(), 16, F - 4); put('rl2', 'wood', 16, F - 6);
    put('s22', m(), 18, F - 2); put('rl2', 'wood', 18, F - 4); put('rl2', 'wood', 20, F - 2);
    put('s13', m(), 22, F - 3); put('s13', m(), 24, F - 3); put('s31', 'stone', 22, F - 4);
    K(23, F - 1);
    S([6, F - 7], [7, F - 7], [10, F - 1], [11, F - 1], [12, F - 1], [14, F - 7], [15, F - 7], [8, F - 1], [23, F - 5]);
  } },
  // 40 Bonnie Bowl: a long bowling lane, a giant stone ball at one end, four pins under the pinsetter hood, the scoreboard overhead
  { map: 'field', b({ put, col, beam, S, K, F, m }) {
    beam(2, F - 1, 22, 'wood');
    put('s33', 'stone', 2, F - 4);
    for (const x of [14, 16, 18, 20]) put('s12', 'plastic', x, F - 3);
    col(7, F - 1, 8, 'wood'); col(12, F - 1, 8, 'wood'); put('s41', 'wood', 7, F - 10); put('s21', 'wood', 11, F - 10);
    put('s41', 'glass', 7, F - 11); put('s21', 'glass', 11, F - 11);
    col(23, F - 1, 5, 'stone'); put('s41', m(), 20, F - 7);
    K(22, F - 2);
    S([15, F - 2], [17, F - 2], [19, F - 2], [21, F - 2], [5, F - 2], [6, F - 2], [8, F - 12], [11, F - 12], [13, F - 2], [9, F - 2]);
  } },
  // 41 Daycare: a ball pit behind glass, a climbing tower with a slide down the front, the Sun and Moon mobile up high
  { map: 'jungle', b({ put, col, S, K, F, m }) {
    put('s12', 'glass', 2, F - 2); put('s12', 'glass', 10, F - 2);
    for (let x = 3; x <= 9; x++) put('s11', 'plastic', x, F - 1);
    for (const x of [4, 6, 8]) put('s11', 'plastic', x, F - 2);
    col(14, F, 4, m); col(17, F, 4, m); put('s41', m(), 14, F - 5); col(14, F - 5, 4, m); col(17, F - 5, 4, m); put('s41', 'stone', 14, F - 10);
    put('rr1', 'plastic', 14, F - 11); put('rl1', 'plastic', 17, F - 11);
    put('s22', m(), 18, F - 2); put('s22', m(), 18, F - 4); put('rl2', 'plastic', 18, F - 6);
    put('s22', m(), 20, F - 2); put('rl2', 'plastic', 20, F - 4); put('rl2', 'plastic', 22, F - 2);
    put('c42', 'cloud', 5, F - 20); put('s22', 'glass', 6, F - 18);
    K(15, F - 6);
    S([3, F - 2], [5, F - 2], [7, F - 2], [9, F - 2], [16, F - 6], [15, F - 11], [16, F - 11], [15, F - 1], [16, F - 1], [5, F - 21], [8, F - 21]);
  } },
  // 42 Fazer Blast: a laser-tag arena - cover of every height scattered across the floor, a sniper's cloud behind a glass shield
  { map: 'wasteland', b({ put, col, S, K, F, m }) {
    col(1, F, 3, 'stone'); put('s22', m(), 4, F - 2); put('s11', 'plastic', 4, F - 3);
    col(8, F, 2, m); put('s11', 'glass', 8, F - 3);
    put('s31', m(), 11, F - 1); put('s11', 'glass', 12, F - 2);
    col(16, F, 3, m); put('s22', m(), 19, F - 2); put('s11', 'plastic', 19, F - 3); col(23, F, 4, 'stone');
    put('c31', 'cloud', 9, F - 12); put('s11', 'glass', 11, F - 13);
    K(0, F - 1);
    S([3, F - 1], [7, F - 1], [10, F - 1], [15, F - 1], [18, F - 1], [22, F - 1], [9, F - 13], [10, F - 13], [13, F - 2]);
  } },
  // 43 West Arcade: a giant claw machine full of plastic prizes, a ticket tower, the prize counter
  { map: 'desert', high: 'red', b({ put, col, fill, rope, S, K, F, m }) {
    fill(12, F, 8, 2, 'wood');
    col(12, F - 2, 7, 'glass'); col(19, F - 2, 7, 'glass'); put('s41', m(), 12, F - 10); put('s41', m(), 16, F - 10);
    rope(15, F - 9, 3);
    for (let x = 13; x <= 18; x++) put('s11', 'plastic', x, F - 3);
    for (const x of [14, 16, 18]) put('s11', 'plastic', x, F - 4);
    col(3, F, 10, m); put('s11', 'plastic', 3, F - 11);
    put('s12', m(), 6, F - 2); put('s12', m(), 9, F - 2); put('s41', 'wood', 6, F - 3); put('s11', 'glass', 7, F - 4);
    K(15, F - 4);
    S([13, F - 4], [17, F - 4], [13, F - 11], [18, F - 11], [7, F - 1], [8, F - 1], [8, F - 4], [21, F - 1], [23, F - 1], [1, F - 1]);
  } },
  // 44 Utility Tunnels: three pipes stacked on struts, cut into sections by stone valves at both ends
  { map: 'field', b({ put, col, rope, S, K, F, m }) {
    const pipe = (x, fr, w) => { put('s11', 'stone', x, fr); put('s11', 'stone', x + w - 1, fr); put('s' + w + '1', m(), x, fr - 1); };
    for (const x of [2, 7, 12, 17]) pipe(x, F - 1, 4); pipe(22, F - 1, 3);
    for (const x of [4, 7, 9, 12, 14, 17, 19, 22]) col(x, F - 2, 4, m);
    for (const x of [4, 9, 14, 19]) { put('s41', m(), x, F - 7); pipe(x, F - 8, 4); }
    for (const x of [6, 9, 11, 14, 16, 19]) col(x, F - 9, 3, m);
    for (const x of [6, 11, 16]) { put('s41', m(), x, F - 13); pipe(x, F - 14, 4); }
    rope(0, F - 6, 6);
    K(9, F - 1);
    S([3, F - 1], [8, F - 1], [13, F - 1], [18, F - 1], [5, F - 8], [10, F - 8], [15, F - 8], [20, F - 8], [7, F - 14], [12, F - 14], [17, F - 14]);
  } },
  // 45 Freddy's Green Room: a lit dressing-table mirror, a two-shelf wardrobe, Freddy's couch, a mic stand
  { map: 'snow', b({ put, col, fill, S, K, F, m }) {
    col(2, F, 2, m); col(5, F, 2, m); put('s41', 'wood', 2, F - 3);
    fill(2, F - 3, 4, 4, 'glass'); put('s41', 'wood', 2, F - 8);
    put('s11', 'plastic', 2, F - 9); put('s11', 'plastic', 5, F - 9);
    col(8, F, 4, 'wood'); col(10, F, 4, 'wood'); put('s31', m(), 8, F - 5); col(8, F - 5, 4, 'wood'); col(10, F - 5, 4, 'wood'); put('s31', 'stone', 8, F - 10);
    put('s41', m(), 13, F - 1); put('s31', m(), 17, F - 1); put('s12', m(), 13, F - 3); put('s11', m(), 19, F - 2);
    col(22, F, 3, 'wood'); put('s11', 'glass', 22, F - 4);
    K(16, F - 2);
    S([14, F - 2], [15, F - 2], [17, F - 2], [18, F - 2], [3, F - 1], [4, F - 1], [9, F - 1], [9, F - 6], [23, F - 1]);
  } },
  // 46 Atrium: a towering Glamrock Freddy statue on a plinth, planters round it, glass walls, a cloud balcony over his head
  { map: 'field', b({ put, col, fill, rope, S, K, F, m }) {
    fill(10, F, 5, 2, 'stone');
    col(10, F - 2, 4, m); col(14, F - 2, 4, m); put('s41', 'stone', 10, F - 7); put('s11', 'stone', 14, F - 7);
    put('s33', m(), 11, F - 10); put('s13', m(), 10, F - 10); put('s13', m(), 14, F - 10);
    put('s31', 'stone', 11, F - 11); put('s31', 'glass', 11, F - 12); put('s11', m(), 11, F - 13); put('s11', m(), 13, F - 13);
    for (const x of [1, 5, 18, 22]) { put('s22', 'wood', x, F - 2); put('s11', 'plastic', x, F - 3); }
    col(0, F, 12, 'glass'); col(24, F, 12, 'glass');
    put('c62', 'cloud', 9, F - 22); rope(9, F - 20, 6);
    K(12, F - 3);
    S([11, F - 3], [13, F - 3], [10, F - 11], [14, F - 11], [10, F - 23], [13, F - 23], [3, F - 1], [7, F - 1], [17, F - 1], [21, F - 1]);
  } },
  // 47 Loading Dock: stacked shipping containers with soldiers inside, a lorry with its trailer, the dock lift and ramp
  { map: 'desert', high: 'blue', b({ put, lift, S, K, F, m }) {
    const box = (x, r) => { put('s41', m(), x, r); put('s11', m(), x, r - 1); put('s11', m(), x + 3, r - 1); put('s41', m(), x, r - 2); return [[x + 1, r - 1], [x + 2, r - 1]]; };
    const a1 = box(1, F - 1), a2 = box(1, F - 4), a3 = box(1, F - 7), b1 = box(5, F - 1), c1 = box(9, F - 1), c2 = box(9, F - 4);
    put('s11', 'stone', 15, F - 1); put('s11', 'stone', 18, F - 1); const t = box(15, F - 2);
    put('s11', 'stone', 20, F - 1); put('s22', m(), 19, F - 3); put('s11', 'glass', 20, F - 4);
    put('rl2', 'wood', 21, F - 2);
    lift(23, F - 1, 's11', 'wood', F - 8);
    K(...b1[1]);
    S(b1[0], ...a1, ...a2, a3[0], ...c1, ...c2, ...t);
  } },
  // 48 The Underground: ruins - a broken pier with half an arch, rubble strewn about, a snapped pillar, a crumbling wall
  { map: 'wasteland', b({ put, col, S, K, F, m }) {
    col(2, F, 7, 'stone'); col(3, F, 3, m); put('s41', 'stone', 2, F - 8); put('s41', m(), 4, F - 9);
    put('s21', m(), 8, F - 1); put('rr1', 'stone', 10, F - 1); put('s22', m(), 12, F - 2); put('rl2', 'stone', 14, F - 2);
    col(17, F, 10, 'stone'); put('rl1', 'stone', 17, F - 11); col(18, F, 5, m);
    put('s22', 'stone', 20, F - 2); put('s11', m(), 22, F - 1); put('s12', 'stone', 23, F - 2); put('s11', m(), 20, F - 3); put('s11', m(), 23, F - 3); put('s11', m(), 21, F - 3);
    K(5, F - 1);
    S([4, F - 1], [6, F - 10], [7, F - 10], [3, F - 4], [12, F - 3], [16, F - 1], [18, F - 6], [19, F - 1], [22, F - 2], [11, F - 1]);
  } },
  // 49 Burntrap's Lair: a spiked stone spire with ledges spiralling up it, wires hanging down, glass vats, a spiked wall
  { map: 'desert', high: 'red', b({ put, col, rope, S, K, F, m }) {
    put('s22', 'stone', 6, F - 2); put('s22', 'stone', 6, F - 4); put('s41', 'stone', 4, F - 5);
    put('s22', m(), 6, F - 7); put('s21', m(), 6, F - 8); put('s41', m(), 6, F - 9);
    put('s22', m(), 6, F - 11); put('s21', m(), 6, F - 12); put('s41', 'stone', 4, F - 13);
    put('s22', m(), 6, F - 15); put('s21', m(), 6, F - 16); put('s41', m(), 6, F - 17);
    put('s22', 'stone', 6, F - 19); put('rr1', 'stone', 6, F - 20); put('rl1', 'stone', 7, F - 20);
    put('rl1', 'stone', 9, F - 10); put('rl1', 'stone', 9, F - 18);
    rope(9, F - 8, 8); rope(4, F - 12, 6);
    for (const x of [13, 15, 17, 19]) put('s13', 'glass', x, F - 3);
    put('s31', 'glass', 13, F - 4); put('s31', 'glass', 16, F - 4); put('s11', 'glass', 19, F - 4);
    col(23, F, 5, 'stone'); put('rr1', 'stone', 23, F - 6);
    put('s13', 'stone', 3, F - 3);
    K(4, F - 1);
    S([5, F - 1], [4, F - 6], [5, F - 6], [8, F - 10], [4, F - 14], [5, F - 14], [8, F - 18], [14, F - 1], [16, F - 1], [18, F - 1]);
  } },
  // 50 The Final Night: a four-storey stone keep with walls two thick and battlements, a gate door into its top floor,
  // a double wall at the front, a watchtower at the back and sentries on a cloud
  { map: 'desert', high: 'red', b({ put, col, door, S, K, F, m }) {
    for (let k = 0; k < 4; k++) {
      const b = F - 4 * k;
      for (const x of [8, 9, 14, 15]) put('s13', 'stone', x, b - 3);
      put('s41', 'stone', 8, b - 4); put('s41', 'stone', 12, b - 4);
    }
    for (const x of [8, 10, 13, 15]) put('s11', 'stone', x, F - 17);
    col(21, F, 8, 'stone'); col(22, F, 8, 'stone'); put('s11', 'stone', 21, F - 9);
    col(1, F, 12, 'stone'); col(2, F, 12, m); put('s21', 'glass', 1, F - 13);
    put('c42', 'cloud', 16, F - 24);
    door(18, F - 1, 11, F - 13);
    K(11, F - 5);
    S([10, F - 1], [13, F - 1], [10, F - 5], [13, F - 5], [10, F - 9], [13, F - 9], [12, F - 13], [22, F - 9], [17, F - 25], [18, F - 25]);
  } },
];
