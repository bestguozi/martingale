# System Patterns: Multi-User Martingale Trading System

## 1. Architectural Overview

The system follows a modular service-oriented architecture with database persistence. Key elements include:

* **Multi-User Layer:** User accounts with isolated strategies and API credentials
* **Core Services:**
  - `userService`: Manages users and API key metadata
  - `logService`: Handles structured logging to console and database
  - `strategyService`: Coordinates strategy lifecycle and exchange interactions
* **Martingale Engine:** Reusable strategy implementation (`MartingaleEngine` class) 
* **Database Layer:** MySQL with Prisma ORM for data persistence
* **Event-Driven Communication:** Strategy engines emit events that services handle
* **Configuration Management:** 
  - Environment variables for core settings
  - Database-driven strategy parameters  
  - Secure config files for sensitive credentials

## 2. Service Architecture

### StrategyService
- **Responsibilities:**
  - Loads active strategies from database
  - Initializes MartingaleEngine instances
  - Handles engine lifecycle (start/stop)
  - Processes engine events (orders, state updates)
  - Manages exchange connections
- **Key Patterns:**
  - Singleton service
  - Event-driven architecture
  - Connection pooling (CCXT instances)

### LogService
- **Features:**
  - Winston-based logging
  - Console and database transports
  - Structured logging with metadata
  - Error tracking
- **Integration:**
  - Used by all services
  - Logs to `operation_logs` table

### UserService
- **Functionality:**
  - User management
  - API Key metadata storage
  - Credential security
- **Data Model:**
  - Users ↔ API Keys (1-to-many)
  - API Keys ↔ Strategies (1-to-many)

### MartingaleEngine
- **Core Logic:**
  - Maintains isolated strategy state
  - Emits events for service coordination
  - Implements Martingale algorithm
- **Event Types:**
  - stateUpdate
  - placeOrderRequest  
  - cancelOrderRequest
  - checkOrdersRequest
  - error

## 3. Database Schema
- **Users:** User accounts and credentials
- **ApiKeys:** Exchange API key metadata (no secrets)
- **Strategies:** Strategy configurations
- **StrategyParameters:** Martingale parameters
- **StrategyStates:** Runtime strategy state  
- **OperationLogs:** Audit trail of all actions

## 4. Key Algorithms & Logic (Martingale Strategy)

*   **Martingale Level Calculation (`calculateMartinLevels`):**
    *   Takes `initialPrice`, `priceDropPercent`, `levels`, `initialAmount`, `amountMultiplier` from `config`.
    *   Calculates the price for each buy level: `price[i] = price[i-1] * (1 - priceDropPercent / 100)`.
    *   Calculates the amount for each buy level: `amount[i] = amount[i-1] * amountMultiplier`.
    *   Returns `{ prices: [...], amounts: [...] }` which are stored in `state.martinLevels` and `state.martinAmounts`.
*   **Position Recalculation (`recalculatePosition`):**
    *   Triggered after a buy order fills.
    *   Iterates through `state.positions` (array of `{price, amount, level}`).
    *   Calculates `state.totalInvested` (sum of `price * amount`).
    *   Calculates `state.totalAmount` (sum of `amount`).
    *   Calculates `state.averageCost = state.totalInvested / state.totalAmount`.
    *   Calculates `state.takeProfitPrice = state.averageCost * (1 + config.takeProfit / 100)`.
    *   (Stop-loss price `state.stopLossPrice` is calculated once at initialization based on `config.initialPrice`).
*   **Order Placement (`placeOrder`):**
    *   Generic function to place limit buy/sell orders using `ccxt`.
    *   Takes exchange, symbol, side, amount, price.
    *   Uses `amountToPrecision` and `priceToPrecision`.
    *   Performs basic checks against exchange minimum amount and cost limits.
    *   Returns the `ccxt` order object or `null` on failure.
*   **Initial Buy Order (`placeInitialBuyOrder`):**
    *   Places the first buy order (Level 0) using `state.martinLevels[0]` and `state.martinAmounts[0]`.
    *   Only places if the current price is not significantly above the initial price.
    *   Stores the order ID mapped to level `0` in `state.openOrders`.
*   **Subsequent Martingale Buys (`checkAndPlaceMartinOrders`):**
    *   Determines the current Martingale level the price has dropped to.
    *   Checks if a buy order for this level already exists (in `state.openOrders`) or if a position for this level has already been filled (in `state.positions`).
    *   If the level is valid and no order/position exists for it, places a new limit buy order using the corresponding price and amount from `state.martinLevels` and `state.martinAmounts`.
    *   Stores the new order ID mapped to its level in `state.openOrders`.
*   **Take-Profit Order (`placeTakeProfitOrder`):**
    *   Triggered after a buy order fills and `recalculatePosition` completes.
    *   Cancels any existing take-profit order (`state.takeProfitOrderId`).
    *   Places a single limit sell order for the entire `state.totalAmount` at the newly calculated `state.takeProfitPrice`.
    *   Stores the new order ID in `state.takeProfitOrderId` and also maps it to the string `'takeProfit'` in `state.openOrders`.
*   **Stop-Loss Trigger (`triggerStopLoss`):**
    *   Checked within the main loop if `currentPrice <= state.stopLossPrice`.
    *   Cancels all open orders (buy orders and the take-profit order).
    *   Places a market sell order for the entire `state.totalAmount`.
    *   Clears `state.positions`.
    *   Logs the stop-loss event.
*   **Core Trading Logic (`checkAndPlaceOrders`):**
    1.  Fetch current ticker price.
    2.  Check if stop-loss is triggered. If yes, execute `triggerStopLoss` and return.
    3.  Iterate through open order IDs in `state.openOrders`.
    4.  Fetch order status using `exchange.fetchOrder`.
    5.  **If Buy Order Filled:**
        *   Log fill, remove from `state.openOrders`, add to `state.positions`.
        *   Call `recalculatePosition`.
        *   Call `placeTakeProfitOrder`.
        *   Save state.
    6.  **If Take-Profit Order Filled:**
        *   Log fill, remove from `state.openOrders`, clear `state.takeProfitOrderId`.
        *   Clear `state.positions`, call `recalculatePosition` (to reset totals to 0).
        *   Call `placeInitialBuyOrder` to restart the cycle.
        *   Save state.
    7.  **If Order Cancelled/Rejected:**
        *   Log, remove from `state.openOrders`. If it was the TP order, clear `state.takeProfitOrderId`.
        *   Save state. (Potential improvement: Re-place TP order if cancelled externally).
    8.  **If OrderNotFound:**
        *   Log, remove from `state.openOrders`. If it was the TP order, clear `state.takeProfitOrderId`.
        *   Save state.
    9.  **After checking existing orders:**
        *   If no position exists (`state.positions.length === 0`) and no open orders exist, call `placeInitialBuyOrder`.
        *   If a position exists, call `checkAndPlaceMartinOrders` to see if the next level buy needs to be placed.
*   **State Persistence (`saveState`, `loadState`):**
    *   `saveState`: Serializes the global `state` object to JSON and writes it asynchronously to `config.stateFilePath` (`martin_state.json`).
    *   `loadState`: Asynchronously reads `config.stateFilePath`, parses the JSON, assigns it to `state`, and performs basic type checking/initialization for loaded fields. Handles file not found for initial runs.

## 3. Data Structures

*   **`config` (Object):** Stores static configuration parameters read at startup (exchange, symbol, Martingale settings, etc.).
*   **`state` (Object):** Holds the dynamic state of the bot:
    *   `openOrders`: An object mapping exchange order IDs (string) to the Martingale level (number, e.g., `0`, `1`, `2`) or the string `'takeProfit'`. Example: `{ "buyOrderId123": 0, "tpOrderId456": "takeProfit", "buyOrderId789": 1 }`
    *   `positions`: An array storing details of filled buy orders. Each element is an object: `{ price: number, amount: number, level: number }`.
    *   `isRunning`: Boolean flag indicating if the bot should continue operating.
    *   `martinLevels`: Array of calculated buy price levels (numbers).
    *   `martinAmounts`: Array of calculated buy amounts (numbers).
    *   `totalInvested`: Total quote currency spent on the current position (number).
    *   `totalAmount`: Total base currency held in the current position (number).
    *   `averageCost`: Calculated average cost basis of the current position (number).
    *   `takeProfitPrice`: Calculated take-profit sell price for the current position (number).
    *   `stopLossPrice`: Calculated stop-loss price (number, based on `initialPrice`).
    *   `takeProfitOrderId`: The ID of the currently active take-profit limit sell order (string or null).
    *   `stopLossOrderId`: (Currently unused in the code, but potentially for a future stop-loss limit order implementation).

## 5. Key Design Patterns

1. **Service Layer:** Clear separation between business logic and infrastructure
2. **Event-Driven Architecture:** Loose coupling between components
3. **Dependency Injection:** Services receive their dependencies
4. **Repository Pattern:** Prisma provides data access abstraction
5. **Strategy Pattern:** MartingaleEngine encapsulates trading algorithm

## 6. Security Considerations

- **Credential Storage:** API secrets in secure config file only
- **Database Security:** 
  - No sensitive data in DB
  - Proper access controls
  - Encrypted connections
- **Operation Logging:** Full audit trail of all actions
- **Error Handling:** Secure logging of errors without exposing secrets

*(Document updated to reflect new architecture as of 2025-04-09.)*
