const logger = require('../config/logger');

/**
 * Logs an informational message.
 * @param {string} message - The message to log.
 * @param {object} [meta={}] - Optional metadata.
 * @param {number} [meta.userId] - Optional user ID.
 * @param {number} [meta.strategyId] - Optional strategy ID.
 * @param {object} [meta.context] - Optional additional context object.
 */
function info(message, meta = {}) {
    logger.info(message, meta);
}

/**
 * Logs a warning message.
 * @param {string} message - The message to log.
 * @param {object} [meta={}] - Optional metadata.
 * @param {number} [meta.userId] - Optional user ID.
 * @param {number} [meta.strategyId] - Optional strategy ID.
 * @param {object} [meta.context] - Optional additional context object.
 */
function warn(message, meta = {}) {
    logger.warn(message, meta);
}

/**
 * Logs an error message.
 * @param {string} message - The error message.
 * @param {Error} [error] - Optional error object.
 * @param {object} [meta={}] - Optional metadata.
 * @param {number} [meta.userId] - Optional user ID.
 * @param {number} [meta.strategyId] - Optional strategy ID.
 * @param {object} [meta.context] - Optional additional context object.
 */
function error(message, error, meta = {}) {
    // Include the error object itself in the log call for Winston's error formatting
    if (error instanceof Error) {
        logger.error(message, { ...meta, error });
    } else {
        // If 'error' is not an Error object, treat it as part of meta or message
        logger.error(`${message}${error ? ': ' + error : ''}`, meta);
    }
}

/**
 * Logs a debug message.
 * @param {string} message - The message to log.
 * @param {object} [meta={}] - Optional metadata.
 * @param {number} [meta.userId] - Optional user ID.
 * @param {number} [meta.strategyId] - Optional strategy ID.
 * @param {object} [meta.context] - Optional additional context object.
 */
function debug(message, meta = {}) {
    logger.debug(message, meta);
}

module.exports = {
    info,
    warn,
    error,
    debug,
    // Expose the raw logger instance if needed elsewhere
    rawLogger: logger,
};
