# Sunny Side Snack Shack — Targeted Working Zip Patch

Base: the uploaded working ZIP from the user.

Only targeted systems were patched:
- Co-op shared customer/order sync preserved.
- Team/versus completion handled by server.
- Top-right level goal remains visible and updates from state.goal.
- Multiplayer goals scale past 4/4 as map/world advances.
- Offline upgrades do not affect multiplayer.
- Online team/VIP upgrades apply to multiplayer.
- 200 map entries and more culture foods are added without redesigning UI.
- VIP orders added.
- Timer fail restarts the level.
- Multiplayer next-level vote: remaining players must vote within 15 seconds.
- Choosing Home/timing out removes that player from the room.
- 30-second online upgrade break before the next multiplayer level.
- Conveyor hidden station text removed while preserving the working layout.

Deploy:
Build command: npm install
Start command: npm start
