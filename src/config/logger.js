const winston = require('winston');
const PrismaTransport = require('../lib/prismaTransport'); // Import the custom transport

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }), // Log stack traces for errors
    winston.format.splat(),
    winston.format.json() // Log in JSON format
);

// Basic console transport for now
// We will add the Prisma transport later
const consoleTransport = new winston.transports.Console({
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple() // Simple format for console readability
    ),
    level: 'debug', // Log debug level and above to console
});

const logger = winston.createLogger({
    level: 'info', // Default minimum log level
    format: logFormat,
    transports: [
        consoleTransport,
        new PrismaTransport({ level: 'info' }) // Add Prisma transport, logging 'info' level and above to DB
    ],
    exitOnError: false, // Do not exit on handled exceptions
});

module.exports = logger;
