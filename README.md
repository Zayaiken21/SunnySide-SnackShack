# Sunny Side Snack Shack — Final Team Upgrade Patch

Base: exact uploaded ZIP. Existing UI/layout preserved.

Targeted changes only:
- Co-op teammates see the same customer name and order.
- Co-op uses the highest online time upgrade from the team.
- Versus uses only each player's own online time upgrade.
- Offline/single-player patience upgrades do not affect multiplayer.
- Multiplayer result screen requires vote to continue.
- 15-second next-level vote; Home/timed-out players leave the room.
- 30-second online upgrade break before the next multiplayer level.
- Starting the next level resets orders/coins/tray/team progress to 0.
- Server ends co-op for everyone at team goal and versus for everyone when one player wins.
- Player leaving is removed through room broadcast.

Deploy:
Build command: npm install
Start command: npm start
