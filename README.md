# Sunny Side Snack Shack — Theme Map Pro

A cooking/serving game: 200 themed stages across 20 worlds, real-time co-op and
versus multiplayer, VIP orders, per-level timers, culture-correct menus, shared
team upgrades, and a full audio system.

## Run

    npm install      # express + ws
    npm start        # serves game + websocket server on PORT (default 3000)

Multiplayer needs the websocket server reachable (this repo's server.js), so it
works on a real deployment (e.g. Render) rather than opening index.html as a file.

## This pass — full debug + design fixes

1. **Map journey top** — cleaned the world header/topbar (no more odd letter-spacing,
   no "undefined" subtitle), styled the world picker card, stage cards, and made the
   list scroll with a sticky picker.
2. **Order ticket** — now scrolls past the 3rd order, shows the customer emoji, and
   each order is numbered with option chips.
3. **Food menu** — rebuilt: a "🍽 Menu" header with category tabs (Drinks / Grill /
   Sweets…) side by side; tap a tab to see that category's items in a scrollable grid.
   No more drinks spilling out the bottom, and the "still needed" strip was removed
   (needs are shown on the ticket + highlighted foods).
4. **Solo loss** — the Time's Up screen now shows only **Retry** (centered) + Back
   Home when you didn't finish the goal; **Next Level** only appears on a win.
5. **Team upgrades** — co-op applies the **highest** teammate's upgrade to everyone
   (comfy-waiting, team counter, prep); versus keeps each player's upgrades individual.
6. **Audio** — rewritten, warmer (non-robotic) melody with a soft lead + bass, a
   different scale per world, **separate Music and Game-SFX volume sliders**, a mute
   toggle, and autoplay on first tap (browsers block autoplay before interaction).
7. **Conveyor belts** — steady rightward motion (belt + items move the same way), no
   more empty-bar glitch or jump. Menu/order fixes apply to multiplayer too.
   Win screen: Retry on the right, Next Level on the left; loss: Retry centered.
8. **Multiplayer** — you can now **play a private game solo** (1 player can start,
   vote, and play). Rooms are **private**: no public list — friends join with the
   game code, and there's now a **Join-by-code box in the pause menu**.
9. **Vote to continue** — after a level, voting to continue no longer crashes to the
   home menu. All ready → the server authoritatively starts the **next level** for the
   whole room (verified: advances map, stays in match, keeps players in sync).
10. **Tutorial** — replaced the tooltips with a clean, detailed 8-page illustrated
    walkthrough (read at your own pace, Back/Next, progress dots), works in solo too.
11. **Timers** — every correct order adds **+30 seconds**. Co-op shares one team
    clock (server-synced); versus grows only the serving player's own clock. Level
    time is generous (~30s per required order).
12. Everything above was checked together so nothing regressed.

## How it was verified

A Node harness runs the real server (mocked express/ws) wired to real client
instances in a mocked DOM. Passing suites: co-op order sync, serve + leave (no
flicker), serve-to-completion, **solo multiplayer start**, **vote → upgrade break →
next-level advance**, versus independent orders/scoring, and a solo pass over all 20
worlds with zero errors.

Caveat: this environment can't run a real browser or install npm, so audio, pixel
layout, and touch feel still need a quick live playtest after deploy.
