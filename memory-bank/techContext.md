# Technical Context: Multi-User Martingale Trading System

## 1. Core Technologies

*   **Runtime Environment:** Node.js
*   **Primary Language:** JavaScript (ES modules)
*   **Package Manager:** pnpm
*   **Database:** MySQL with Prisma ORM

## 2. Key Libraries & Dependencies

*   **`ccxt`:** Cryptocurrency exchange API library (100+ exchanges supported)
*   **`dotenv`:** Environment variable configuration
*   **`winston`:** Logging library with console and database transports
*   **`prisma`:** Modern ORM for database access
*   **`express`:** Web framework (optional, for future API)
*   **`jsonwebtoken`:** Authentication tokens (optional, for future API)

## 3. Development & Execution Environment

*   **Setup:**
    1. Install Node.js, pnpm and MySQL
    2. Run `pnpm install` to install dependencies
    3. Configure `.env` with database connection
    4. Run database migrations: `npx prisma migrate dev`
    5. Populate `config/secrets.json` with API credentials

*   **Configuration:**
    * Database-driven configuration for strategies
    * Environment variables for core settings
    * Secure config file for sensitive API credentials

*   **Execution:**
    * Main entry point: `node app.js`
    * Automatically loads and starts all active strategies
    * Graceful shutdown handling

## 4. Technical Constraints & Considerations

*   **API Rate Limits:** CCXT's built-in rate limiting is enabled. StrategyService implements staggered order checks.
*   **Error Handling:** Comprehensive error handling with logging to database. Critical errors trigger strategy shutdown.
*   **Concurrency:** Async/await used throughout. Strategy engines run independently with isolated state.
*   **Data Integrity:** Database transactions ensure consistent state. Prisma handles connection pooling.
*   **Security:** API secrets stored separately from code. Database contains only public key metadata.
*   **Scalability:** Modular design allows horizontal scaling. Each strategy runs in its own engine instance.
*   **Recovery:** Strategies automatically reload their state from database on restart.
