const Transport = require('winston-transport');
const prisma = require('./prisma'); // Import the Prisma Client instance

// Define the custom Prisma Transport
class PrismaTransport extends Transport {
    constructor(opts) {
        super(opts);
        // You can pass options here if needed, e.g., specific log levels
        this.level = opts?.level || 'info'; // Default level if not specified
    }

    async log(info, callback) {
        setImmediate(() => {
            this.emit('logged', info);
        });

        const { level, message, timestamp, userId, strategyId, context, stack, ...meta } = info;

        // Prepare data for Prisma
        const logData = {
            level: level.toUpperCase(), // Ensure level is uppercase (e.g., INFO, ERROR)
            message: message || '',
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            userId: userId ? parseInt(userId, 10) : null,
            strategyId: strategyId ? parseInt(strategyId, 10) : null,
            // Store stack trace in message for errors, or stringify remaining meta as context
            context: stack ? { stack, ...meta, ...context } : (Object.keys(meta).length > 0 || context ? { ...meta, ...context } : null),
        };

        // Ensure IDs are valid numbers or null
        if (isNaN(logData.userId)) logData.userId = null;
        if (isNaN(logData.strategyId)) logData.strategyId = null;


        try {
            await prisma.operationLog.create({
                data: logData,
            });
        } catch (error) {
            console.error('Failed to write log to Prisma:', error, 'Log data:', logData);
            // Optionally emit an error event
            this.emit('error', error);
        }

        // Winston requires the callback function to be called.
        callback();
    }
}

module.exports = PrismaTransport;
