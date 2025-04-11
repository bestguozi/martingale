// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const crypt = require('../src/lib/crypt'); // 引入加密函数
require('dotenv').config(); // 加载 .env 文件中的环境变量

const prisma = new PrismaClient();

// --- 配置 ---
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY;
const TEST_USERNAME = 'test_user';
const TEST_API_KEY = 'QW9lNpDnLYTdFbe7J9hsrtXOha5EAJFFSB32N6wZAIYE1RUp6uGVY217yWBPWvvK';
const TEST_API_SECRET = 'l9m2isfKrHS4zKigIDcJHgZgCPAQR4eO2NmcC46D1x0FiTgu0VHgc1ruCNQWzQhx';
const TEST_API_PASSWORD = null; // 可选，假设没有设置密码
const TEST_EXCHANGE_ID = 'binance'; // 假设是binance, 如果需要可以修改

const STRATEGY_NAME = 'm2';
const STRATEGY_SYMBOL = 'SOL/USDT';
const STRATEGY_PARAMS = {
    initialPrice: 109,
    initialAmount: 10,
    levels: 2,
    priceDropPercent: 8,
    amountMultiplier: 2,
    takeProfit: 8,
    stopLoss: 10,
    // checkInterval: 60000, // 使用默认值
    // initialPrice: null, // 允许策略启动时确定
};
// --- /配置 ---



async function main() {
    console.log('开始填充测试数据...');

    if (!ENCRYPTION_KEY) {
        console.error('错误：未设置 API_KEY_ENCRYPTION_KEY 环境变量。请在 .env 文件中设置一个 32 字节的密钥 (64 个十六进制字符)。');
        process.exit(1);
    }

    // 1. 创建或查找测试用户
    let user = await prisma.user.findUnique({
        where: { username: TEST_USERNAME },
    });

    if (!user) {
        console.log(`创建测试用户: ${TEST_USERNAME}`);
        user = await prisma.user.create({
            data: {
                username: TEST_USERNAME,
                exchangeId: TEST_EXCHANGE_ID,
                apiKey: crypt.encrypt(TEST_API_KEY, ENCRYPTION_KEY),
                apiSecret: crypt.encrypt(TEST_API_SECRET, ENCRYPTION_KEY),
                apiPassword: TEST_API_PASSWORD ? crypt.encrypt(TEST_API_PASSWORD, ENCRYPTION_KEY) : null, // 可选，假设没有设置密码
                description: 'Test User for Binance Testnet',
                isApiActive: true,
            },
        });
        console.log(`用户 ${user.username} (ID: ${user.id}) 已创建并添加 API 密钥。`);
    } else {
        console.log(`用户 ${TEST_USERNAME} 已存在，更新其 API 密钥...`);
        user = await prisma.user.update({
            where: { id: user.id },
            data: {
                exchangeId: TEST_EXCHANGE_ID,
                apiKey: crypt.encrypt(TEST_API_KEY, ENCRYPTION_KEY),
                apiSecret: crypt.encrypt(TEST_API_SECRET, ENCRYPTION_KEY),
                apiPassword: TEST_API_PASSWORD ? crypt.encrypt(TEST_API_PASSWORD, ENCRYPTION_KEY) : null, // 可选，假设没有设置密码
                description: 'Test User for Binance Testnet',
                isApiActive: true,
            },
        });
         console.log(`用户 ${user.username} (ID: ${user.id}) 的 API 密钥已更新。`);
    }

    // 2. 创建或更新测试策略
    let strategy = await prisma.strategy.findFirst({
        where: {
            userId: user.id,
            name: STRATEGY_NAME,
        },
    });

    if (!strategy) {
        console.log(`为用户 ${user.username} 创建策略: ${STRATEGY_NAME}`);
        strategy = await prisma.strategy.create({
            data: {
                userId: user.id,
                name: STRATEGY_NAME,
                symbol: STRATEGY_SYMBOL,
                strategyType: 'martingale',
                isActive: true, // 默认激活策略以便测试
                parameters: {
                    create: STRATEGY_PARAMS,
                },
                // state: { create: {} } // 可选：如果需要创建初始空状态
            },
            include: { parameters: true }, // 包含参数以便打印
        });
        console.log(`策略 ${strategy.name} (ID: ${strategy.id}) 已创建，参数:`, strategy.parameters);
    } else {
        console.log(`策略 ${STRATEGY_NAME} 已存在，更新其参数...`);
        strategy = await prisma.strategy.update({
            where: { id: strategy.id },
            data: {
                symbol: STRATEGY_SYMBOL, // 允许更新交易对
                isActive: true,
                parameters: {
                    upsert: { // 如果存在则更新，不存在则创建 (虽然上面已检查，但upsert更安全)
                        create: STRATEGY_PARAMS,
                        update: STRATEGY_PARAMS,
                    }
                },
            },
             include: { parameters: true },
        });
         console.log(`策略 ${strategy.name} (ID: ${strategy.id}) 的参数已更新:`, strategy.parameters);
    }

    console.log('测试数据填充完成。');
}

main()
    .catch((e) => {
        console.error('填充数据时出错:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
