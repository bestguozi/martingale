const { PrismaClient } = require('@prisma/client');

// Instantiate PrismaClient
const prisma = new PrismaClient();

// Export the instance
module.exports = prisma;
