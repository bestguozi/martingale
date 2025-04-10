require('dotenv').config(); // Load .env variables first
const log = require('./src/services/logService');
const strategyService = require('./src/services/strategyService');
const prisma = require('./src/lib/prisma'); // Import prisma instance for graceful shutdown

log.info('Application starting...');

let isShuttingDown = false;

/**
 * Handles graceful shutdown.
 */
async function shutdown(signal) {
    if (isShuttingDown) {
        log.warn(`Shutdown already in progress. Received ${signal} again.`);
        return;
    }
    isShuttingDown = true;
    log.warn(`Received ${signal}. Starting graceful shutdown...`);

    // Stop all strategy engines
    await strategyService.stopAllStrategies();

    // Disconnect Prisma client
    try {
        await prisma.$disconnect();
        log.info('Prisma client disconnected.');
    } catch (e) {
        log.error('Error disconnecting Prisma client:', e);
    }

    log.info('Shutdown complete. Exiting.');
    process.exit(0);
}

// Listen for termination signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
    // Consider if shutdown is needed here, but be careful of async operations
    // shutdown('uncaughtException'); // Potentially risky
    process.exit(1); // Exit immediately on uncaught exception
});
process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Consider if shutdown is needed here
    // shutdown('unhandledRejection'); // Potentially risky
    process.exit(1); // Exit immediately on unhandled rejection
});


/**
 * Main application function.
 */
async function main() {
    try {
        // Start all active strategies defined in the database
        await strategyService.startAllStrategies();

        log.info('Application initialized and strategies started.');

    } catch (error) {
        log.error('Fatal error during application startup:', error);
        await shutdown('startupError'); // Attempt graceful shutdown on startup error
        process.exit(1);
    }
}

// Run the main function
main();
