require('dotenv').config(); // 引入dotenv库以加载环境变量
const ccxt = require('ccxt'); // 引入ccxt库
const crypt = require('./src/lib/crypt'); // 引入自定义加密库

const exchange = new ccxt.binance({
    apiKey: process.env.API_KEY,
    secret: process.env.API_SECRET,
    enableRateLimit: true,
    options: {
        'adjustForTimeDifference': true // 自动调整时间差异
    }
});

exchange.set_sandbox_mode(true); // 设置为沙盒模式，避免实际交易

/**
 * 获取当前在线交易对列表
 * @returns {Promise<Array>} 返回可交易的交易对列表
 */
async function getActiveSymbols() {
    try {
        await exchange.loadMarkets();
        const markets = exchange.markets;
        
        // 过滤出活跃的交易对
        const activeSymbols = Object.keys(markets).filter(symbol => {
            return markets[symbol].active === true;
        });
        
        return activeSymbols;
    } catch (error) {
        console.error('获取交易对列表时出错:', error.message);
        throw error;
    }
}

/**
 * 获取当前用户所有未完成的订单
 * @param {string} symbol 交易对，可选参数。如果提供，则只获取特定交易对的订单
 * @returns {Promise<Array>} 返回未完成订单的数组
 */
async function getCurrentOrders(symbol = undefined) {
    try {
        // 获取所有未完成的订单
        const orders = await exchange.fetchOpenOrders(symbol);
        
        return orders.map(order => ({
            id: order.id,
            symbol: order.symbol,
            type: order.type,
            side: order.side,
            price: order.price,
            amount: order.amount,
            status: order.status,
            timestamp: order.timestamp,
            datetime: order.datetime
        }));
    } catch (error) {
        console.error('获取当前订单时出错:', error.message);
        throw error;
    }
}


(async () => {
    try {
        const pass = process.env.API_KEY_ENCRYPTION_KEY; // 获取加密密钥
        const data = 'this is a test data'; // 测试数据
        const encrypted = crypt.encrypt(data, pass); // 加密数据
        console.log('Encrypted Data:', encrypted);
        const decrypted = crypt.decrypt(encrypted, pass); // 解密数据
        console.log('Decrypted Data:', decrypted); // 输出解密后的数据
        console.log('validation:', data === decrypted); // 验证加密和解密是否一致

        // // 确保加载交易所市场
        // await exchange.loadMarkets();
        
        // // 获取SOL/USDT的ticker信息
        // const ticker = await exchange.fetchTicker('SOL/USDT'); 
        // // 获取最新价格
        // console.log('Last Price:', ticker.last);

        // const result = await getActiveSymbols(); // 获取活跃的交易对列表
        // console.log('可交易的交易对:', result.slice(0, 10) + '... 等'); // 只显示前10个

        // const orders= await getCurrentOrders('SOL/USDT'); // 获取当前所有未完成的订单
        // console.log('当前未完成的订单:', orders.length > 0 ? orders : '没有未完成的订单');
        
        // 如果需要获取多个交易对的ticker
        // const tickers = await exchange.fetchTickers(['SOL/USDT', 'BTC/USDT']);
        // console.log('Multiple Tickers:', tickers);
    } catch (error) {
        console.error('发生错误:', error.message);
        
        // 如果是交易对不存在的错误，提供帮助信息
        if (error instanceof ccxt.BadSymbol) {
            console.log('可用的交易对列表:');
            const markets = await exchange.loadMarkets();
            console.log(Object.keys(markets).slice(0, 10) + '... 等'); // 只显示前10个
        }
    }
})();