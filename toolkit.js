require('dotenv').config(); // 引入dotenv库以加载环境变量
const ccxt = require('ccxt'); // 引入ccxt库

const exchange = new ccxt.binance({
    apiKey: process.env.API_KEY,
    secret: process.env.API_SECRET,
    enableRateLimit: true,
    options: {
        'adjustForTimeDifference': true // 自动调整时间差异
    }
});

exchange.set_sandbox_mode(true); // 设置为沙盒模式，避免实际交易

(async () => {
    try {
        // 确保加载交易所市场
        await exchange.loadMarkets();
        
        // 获取SOL/USDT的ticker信息
        const ticker = await exchange.fetchTicker('SOL/USDT'); 
        console.log('Ticker:', ticker); // 输出市场数据
        
        // 获取最新价格
        console.log('Last Price:', ticker.last);
        
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