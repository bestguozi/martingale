/**
 * 策略服务 - 管理交易策略执行
 * 
 * 此服务处理策略实例的启动/停止，并管理交易引擎与交易所API之间的通信。
 */

const ccxt = require('ccxt');
const prisma = require('../lib/prisma');
const log = require('./logService');
const MartingaleEngine = require('../core/MartingaleEngine');
const userService = require('./userService');

// 活跃引擎实例和它们的CCXT连接的内存存储
// 键: 策略ID, 值: { engine: MartingaleEngine, exchange: ccxt.Exchange }
const activeEngines = new Map();

/**
 * 初始化并启动单个策略实例。
 * @param {object} strategy - 来自数据库的策略对象(包含关联数据)。
 */
async function startStrategyInstance(strategy) {
    // 验证策略是否具有必需的数据
    if (!strategy || !strategy.parameters) {
        log.error(`无法启动策略 ${strategy?.id}: 缺少参数。`);
        return;
    }
    // 检查策略是否已在运行
    if (activeEngines.has(strategy.id)) {
        log.warn(`策略 ${strategy.id} (${strategy.symbol}) 已经在运行中。`);
        return;
    }

    const { id: strategyId, userId, symbol, parameters, state: initialDbState } = strategy;

    log.info(`尝试为用户 ${userId} 启动策略 ${strategyId} (${symbol})...`);

    // 检索用户的交易所API凭据
    const userApiKey = await userService.getUserApiKey(userId);
    if (!userApiKey || !userApiKey.apiKey || !userApiKey.apiSecret) {
        log.error(`无法启动策略 ${strategyId}: 用户 ${userId} 没有配置有效的API密钥。`);
        await updateStrategyState(strategyId, { isRunning: false, lastError: '未配置有效的API密钥' });
        return;
    }

    // 使用CCXT初始化与加密交易所的连接
    let exchange;
    try {
        const exchangeOptions = {
            apiKey: userApiKey.apiKey,
            secret: userApiKey.apiSecret,
            enableRateLimit: true, // 防止频率限制问题
        };
        // 如果提供了可选密码则添加
        if (userApiKey.apiPassword) {
            exchangeOptions.password = userApiKey.apiPassword;
        }
        exchange = new ccxt[userApiKey.exchangeId](exchangeOptions);
        exchange.set_sandbox_mode(true); // 设置沙盒模式
    } catch (error) {
        log.error(`为策略 ${strategyId} 在交易所 ${userApiKey.exchangeId} 初始化CCXT失败`, error, { userId, strategyId });
        await updateStrategyState(strategyId, { isRunning: false, lastError: `CCXT初始化失败: ${error.message}` });
        return;
    }

    // 创建马丁格尔策略引擎实例
    const engine = new MartingaleEngine(strategyId, userId, exchange, symbol, parameters, initialDbState);

    // 在初始化/启动前添加事件监听器
    attachEngineListeners(engine);

    // 初始化引擎(加载市场数据，验证参数)
    const initialized = await engine.initialize();
    if (!initialized) {
        log.error(`策略 ${strategyId} 初始化失败。`);
        await updateStrategyState(strategyId, { isRunning: false, lastError: '引擎初始化失败' });
        return;
    }

    // 将活跃的引擎和交易所实例存储在内存中
    activeEngines.set(strategyId, { engine, exchange });

    // 启动引擎的监控循环
    engine.start();

    log.info(`策略 ${strategyId} (${symbol}) 成功启动。`);
}

/**
 * 停止单个策略实例。
 * @param {number} strategyId - 要停止的策略的ID。
 * @param {boolean} [cancelOrders=true] - 是否取消未完成的订单
 * @param {boolean} [sellPosition=false] - 是否出售当前持仓
 */
async function stopStrategyInstance(strategyId, cancelOrders = true, sellPosition = false) {
    const instance = activeEngines.get(strategyId);
    if (!instance || !instance.engine) {
        log.warn(`策略 ${strategyId} 未运行或未找到。`);
        await updateStrategyState(strategyId, { isRunning: false });
        return;
    }

    log.info(`正在停止策略 ${strategyId}...`);
    await instance.engine.stop(cancelOrders, sellPosition);
    activeEngines.delete(strategyId);
    log.info(`策略 ${strategyId} 已停止并从活跃实例中移除。`);
}

/**
 * 为引擎事件添加监听器，以处理订单执行和状态更新。
 * @param {MartingaleEngine} engine - 引擎实例。
 */
function attachEngineListeners(engine) {
    const strategyId = engine.strategyId;

    // 处理来自引擎的状态更新事件
    engine.on('stateUpdate', async (sId, stateUpdate) => {
        if (sId !== strategyId) return;
        log.debug(`接收到策略 ${strategyId} 的状态更新`, { stateUpdate });
        await updateStrategyState(strategyId, stateUpdate);
    });

    // 处理来自引擎的下单请求
    engine.on('placeOrderRequest', async (sId, orderParams) => {
        if (sId !== strategyId) return;
        const instance = activeEngines.get(strategyId);
        if (!instance || !instance.exchange) return;

        log.info(`处理策略 ${strategyId} 的下单请求`, { orderParams });
        try {
            let order;
            // 确保订单参数包含所需的字段
            if (!orderParams.symbol || !orderParams.side || !orderParams.amount || !orderParams.type) {
                throw new Error('下单请求缺少必要的参数。');
            }

            // 检查市场是否处于关闭状态
            const market = instance.exchange.markets[orderParams.symbol];
            if (market && market.active === false) {
                throw new Error(`市场 ${orderParams.symbol} 当前处于关闭状态。`);
            }
            // 根据请求下限价单或市价单
            if (orderParams.type === 'limit') {
                order = await instance.exchange.createLimitOrder(
                    orderParams.symbol,
                    orderParams.side,
                    orderParams.amount,
                    orderParams.price
                );
            } else if (orderParams.type === 'market') {
                 order = await instance.exchange.createMarketOrder(
                    orderParams.symbol,
                    orderParams.side,
                    orderParams.amount
                );
            } else {
                throw new Error(`不支持的订单类型: ${orderParams.type}`);
            }

            log.info(`策略 ${strategyId} 成功下单。订单ID: ${order.id}`, { order });

            // 如果订单有标签(例如止盈)，则在策略状态中跟踪
            if (orderParams.tag && order.id) {
                 engine.state.openOrders[order.id] = orderParams.tag;
                 if (orderParams.tag === 'takeProfit') {
                     engine.state.takeProfitOrderId = order.id;
                 }
                 await updateStrategyState(strategyId, {
                     openOrders: engine.state.openOrders,
                     takeProfitOrderId: engine.state.takeProfitOrderId
                 });
            }

        } catch (error) {
            log.error(`策略 ${strategyId} 下单失败`, error, { orderParams });
            await updateStrategyState(strategyId, { lastError: `下单失败: ${error.message}` });
            // 如果资金不足则停止策略(特殊情况)
            if (error instanceof ccxt.InsufficientFunds) {
                 log.error(`策略 ${strategyId} 资金不足。正在停止引擎。`, null, { strategyId });
                 await stopStrategyInstance(strategyId, true, false);
            }
        }
    });

    // 处理来自引擎的订单取消请求
    engine.on('cancelOrderRequest', async (sId, orderId, symbol) => {
        if (sId !== strategyId) return;
        const instance = activeEngines.get(strategyId);
        if (!instance || !instance.exchange) return;

        log.info(`处理策略 ${strategyId} 的订单取消请求，订单ID: ${orderId}`);
        try {
            await instance.exchange.cancelOrder(orderId, symbol);
            log.info(`策略 ${strategyId} 的订单 ${orderId} 已成功取消。`);
        } catch (error) {
             if (error instanceof ccxt.OrderNotFound) {
                 log.warn(`取消订单时在交易所上未找到订单 ${orderId} (策略 ${strategyId})。已经关闭或取消？`);
             } else {
                 log.error(`策略 ${strategyId} 取消订单 ${orderId} 失败`, error);
                 await updateStrategyState(strategyId, { lastError: `订单取消失败: ${error.message}` });
             }
        }
    });

     // 处理检查订单状态的请求
     engine.on('checkOrdersRequest', async (sId, orderIds, symbol) => {
        if (sId !== strategyId) return;
        const instance = activeEngines.get(strategyId);
        if (!instance || !instance.exchange) return;

        log.debug(`处理策略 ${strategyId} 的检查订单请求`, { orderIds });
        for (const orderId of orderIds) {
            try {
                const order = await instance.exchange.fetchOrder(orderId, symbol);
                instance.engine.handleOrderUpdate(order);
            } catch (error) {
                 if (error instanceof ccxt.OrderNotFound) {
                     log.warn(`检查过程中在交易所上未找到订单 ${orderId} (策略 ${strategyId})。推送'未找到'更新。`);
                     instance.engine.handleOrderUpdate({ id: orderId, status: 'canceled', symbol: symbol });
                 } else {
                     log.error(`策略 ${strategyId} 获取订单 ${orderId} 失败`, error);
                 }
            }
            // API调用之间有小延迟以防止频率限制
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    });

    // 处理来自引擎的关键错误
    engine.on('error', async (sId, error) => {
        if (sId !== strategyId) return;
        log.error(`策略 ${strategyId} 的引擎中出现关键错误`, error);
        await updateStrategyState(strategyId, { isRunning: false, lastError: `引擎错误: ${error.message}` });
    });
}

/**
 * 更新策略的状态到数据库。
 * 此函数会使用upsert操作，如果策略状态不存在，则创建一个新记录。
 * 如果策略状态存在，则更新现有记录。
 * @param {number} strategyId - 策略的ID。
 * @param {object} stateUpdate - 包含要更新的状态字段的对象。
 */

/**
 * 在数据库中更新策略状态。
 * @param {number} strategyId - 策略的ID。
 * @param {object} stateUpdate - 包含要更新的状态字段的对象。
 */
async function updateStrategyState(strategyId, stateUpdate) {
    try {
        // 安全解析数值的辅助函数 - 确保返回数字或默认值0（不返回null）
        const parseNum = (val) => {
            const parsed = parseFloat(val);
            return (!isNaN(parsed)) ? parsed : 0;  // 返回0而不是null
        };
        
        // 准备要更新的数据
        const dataToUpdate = {};
        
        // 布尔值字段
        if (stateUpdate.isRunning !== undefined) {
            dataToUpdate.isRunning = Boolean(stateUpdate.isRunning);
        }
        
        // JSON类型字段，确保有效的JSON或null
        if (stateUpdate.openOrders !== undefined) {
            dataToUpdate.openOrders = stateUpdate.openOrders || {};
        }
        
        if (stateUpdate.positions !== undefined) {
            dataToUpdate.positions = stateUpdate.positions || {};
        }
        
        if (stateUpdate.martinLevels !== undefined) {
            dataToUpdate.martinLevels = stateUpdate.martinLevels || {};
        }
        
        if (stateUpdate.martinAmounts !== undefined) {
            dataToUpdate.martinAmounts = stateUpdate.martinAmounts || {};
        }
        
        // Decimal类型字段，确保有效数字
        if (stateUpdate.totalInvested !== undefined) {
            dataToUpdate.totalInvested = parseNum(stateUpdate.totalInvested);
        }
        
        if (stateUpdate.totalAmount !== undefined) {
            dataToUpdate.totalAmount = parseNum(stateUpdate.totalAmount);
        }
        
        if (stateUpdate.averageCost !== undefined) {
            dataToUpdate.averageCost = parseNum(stateUpdate.averageCost);
        }
        
        // Decimal类型可为null的字段
        if ('takeProfitPrice' in stateUpdate) {
            dataToUpdate.takeProfitPrice = stateUpdate.takeProfitPrice !== null ? 
                parseFloat(stateUpdate.takeProfitPrice) : null;
        }
        
        if ('stopLossPrice' in stateUpdate) {
            dataToUpdate.stopLossPrice = stateUpdate.stopLossPrice !== null ? 
                parseFloat(stateUpdate.stopLossPrice) : null;
        }
        
        // String类型字段
        if ('takeProfitOrderId' in stateUpdate) {
            dataToUpdate.takeProfitOrderId = stateUpdate.takeProfitOrderId || null;
        }
        
        if ('lastError' in stateUpdate) {
            dataToUpdate.lastError = stateUpdate.lastError || null;
        }

        if (Object.keys(dataToUpdate).length > 0) {
            log.debug(`更新策略 ${strategyId} 的数据库状态`, { dataToUpdate });
            
            // 使用upsert创建状态(如果尚不存在)
            await prisma.strategyState.upsert({
                where: { strategyId: strategyId },
                update: dataToUpdate,
                create: {
                    strategyId: strategyId,
                    ...dataToUpdate,
                },
            });
        }
    } catch (error) {
        log.error(`更新策略 ${strategyId} 的数据库状态失败`, error, { stateUpdate });
        throw error; // 重新抛出错误，让调用方可以处理
    }
}

/**
 * 从数据库加载所有活跃策略并启动它们的引擎。
 * 在应用程序启动时调用。
 */
async function startAllStrategies() {
    log.info('启动所有活跃策略...');

    try {
        // 查找所有活跃策略及其参数和当前状态
        const strategies = await prisma.strategy.findMany({
            where: { isActive: true },
            include: {
                parameters: true,
                state: true,
            },
        });

        log.info(`找到 ${strategies.length} 个要启动的活跃策略。`);

        // 每个策略之间有小延迟地启动，以防止过度使用交易所API
        for (const strategy of strategies) {
            await startStrategyInstance(strategy);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } catch (error) {
        log.error('从数据库加载或启动策略失败。', error);
    }
}

/**
 * 优雅地停止所有运行中的策略引擎。
 * 在应用程序关闭时使用。
 */
async function stopAllStrategies() {
    log.info('停止所有活跃的策略引擎...');
    const strategyIds = Array.from(activeEngines.keys());
    for (const strategyId of strategyIds) {
        await stopStrategyInstance(strategyId, true, false);
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    log.info('所有活跃引擎已停止。');
}

module.exports = {
    startAllStrategies,
    stopAllStrategies,
    startStrategyInstance,
    stopStrategyInstance,
};
