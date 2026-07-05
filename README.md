# Sunny Side Snack Shack — Theme Map Pro

A cooking/serving game with 200 themed stages across 20 worlds, real-time co-op and
versus multiplayer, VIP orders, per-level timers, culture-correct menus, and shared
team upgrades.

## Run

    npm install      # installs express + ws
    npm start        # serves game + websocket server on PORT (default 3000)

Open the served URL. For local testing set SSSS_FAST=1 to shorten the level timer.

## What was verified / fixed in this pass

Checked the whole build with a Node harness running the real server (mocked express/ws)
wired to two real client instances in a mocked DOM, plus a solo stress pass over all 20
worlds. Findings:

- Co-op order sync — both players always get the identical shared order; the server
  designates exactly one client to generate each next order (no dueling customers, no
  flicker). A double "customer left" report produces only one order change.
- Serve flow — correct orders advance the shared goal and sync to both players; hitting
  the goal ends the match with the completion screen.
- Wrong-order rule — wrong orders still pay coins but give no goal progress (accuracy
  below the 60% threshold).
- Team upgrade sharing (FIXED) — the strongest upgrade among co-op teammates now applies
  to everyone. progressPayload was sending a malformed nested "upgrades" object; it now
  sends clean upgrade levels, the server persists them per player and echoes them in the
  room payload, and teammates read the best value.
- Leave mid-match — a player who leaves is removed from everyone's roster and the match
  continues for the rest (order generation re-assigns if the leaver was the generator).
- Difficulty curve — goal scales 6 -> 15 and per-order time tightens with depth.
- Culture menus — each world leads with its signature dishes; deeper worlds unlock
  progressively larger menus.
- HUD — coins, orders (x/y) and the countdown timer each sit in their own chip in a
  fixed 3-column row and are never cut off; the map name truncates gracefully.
- Single-player map — sticky world picker, scrollable stage list.
- Save migration — coins, upgrades, name, and progress preserved across version bumps.
- Code cleanup — removed duplicate teamServedCount / updateServedUI definitions.

## Notes

Multiplayer needs the websocket server reachable (this repo's server.js), so it works on
a real deployment (e.g. Render) rather than opening index.html as a local file. Pausing
in an online match opens a personal menu overlay; the shared game keeps running.
