import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'www'))
def patch(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8').write(s)

patch('js/store.js', [
    ("""    owned: {},                         // item id -> true (bought in the shop)""",
     """    owned: {},                         // item id -> true (bought in the shop)
    lost: {},                          // item id -> true (destroyed by swapping masks: gone for good)"""),
    ("""    desc: 'Mangle hangs off any block bigger than one square, like a rope, so she can crawl up walls.' },
};""",
     """    desc: 'Mangle hangs off any block bigger than one square, like a rope, so she can crawl up walls.' },
  wchica: { name: 'Withered Chica Mask', img: 'img/wchica.png', price: 0, kind: 'wchica',
    desc: 'Withered Chica smashes enemy WOOD blocks for free when she breaks into their land.' },
  ppuppet: { name: 'Phantom Puppet Mask', img: 'img/ppuppet.png', price: 0, kind: 'ppuppet',
    desc: "Phantom Puppet slips straight through the enemy's STONE walls if they are one block thick (not wood or glass)." },
  springtrap: { name: 'Springtrap Mask', img: 'img/springtrap.png', price: 0, kind: 'springtrap',
    desc: 'Springtrap has 3 hearts.' },
  nfoxy: { name: 'Nightmare Foxy Mask', img: 'img/nfoxy.png', price: 0, kind: 'nfoxy',
    desc: 'Like King Freddy, Nightmare Foxy can take out enemies who invade your land.' },
};"""),
])
patch('js/ui.js', [
    ("""      const it = ITEMS[id], owned = Store.get('owned')[id];
      const d = document.createElement('div');
      d.className = 'shopitem card' + (owned ? ' owned' : '');
      d.innerHTML = `<img src="${it.img}"><b>${it.name}</b><span>${owned ? 'OWNED' : it.price ? it.price + ' coins' : 'FREE'}</span>`;
      d.title = it.desc;
      d.onclick = () => {
        if (Store.get('owned')[id]) { Sfx.play('bad'); toast('You already have the only one'); return; }""",
     """      const it = ITEMS[id], owned = Store.get('owned')[id], lost = (Store.get('lost') || {})[id];
      const d = document.createElement('div');
      d.className = 'shopitem card' + (owned ? ' owned' : '') + (lost ? ' lost' : '');
      d.innerHTML = `<img src="${it.img}"><b>${it.name}</b><span>${lost ? 'DESTROYED' : owned ? 'OWNED' : it.price ? it.price + ' coins' : 'FREE'}</span>`;
      d.title = it.desc;
      d.onclick = () => {
        if (lost) { Sfx.play('bad'); toast('That mask was destroyed when it was swapped off - it can never be used again'); return; }
        if (Store.get('owned')[id]) { Sfx.play('bad'); toast('You already have the only one'); return; }"""),
])
patch('index.html', [
    ("""      <li><b>Mangle</b> - hangs off the side or underside of any block bigger than one square, like a rope, so she can crawl up walls.</li>""",
     """      <li><b>Mangle</b> - hangs off the side or underside of any block bigger than one square, like a rope, so she can crawl up walls.</li>
      <li><b>Withered Chica</b> - breaks enemy wood blocks for free when she's broken into their land.</li>
      <li><b>Phantom Puppet</b> - slips straight through the enemy's stone walls if they're one block thick (not wood or glass).</li>
      <li><b>Springtrap</b> - 3 hearts.</li>
      <li><b>Nightmare Foxy</b> - like King Freddy, can take out enemies who invade your land.</li>"""),
    ("""Drag a mask from the gold equipment bar onto an Endo to turn it into that fighter - now, or at any moment during the battle.</p>""",
     """Drag a mask from the gold equipment bar onto an Endo to turn it into that fighter - now, or at any moment during the battle. You can even drop a mask onto a fighter that already has one, but the old mask is destroyed and can never be used again.</p>"""),
    ("""move a unit 1 square per point (like a chess king: any direction, never into mid-air or an occupied square)""",
     """move a unit 1 square per point (like a chess king: any direction; stepping into mid-air is fine, the unit just falls). A unit can step straight through a wall of its OWN that is one block thick, but never through enemy blocks"""),
    ("""    <p>The field is 125 squares wide and 50 tall. The first 50 columns are <b class="b">BLUE</b>'s land, the last 50 are <b class="r">RED</b>'s, and the 25 in the middle are the battlefield.""",
     """    <p>The field is 75 squares wide and 50 tall. The first 25 columns are <b class="b">BLUE</b>'s land, the last 25 are <b class="r">RED</b>'s, and the 25 in the middle are the battlefield."""),
])
s = open('css/style.css', encoding='utf-8').read()
s += ".shopitem.card.lost { border-color: #555; opacity: 0.45; filter: grayscale(1); }\n.shopitem.card.lost span { color: #ff6b6b; }\n"
open('css/style.css', 'w', encoding='utf-8').write(s)
print('ok')
