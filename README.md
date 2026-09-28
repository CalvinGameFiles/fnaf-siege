# FNAF Siege

A Five Nights at Freddy's strategy game in the style of Angry Birds. Build a fortress, hide 9 Endos and King Freddy in it, then take turns firing the cannon or rolling dice.

## Play it
- **In your browser (phone or PC):** https://calvingamefiles.github.io/fnaf-siege/ - hold your phone sideways; on a phone it goes full screen on the first tap.
- **Android app:** open the [Releases](https://github.com/CalvinGameFiles/fnaf-siege/releases) page on your phone, download the newest `FNAF-Siege-....apk` and open it to install (allow "install unknown apps" for your browser when Android asks).

## Play on this PC
Double-click **FNAF Siege** on the desktop. It's a real Windows app (Electron) in `desktop/`: its own window and icon, and F11 for full screen.
It plays straight from the `www/` folder, so game changes show up the next time you open it. You only need to rebuild the app itself (`cd desktop`, then `npm run build`) if `desktop/main.js` changes.

## The phone app (Android)
The game lives in `www/`. `android/` wraps it in a full-screen app (the same setup as UCN Mobile).
GitHub builds the APK in the cloud: push this folder to a GitHub repo, then push a version tag (`git tag v0.1 && git push --tags`).
The `.apk` shows up on that tag's Release page; open it on the phone to install. Every build is signed with the same key, so new versions install over old ones and keep your coins and items.
The key (`android/fnafsiege.p12`) is kept OFF GitHub: the cloud build gets it from the repository secrets `SIGNING_KEY_B64` and `SIGNING_PASSWORD`. Keep a backup of that file - without it, a new APK can't update the old one.
Every push to `main` also puts the `www/` folder on GitHub Pages (the browser version).

## LOCAL play (same Wi-Fi)
One player taps **Play > Local > Host a game**, and the other sees it in the list and taps it. The phones find each other over the internet (PeerJS) and then play directly. Phones on the same Wi-Fi share one public address, and that's how they spot each other's games.
**Pass & Play** is two players on one device, and it works offline.

## Files
| | |
|---|---|
| `www/index.html`, `www/css/style.css` | the page and the menus |
| `www/js/game.js` | the match: building, physics (Matter.js), clouds/ropes/doors/arrows, turns, rules, the campaign CPU and its 50 levels, drawing, input |
| `www/js/ui.js` | main menu, campaign (levels + PLAY), shop, inventory and gold equipment bar (drag and drop), options, local lobby |
| `www/js/net.js` | local play over PeerJS |
| `www/js/store.js` | saved options, coins, owned items, equipment bar, beaten levels; `ITEMS` = what the shop sells |
| `www/js/sfx.js` | synthesised sound effects |
| `www/img/` | head pictures (endo, freddy, bonnie, chica, cupcake) and app icons |
| `server.js` | the PC launcher's tiny web server |
| `scripts/make-heads.py` | crops the pasted pictures into `www/img` and measures the eyes for blinking |
| `desktop/` | the Windows app (Electron): `main.js`, `build.js` |
| `debug/*.py` | automated tests (headless Chrome): `smoke`, `mech`, `online`, `levels`, `fighters`, `round6`, `round7`, `round8`, `round9`, `round10`, `mobile` (phone sizes + finger gestures), `desktop` |

## Rules (short)
- Map is 75x50. Blue land = columns 1-25, battlefield = 26-50, red land = 51-75. You can only build on your own colour. Each side's cannon sits behind its land on a low platform.
- Blocks: stone, wood, glass, ramps, **clouds** (anything touching their underside hangs until knocked loose), **ropes** (climbable), **doors** (gold in, red out), **arrows** (the block in front of an arrow's point becomes a moving platform).
- Endo 1 heart, King Freddy 2, Bonnie 2, Chica 1 (can spend a dice roll to throw her Cupcake, which becomes a unit), Foxy 1 (moves 2 squares per dice point). An attack does 1 damage.
- Toy Bonnie 1 (can be fired from the cannon as the cannonball, and gets up where he lands), Balloon Boy 1 (reaching the far edge of the enemy land wrecks their cannon), Mangle 1 (hangs off any block bigger than one square, so she climbs walls).
- Masks can be put on while placing units or at any moment in the battle. In Pass & Play each player has their own gold bar. A mask dropped onto a fighter that already has one replaces it; the old mask is destroyed and the shop restocks it.
- Bidybab (launch: splits in two mid-air), Electrobab (launch: blows up a big patch of the enemy fort), Funtime Foxy (breaks enemy glass free), Burnt Foxy (spend a roll: fireball - 1 damage, burns wood, bounces off glass), Glamrock Bonnie / OMC Mangle / Phantom Puppet (walk through the enemy's one-block wood / glass / stone walls).
- Launchable fighters (Toy Bonnie, Bidybab, Electrobab) can be fired from the cannon, or grabbed on a dice turn and dragged back to launch (spends the roll).
- Ennard (walks through ANY enemy one-block wall), Games Freddy (flies: stays in the air where the dice move him), Missing Mangle (pink ooze turns enemy blocks to pink plastic: glass-weak, 1 point to break), Cookie Bonnie (a dead-straight cookie: 1 damage to every enemy it passes, through glass, stopped by wood/stone), Radioactive Foxy (goo melts enemy blocks in the splash). Magic (fireball, ooze, goo) bounces off glass; max 3 magic shots a turn.
- The cannon overheats after 3 shots in a row: no cannon for that side's next 2 turns (using the dice resets the streak).
- Blue arrows move blocks up and down (lifts).
- Shop looks: team colours, stone / wood / glass colours and 10 cannons (tap to equip). Save Fort adds your fort to the Auto Fort rotation.
- Withered Chica 1 (smashes enemy wood for free), Phantom Puppet 1 (steps through one-block enemy STONE walls), Springtrap 3 hearts, Nightmare Foxy 1 (takes out invaders at home, like the King).
- Chipper digs into the earth and tunnels under the forts (3 squares deep; nothing hits him down there). Glamrock Endo, while alive, lets ALL his side fight invaders at home. DJ Music Man spends a roll to throw a comrade touching him as far as the cannon. Festive Mangle's magic goes through wood, shoves stone over, bounces off glass and kills any enemy it touches. Pitch Black Ennard spends a roll to teleport next to any comrade.
- Dust Mangle (launch her; while she stands in the enemy's land their dice rolls are halved), Festive BB (can't be crushed by falling blocks).
- King upgrades (drag onto the King): Books Freddy (3 hearts), Black Light Freddy (spend a roll: a blue cannonball that smashes stone and glass but not wood), Dread Bear (only falling blocks hurt him; once a match gives a unit 3 hearts), Molten Freddy (launches himself, walks through any one-block enemy wall), Funtime Freddy (wrecks the cannon at the far edge; at full health revives a fallen comrade instead of firing; explodes if killed in enemy land), Unidentified Freddy (one random fighter ability each match).
- The campaign has 50 levels: Endos only on level 1, then 1 mask, 2 of a mask, different masks, more and stronger ones, King upgrades from level 20, and the best line-up on level 50. The CPU also fires its shooters' shots, revives with Funtime Freddy and uses Dread Bear's gift.
- Units may step into mid-air (they just fall), and step straight through a one-block wall of their OWN side. Enemy blocks can't be walked through.
- The dice read 5-10. A unit stepped onto a slope slides down it.
- Auto Fort styles: Pyramid, Bunker, Great Hall, Village, Sky Fort (tap again to cycle). The campaign CPU aims better (it corrects itself after each shot) and marches raiders at you with the dice.
- Falling glass does 0, wood 1, stone 2. A cannonball direct hit does 3.
- Maps: **The Field** (flat) or the **Red Desert** (one side on a raised plateau, with a climbable staircase slope in the battlefield). Pass & Play and Local pick one at random; campaign levels 3, 6 and 9 are in the desert.
- In battle the camera moves by itself: it shows the side whose turn it is (its army when it rolls), chases each cannonball, then pulls back over the side it lands on so both players see the damage. Your cannon lights up while you aim.
- Your own cannonballs fly through everything that's yours. Cannonballs pass through ropes but still hit a unit hanging on one.
- A unit inside the enemy's land can smash an enemy block next to it with dice points: stone 1, wood 2, glass 3.
- Each turn: fire the cannon once, OR roll the dice 3 times. Points move units one square each (like a chess king), or place repair blocks (wood 1, glass 1, stone 2).
- If the King dies, one soldier flees. The side that loses its last soldier gets one final shot; wiping out the enemy with it makes the game a draw.
- Coins: win 10, draw 5, loss 1. A new install starts with 0 coins, no items, and only campaign level 1 open (each level beaten opens the next).
- The shop has 5 sections by price (the arrows flip between them): Common 10-20 (grey), Uncommon 30-40 (green), Rare 50-60 (orange), Ultra Rare 70-80 (purple), Legendary 90-100 (shiny gold). Each holds the masks, King upgrades, looks, cannons and cannonball powers of that price.
- Cannonball powers (one equipped at a time, fired once a match from the cannon's ammo bar): Swamp BB wipes out ALL the enemy's stone, The Sun all their wood, The Moon all their glass, as soon as it hits their land. Campaign levels 25+ give the CPU one too.
- A Bidybab can only be launched once (her clone can't be launched at all).
- Auto Fort has 10 styles: Pyramid, Bunker, Great Hall, Village, Sky Fort, Skyline, Castle, Floating Islands, Ziggurat, Stilt Village - then your saved forts.
