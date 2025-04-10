# Product Context: Martingale Trading Bot

## 1. Problem Solved

Manually executing a Martingale strategy in volatile crypto markets is stressful and requires constant monitoring to catch price drops for averaging down and executing the take-profit order precisely. This bot automates the process, aiming to:

*   **Automate Averaging Down:** Systematically place larger buy orders at predefined lower price levels.
*   **Manage Risk (Basic):** Implement automated take-profit based on the calculated average cost and a stop-loss based on the initial entry price.
*   **Consistency:** Follow the Martingale plan without emotional deviation, especially during significant price drops.
*   **Efficiency:** Monitor prices and place/manage orders faster and more reliably than manual trading.

## 2. Target User

*   Cryptocurrency traders who understand the principles and **significant risks** associated with the Martingale strategy (potential for large capital requirements and losses if the price continues to fall without sufficient retracement).
*   Users comfortable with configuring Martingale parameters (initial price, drop percentage, levels, amounts, multipliers, TP/SL).
*   Individuals capable of generating and managing API keys for their exchange accounts.
*   Users familiar with running Node.js applications from the command line.

## 3. How It Should Work (Expected Behavior - Martingale)

1.  **Initialization:**
    *   Load configuration from `gridbot.js` and `.env`.
    *   Load previous state from `martin_state.json` if it exists.
    *   Connect to the specified exchange using API credentials.
    *   Load market data for the specified trading pair.
    *   Calculate Martingale buy price levels (`state.martinLevels`) and corresponding buy amounts (`state.martinAmounts`).
    *   Calculate the initial stop-loss price (`state.stopLossPrice`) based on `config.initialPrice` and `config.stopLoss`.
    *   If starting fresh or state is empty:
        *   Place the initial buy order (Level 0) at `state.martinLevels[0]`.
    *   If loading state:
        *   Recalculate `state.averageCost`, `state.totalAmount`, `state.totalInvested`, `state.takeProfitPrice`.
        *   Verify existing open orders against the loaded state.
        *   If a position exists (`state.totalAmount > 0`) and no take-profit order is active (`state.takeProfitOrderId` is null or invalid), place a new take-profit order.
2.  **Running Loop:**
    *   Periodically check the current market price.
    *   Periodically check the status of open orders (buy orders and the single take-profit sell order).
    *   **Check Stop-Loss:** If `currentPrice <= state.stopLossPrice` and a position exists, trigger the stop-loss procedure (cancel all orders, market sell position).
    *   **On Buy Order Fill:**
        *   Log the filled order details.
        *   Remove the filled buy order ID from `state.openOrders`.
        *   Add the filled position details to `state.positions`.
        *   Recalculate `state.averageCost`, `state.totalAmount`, `state.totalInvested`, `state.takeProfitPrice`.
        *   Cancel the existing take-profit order (if any).
        *   Place a new take-profit limit sell order for the `state.totalAmount` at the new `state.takeProfitPrice`. Store its ID in `state.takeProfitOrderId` and add to `state.openOrders`.
        *   Save the updated state to `martin_state.json`.
    *   **On Take-Profit Order Fill:**
        *   Log the successful take-profit event.
        *   Remove the take-profit order ID from `state.openOrders` and clear `state.takeProfitOrderId`.
        *   Clear `state.positions`.
        *   Recalculate position state (all should be zero).
        *   Place the initial buy order (Level 0) again to restart the cycle.
        *   Save the updated state.
    *   **On Order Cancelled/Rejected:**
        *   Log the event.
        *   If it was the take-profit order, clear `state.takeProfitOrderId`.
        *   Remove the order ID from `state.openOrders`.
        *   Save the updated state. (The logic might need to attempt re-placing the order, e.g., the TP order if cancelled externally).
    *   **Check for Next Martingale Buy:**
        *   Determine the next Martingale level (`nextLevel`) based on the `currentPrice` falling below `state.martinLevels[nextLevel]`.
        *   Check if `nextLevel` is valid (within `config.levels`).
        *   Check if a buy order for `nextLevel` already exists in `state.openOrders`.
        *   Check if a position for `nextLevel` already exists in `state.positions`.
        *   If the level is valid, no open order exists for it, and no position exists for it, place a new limit buy order for `state.martinAmounts[nextLevel]` at `state.martinLevels[nextLevel]`. Add its ID to `state.openOrders`.
        *   Save state if a new order is placed.
3.  **Shutdown (Graceful):**
    *   On receiving SIGINT/SIGTERM (e.g., Ctrl+C):
        *   Stop the main loop (`state.isRunning = false`).
        *   Cancel all open orders on the exchange (buy orders and the take-profit order).
        *   (Optional, based on `config.sellAllOnStop`) Place a market sell order for the remaining base currency balance (`state.totalAmount`).
        *   Save the final state (likely with empty open orders and potentially zero positions if `sellAllOnStop` is true).
        *   Exit the process.

## 4. User Experience Goals

*   **Clarity:** Provide clear log messages about Martingale level calculations, order placements (initial, level buys, take-profit), fills, average cost updates, TP/SL price updates, and errors.
*   **Configuration:** Allow easy configuration of core Martingale parameters.
*   **Resilience:** Recover from temporary errors and resume operation from the last saved state (`martin_state.json`) upon restart.
*   **Control:** Allow the user to start and stop the bot cleanly, with options for handling the position on stop.
*   **Risk Awareness:** Logging should implicitly highlight the increasing position size and changing average cost.

*(This document has been updated based on the Martingale strategy implemented in `gridbot.js` as of YYYY-MM-DD. Replace YYYY-MM-DD with the current date.)*
