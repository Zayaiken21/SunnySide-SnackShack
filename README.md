# Sunny Side Snack Shack — Theme Map Pro (Content Pack v10)

Base: your latest "final team upgrade patch" ZIP. All existing working features preserved; changes are additive.

## What's new in v10

### 200 unique themed stages
- 20 hand-authored worlds (Beach, Tokyo, Italy, Mexico, India, Paris, Arctic, Jungle, Desert, Mountain, City, Space, Dino, Castle, Volcano, Korea, Hawaii, Candy, Ocean, New York).
- Each world has 10 named stages (200 total) — every stage name, palette, cuisine, decor, and weather is unique.
- Culture-correct menus: Tokyo serves sushi/ramen/mochi, Mexico serves tacos/churros, Hawaii serves poke, etc. Signature dishes are ★-highlighted.
- Real per-world atmosphere: themed floating decor + weather layer (snow, petals, embers, sand, bubbles, sparkles, leaves, confetti, stars).
- 123 foods across 6 stations, spanning many cultures.

### Single-player map picker is now a compact dropdown
- Pick a world from a dropdown; only that world's stages show. No more full-page scroll.
- Worlds unlock as you complete levels (10 stages per unlocked world).

### VIP customers & orders
- Every 5th stage of each world (40 stages) features frequent VIPs; other stages have occasional VIPs.
- VIP orders are larger and pay ~1.6× coins. Clear VIP badge + banner.

### Harder as you go
- Goal scales from 6 → 15 orders across the 200 maps (co-op); versus is ~70% of that.
- Order size grows from 2 → 6 items. Time-per-order tightens from 18s → 8.3s.

### Level timer
- Every level is timed (server-authoritative in multiplayer).
- Co-op: if the clock runs out before the goal, the whole team fails and must Retry the same map.
- Solo: time up shows a retry screen.

### Wrong-order rule
- Serving a wrong order still advances you to the next customer and still pays coins — but gives NO progress toward the level goal. Only correct orders (accuracy ≥ 60%) count.

### Multiplayer (all requested)
- Co-op teammates see the exact same customer, name, emoji, VIP status, and order.
- Reaching the next level requires ALL players to vote within 15s; anyone who doesn't (or picks Home) leaves to Home.
- After voting next, a 30-second team upgrade break — buy shared online upgrades, then the next level starts.
- Starting the next level resets orders/coins/tray/team progress to 0 (e.g. 0/10).
- Server ends co-op for everyone at the team goal, and versus for everyone when one player wins.
- A player leaving is removed from the room and their character disappears for everyone.

### Upgrades: online vs offline are fully separate
- Offline waiting-room upgrades (patience/prep/tips/team) affect SOLO only.
- Online team upgrades are their own set: co-op shares the strongest level across the team; versus uses only your own.

## Deploy (Render)
- Build command: `npm install`
- Start command: `npm start`
- Node ≥ 18. Uses `express` + `ws`.
- Test mode: set env `SSSS_FAST=1` for short timers.

## Verified
- 38 server-side multiplayer tests (co-op, versus, timeout/retry, voting, upgrades, leave) — all pass.
- 23 client logic tests (content integrity, difficulty ramp, food routing, scoring, VIP, upgrade separation) — all pass.
