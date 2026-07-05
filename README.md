# Sunny Side Snack Shack — V12 Full Stability Fix

Base: v11 fixes ZIP plus the working style from the uploaded patch.

Fixed:
- Top HUD now shows full coins, timer, and orders without truncating.
- Pause button opens the pause/menu screen reliably.
- Co-op customers/orders are server-synced and do not rapidly change after a customer leaves or an order completes.
- If a customer leaves in co-op, the customer leaves for the whole team and the server assigns the next shared order once.
- Duplicate server order echoes no longer restart the timer or flicker the customer.
- Single-player map list scrolls again.
- “undefined” world description is fixed.
- Conveyor station label text is hidden globally.
- Level timer remains visible and stable.
- Co-op/versus server finish logic remains intact.
- Additional foods and detailed worlds from v11 remain included.

Deploy:
Build command: npm install
Start command: npm start
