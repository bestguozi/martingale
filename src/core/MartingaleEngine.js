const ccxt = require('ccxt'); // 如果exchange实例处理所有操作，可能不需要直接使用
const log = require('../services/logService');
const EventEmitter = require('events');

class MartingaleEngine extends EventEmitter {
    /**
     * 创建MartingaleEngine实例
     * @param {number} strategyId - 策略实例的唯一ID
     * @param {number} userId - 拥有该策略的用户ID
     * @param {ccxt.Exchange} exchange - 已初始化的CCXT交易所实例
     * @param {string} symbol - 交易对符号(如'BTC/USDT')
     * @param {object} params - 来自strategy_parameters表的策略参数
     * @param {object} [initialDbState] - 可选的来自strategy_states表的初始状态
     */
    constructor(strategyId, userId, exchange, symbol, params, initialDbState = {}) {
        super();
        this.strategyId = strategyId;
        this.userId = userId;
        this.exchange = exchange;
        this.symbol = symbol;
        this.params = params; // { initialPrice:初始价格, priceDropPercent:价格下跌百分比, levels:层级数, initialAmount:初始数量, amountMultiplier:数量乘数, takeProfit:止盈, stopLoss:止损, checkInterval:检查间隔 }

        this.market = null; // 将在initialize中加载
        this.isRunning = false; // 引擎运行状态
        this.checkIntervalId = null; // 存储setInterval的ID

        // --- 内部状态 ---
        // 从数据库或默认值初始化状态
        this.state = {
            openOrders: initialDbState.openOrders || {}, // { orderId: 层级 | 'takeProfit' }
            positions: initialDbState.positions || [], // [{ price:价格, amount:数量, level:层级 }]
            martinLevels: initialDbState.martinLevels || [],
            martinAmounts: initialDbState.martinAmounts || [],
            totalInvested: parseFloat(initialDbState.totalInvested) || 0,
            totalAmount: parseFloat(initialDbState.totalAmount) || 0,
            averageCost: parseFloat(initialDbState.averageCost) || 0,
            takeProfitPrice: parseFloat(initialDbState.takeProfitPrice) || 0,
            stopLossPrice: parseFloat(initialDbState.stopLossPrice) || 0,
            takeProfitOrderId: initialDbState.takeProfitOrderId || null,
            // 注意: stopLossOrderId在原始代码中未使用，暂时省略
        };

        this.logPrefix = `[Strategy ${this.strategyId} (${this.symbol})]`; // 便于日志阅读
        log.info(`${this.logPrefix} Engine created.`, { userId: this.userId, strategyId: this.strategyId });
    }

    /**
     * 初始化引擎：加载市场数据，计算层级，验证状态
     * 在启动引擎前需要调用
     */
    async initialize() {
        log.info(`${this.logPrefix} Initializing...`, { userId: this.userId, strategyId: this.strategyId });
        try {
            // 加载市场数据
            await this.exchange.loadMarkets();
            this.market = this.exchange.markets[this.symbol];
            if (!this.market) {
                throw new Error(`Market ${this.symbol} not found on ${this.exchange.id}`);
            }
            log.info(`${this.logPrefix} Market loaded: ${this.symbol}. Base: ${this.market.base}, Quote: ${this.market.quote}`, { userId: this.userId, strategyId: this.strategyId });
            log.info(`${this.logPrefix} Precision: Amount=${this.market.precision.amount}, Price=${this.market.precision.price}`, { userId: this.userId, strategyId: this.strategyId });
            log.info(`${this.logPrefix} Limits: Min Amount=${this.market.limits.amount?.min}, Min Cost=${this.market.limits.cost?.min}`, { userId: this.userId, strategyId: this.strategyId });


            // 如果未从状态加载，则计算或验证马丁格尔层级
            if (!this.state.martinLevels || this.state.martinLevels.length === 0) {
                this._calculateMartinLevels();
                // 计算完成后发出状态更新
                this.emit('stateUpdate', this.strategyId, {
                    martinLevels: this.state.martinLevels,
                    martinAmounts: this.state.martinAmounts
                });
            } else {
            log.info(`${this.logPrefix} 使用从状态加载的马丁格尔层级`, { userId: this.userId, strategyId: this.strategyId });
            }
             log.info(`${this.logPrefix} 计算了${this.state.martinLevels.length}个马丁格尔层级`, { userId: this.userId, strategyId: this.strategyId });
             for (let i = 0; i < this.state.martinLevels.length; i++) {
                 log.debug(`${this.logPrefix} 层级${i}: 价格=${this.state.martinLevels[i]?.toFixed(4)}, 数量=${this.state.martinAmounts[i]?.toFixed(4)}`, { userId: this.userId, strategyId: this.strategyId });
             }


            // 根据市场限制验证数量
            this._validateAmounts();

            // 如果从状态加载，则重新计算仓位指标
             if (this.state.positions.length > 0) {
                 log.info(`${this.logPrefix} 从加载的状态重新计算仓位指标`, { userId: this.userId, strategyId: this.strategyId });
                 this._recalculatePosition(); // This also calculates initial stopLossPrice if needed
             } else {
                 // 即使没有仓位也计算初始止损价格
                 this.state.stopLossPrice = this.params.initialPrice * (1 - this.params.stopLoss / 100);
                 log.info(`${this.logPrefix} 初始止损价格计算完成: ${this.state.stopLossPrice.toFixed(4)}`, { userId: this.userId, strategyId: this.strategyId });
                 this.emit('stateUpdate', this.strategyId, { stopLossPrice: this.state.stopLossPrice });
             }

            log.info(`${this.logPrefix} 初始化完成`, { userId: this.userId, strategyId: this.strategyId });
            return true;

        } catch (error) {
            log.error(`${this.logPrefix} 初始化失败`, error, { userId: this.userId, strategyId: this.strategyId });
            this.emit('error', this.strategyId, error); 
            console.log(error);// Emit error event
            return false;
        }
    }

    /**
     * 启动引擎的主检查循环
     */
    start() {
        if (this.isRunning) {
            log.warn(`${this.logPrefix} 引擎已在运行中`, { userId: this.userId, strategyId: this.strategyId });
            return;
        }
        if (!this.market) {
             log.error(`${this.logPrefix} 引擎未初始化，启动前请先调用initialize()`, null, { userId: this.userId, strategyId: this.strategyId });
             this.emit('error', this.strategyId, new Error("Engine not initialized"));
             return;
        }

        log.info(`${this.logPrefix} 启动检查循环，间隔 ${this.params.checkInterval}毫秒...`, { userId: this.userId, strategyId: this.strategyId });
        this.isRunning = true;
        this.emit('stateUpdate', this.strategyId, { isRunning: true }); // Notify service

        // Initial check immediately, then set interval
        this._checkOrdersAndPrice().catch(err => {
             // 确保错误被完整记录，包括堆栈信息
             log.error(`${this.logPrefix} 初始检查失败`, err, { 
                 userId: this.userId, 
                 strategyId: this.strategyId, 
                 errorMessage: err.message || '未知错误', 
                 errorStack: err.stack || '没有堆栈信息'
             });
             this.emit('error', this.strategyId, {
                 message: err.message || '初始检查时发生未知错误',
                 stack: err.stack,
                 timestamp: new Date().toISOString()
             });
        });

        this.checkIntervalId = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(this.checkIntervalId);
                return;
            }
            try {
                await this._checkOrdersAndPrice();
            } catch (error) {
                 // 同样改进定期检查中的错误处理
                 log.error(`${this.logPrefix} 定期检查时发生错误`, error, { 
                     userId: this.userId, 
                     strategyId: this.strategyId,
                     errorMessage: error.message || '未知错误',
                     errorStack: error.stack || '没有堆栈信息'
                 });
                 this.emit('error', this.strategyId, {
                     message: error.message || '定期检查时发生未知错误',
                     stack: error.stack,
                     timestamp: new Date().toISOString()
                 });
                 // 可以考虑在特定错误条件下停止引擎
                 // if (error.message && error.message.includes('critical')) this.stop();
            }
        }, this.params.checkInterval);

        log.info(`${this.logPrefix} 引擎已启动`, { userId: this.userId, strategyId: this.strategyId });
    }

    /**
     * 停止引擎的主检查循环并执行清理
     * @param {boolean} [cancelOrders=true] - 是否取消交易所的未结订单
     * @param {boolean} [sellPosition=false] - 是否对当前仓位执行市价卖出
     */
    async stop(cancelOrders = true, sellPosition = false) {
        if (!this.isRunning && !this.checkIntervalId) {
            log.warn(`${this.logPrefix} 引擎未运行`, { userId: this.userId, strategyId: this.strategyId });
            return;
        }
        log.info(`${this.logPrefix} 正在停止引擎... 取消订单: ${cancelOrders}, 卖出仓位: ${sellPosition}`, { userId: this.userId, strategyId: this.strategyId });
        this.isRunning = false;

        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
            this.checkIntervalId = null;
        }

        const openOrderIds = Object.keys(this.state.openOrders);

        if (cancelOrders && openOrderIds.length > 0) {
            log.info(`${this.logPrefix} 正在取消${openOrderIds.length}个未结订单...`, { userId: this.userId, strategyId: this.strategyId });
            for (const orderId of openOrderIds) {
                try {
                    // Emit event for service to handle cancellation
                    this.emit('cancelOrderRequest', this.strategyId, orderId, this.symbol);
                    log.debug(`${this.logPrefix} 已请求取消订单 ${orderId}`, { userId: this.userId, strategyId: this.strategyId });
                    // Remove from local state immediately, assuming cancellation will succeed or fail gracefully
                    delete this.state.openOrders[orderId];
                    if (orderId === this.state.takeProfitOrderId) {
                        this.state.takeProfitOrderId = null;
                    }
                } catch (error) {
                    // Log error, but continue trying to cancel others
                    log.error(`${this.logPrefix} 请求取消订单${orderId}时出错`, error, { userId: this.userId, strategyId: this.strategyId });
                }
                await new Promise(resolve => setTimeout(resolve, 300)); // Small delay between cancellations
            }
        }
        // Clear local open orders state after attempting cancellation
        this.state.openOrders = {};
        this.state.takeProfitOrderId = null;


        if (sellPosition && this.state.totalAmount > 0) {
             log.info(`${this.logPrefix} 请求市价卖出剩余仓位: ${this.state.totalAmount} ${this.market.base}`, { userId: this.userId, strategyId: this.strategyId });
             try {
                 // Emit event for service to handle market sell
                 this.emit('placeOrderRequest', this.strategyId, {
                     symbol: this.symbol,
                     type: 'market',
                     side: 'sell',
                     amount: this.state.totalAmount,
                     tag: 'stop_sell' // Add a tag for logging/tracking
                 });
                 // Assume sell will execute; clear position locally. Service should confirm.
                 this.state.positions = [];
                 this._recalculatePosition(); // Reset position metrics

             } catch (error) {
                  log.error(`${this.logPrefix} 请求停止时市价卖出出错`, error, { userId: this.userId, strategyId: this.strategyId });
             }
        }

        // Final state update emission
        this.emit('stateUpdate', this.strategyId, {
            isRunning: false,
            openOrders: this.state.openOrders, // Should be empty now
            takeProfitOrderId: this.state.takeProfitOrderId, // Should be null now
            positions: this.state.positions, // May be empty if sellPosition was true
            totalInvested: this.state.totalInvested,
            totalAmount: this.state.totalAmount,
            averageCost: this.state.averageCost,
            takeProfitPrice: this.state.takeProfitPrice,
        });

        log.info(`${this.logPrefix} 引擎已停止`, { userId: this.userId, strategyId: this.strategyId });
    }


    // --- Internal Helper Methods ---

    /**
     * 根据参数计算马丁格尔层级和数量
     * @private
     */
    _calculateMartinLevels() {
        const prices = [this.params.initialPrice];
        const amounts = [this.params.initialAmount];

        for (let i = 1; i < this.params.levels; i++) {
            const priceDropFactor = 1 - (this.params.priceDropPercent / 100);
            const newPrice = prices[i - 1] * priceDropFactor;
            prices.push(newPrice);

            const newAmount = amounts[i - 1] * this.params.amountMultiplier;
            amounts.push(newAmount);
        }

        this.state.martinLevels = prices.map(p => parseFloat(p));
        this.state.martinAmounts = amounts.map(a => parseFloat(a));
    }

     /**
      * 根据市场限制验证计算出的数量
      * @private
      */
     _validateAmounts() {
         for (let i = 0; i < this.state.martinAmounts.length; i++) {
             const preciseAmount = parseFloat(this.exchange.amountToPrecision(this.symbol, this.state.martinAmounts[i]));
             const minAmount = this.market.limits.amount?.min || 0;
             if (preciseAmount < minAmount) {
                 throw new Error(`Level ${i} amount ${preciseAmount} is less than minimum ${minAmount}. Adjust initialAmount or amountMultiplier.`);
             }
             // Optional: Check cost limit if placing limit orders immediately (though we place based on price triggers)
             // const price = this.state.martinLevels[i];
             // const precisePrice = parseFloat(this.exchange.priceToPrecision(this.symbol, price));
             // const cost = preciseAmount * precisePrice;
             // const minCost = this.market.limits.cost?.min || 0;
             // if (cost < minCost) {
             //     throw new Error(`Level ${i} cost ${cost} is less than minimum ${minCost}.`);
             // }
         }
     }


    /**
     * 重新计算仓位指标(总投资、总数量、平均成本、止盈止损价格)
     * @private
     */
    _recalculatePosition() {
        let changed = false;
        const oldState = { ...this.state }; // Shallow copy for comparison

        if (!this.state.positions || this.state.positions.length === 0) {
            this.state.totalInvested = 0;
            this.state.totalAmount = 0;
            this.state.averageCost = 0;
            this.state.takeProfitPrice = 0;
            // Keep stopLossPrice as it's based on initial entry
        } else {
            let totalInvested = 0;
            let totalAmount = 0;
            for (const position of this.state.positions) {
                totalInvested += position.price * position.amount;
                totalAmount += position.amount;
            }

            this.state.totalInvested = totalInvested;
            this.state.totalAmount = totalAmount;
            this.state.averageCost = totalAmount > 0 ? totalInvested / totalAmount : 0;
            this.state.takeProfitPrice = this.state.averageCost * (1 + this.params.takeProfit / 100);
        }

        // Calculate stop loss price (only needs initial price, calculate once or ensure it's set)
        // Recalculate here ensures it's set even if loading state without it
        const initialEntryPrice = this.state.positions.length > 0 ? this.state.positions[0].price : this.params.initialPrice;
        this.state.stopLossPrice = initialEntryPrice * (1 - this.params.stopLoss / 100);


        // Check if significant state changed to warrant logging/emission
        if (oldState.totalInvested !== this.state.totalInvested ||
            oldState.totalAmount !== this.state.totalAmount ||
            oldState.averageCost !== this.state.averageCost ||
            oldState.takeProfitPrice !== this.state.takeProfitPrice ||
            oldState.stopLossPrice !== this.state.stopLossPrice)
        {
            changed = true;
            log.info(`${this.logPrefix} Position Recalculated: Invested=${this.state.totalInvested.toFixed(4)}, Amount=${this.state.totalAmount.toFixed(this.market.precision.amount)}, AvgCost=${this.state.averageCost.toFixed(4)}, TP=${this.state.takeProfitPrice.toFixed(4)}, SL=${this.state.stopLossPrice.toFixed(4)}`, { userId: this.userId, strategyId: this.strategyId });

            // Emit state update event
            this.emit('stateUpdate', this.strategyId, {
                totalInvested: this.state.totalInvested,
                totalAmount: this.state.totalAmount,
                averageCost: this.state.averageCost,
                takeProfitPrice: this.state.takeProfitPrice,
                stopLossPrice: this.state.stopLossPrice,
                positions: this.state.positions // Also emit updated positions array
            });
        }
        return changed;
    }

    /**
     * 通过事件请求挂单的内部辅助方法
     * @param {string} side - 'buy'买入或者'sell'卖出
     * @param {number} amount - 交易数量
     * @param {number} price - 限价价格
     * @param {string|number} tag - 订单关联的标签(如层级号、'takeProfit'止盈)
     * @private
     */
    _requestPlaceLimitOrder(side, amount, price, tag) {
        const preciseAmount = this.exchange.amountToPrecision(this.symbol, amount);
        const precisePrice = this.exchange.priceToPrecision(this.symbol, price);

        // Basic validation before emitting
        const minAmount = this.market.limits.amount?.min || 0;
        if (parseFloat(preciseAmount) < minAmount) {
            log.warn(`${this.logPrefix} 订单数量${preciseAmount}低于最小值${minAmount}。跳过请求。标签: ${tag}`, { userId: this.userId, strategyId: this.strategyId });
            return;
        }
        const minCost = this.market.limits.cost?.min || 0;
        if (minCost > 0 && parseFloat(preciseAmount) * parseFloat(precisePrice) < minCost) {
             log.warn(`${this.logPrefix} 订单成本(${preciseAmount} * ${precisePrice})低于最小值${minCost}。跳过请求。标签: ${tag}`, { userId: this.userId, strategyId: this.strategyId });
            return;
        }

        log.info(`${this.logPrefix} 请求${side}限价单: ${preciseAmount} @ ${precisePrice}。标签: ${tag}`, { userId: this.userId, strategyId: this.strategyId });
        this.emit('placeOrderRequest', this.strategyId, {
            symbol: this.symbol,
            type: 'limit',
            side,
            amount: preciseAmount,
            price: precisePrice,
            tag // Pass the tag (level or 'takeProfit')
        });
    }


    /**
     * 核心循环：获取价格、检查止损、检查未结订单、下新订单
     * @private
     */
    async _checkOrdersAndPrice() {
        // 记录调试日志，表明检查循环开始执行
        log.debug(`${this.logPrefix} Running check...`, { userId: this.userId, strategyId: this.strategyId });

        let currentPrice; // 声明变量存储当前市场价格
        try {
            // 从交易所API获取当前交易对的价格信息
            const ticker = await this.exchange.fetchTicker(this.symbol);
            // 提取最新成交价格
            currentPrice = ticker.last;
            // 如果价格获取失败则抛出错误
            if (!currentPrice) throw new Error('Failed to fetch current price.');
            // 记录当前价格的调试日志
            log.debug(`${this.logPrefix} Current Price: ${currentPrice}`, { userId: this.userId, strategyId: this.strategyId });
        } catch (error) {
            // 记录获取价格时发生的错误
            log.error(`${this.logPrefix} Failed to fetch ticker`, error, { userId: this.userId, strategyId: this.strategyId });
            // 向上层服务发送错误事件通知
            this.emit('error', this.strategyId, error);
            // 如果获取价格失败，终止本次检查
            return; // Skip check if price fetch fails
        }

        // 1. 检查止损条件：如果有持仓且价格低于止损线
        if (this.state.positions.length > 0 && currentPrice <= this.state.stopLossPrice) {
            // 触发止损处理流程
            await this._triggerStopLoss(currentPrice);
            // 止损后直接结束本次检查
            return; // 止损触发，退出检查
        }

        // 2. 检查所有未成交订单的状态
        // 获取所有未成交订单ID列表
        const openOrderIds = Object.keys(this.state.openOrders);
        if (openOrderIds.length > 0) {
            // 记录准备检查订单状态的日志
            log.debug(`${this.logPrefix} Requesting status check for ${openOrderIds.length} open order(s).`, { userId: this.userId, strategyId: this.strategyId });
            // 发出事件请求检查订单状态，通知StrategyService处理
            this.emit('checkOrdersRequest', this.strategyId, openOrderIds, this.symbol);
        }

        // 3. 放置初始买单(如果需要)
        if (this.state.positions.length === 0 && openOrderIds.length === 0) {
            // 检查是否需要放置初始买单
            await this._placeInitialBuyOrderIfNeeded(currentPrice);
        }
        // 4. 检查并放置后续马丁格尔订单(如果需要)
        else if (this.state.positions.length > 0) {
            // 只有在存在止盈订单(表示上次买单已处理)
            // 或者完全没有未结订单时(可能是初始状态恢复)才放置下一个马丁格尔订单
            if (this.state.takeProfitOrderId || openOrderIds.length === 0) {
                // 检查并放置马丁格尔订单
                await this._checkAndPlaceMartinOrders(currentPrice);
            } else {
                // 记录调试日志，表明等待止盈订单放置完成
                log.debug(`${this.logPrefix} 在检查下一个马丁格尔层级前等待止盈订单放置`, { userId: this.userId, strategyId: this.strategyId });
            }
        }
        // 记录调试日志，表明检查循环结束
        log.debug(`${this.logPrefix} Check finished.`, { userId: this.userId, strategyId: this.strategyId });
    }

     /**
      * 处理StrategyService推送的订单状态更新(成交、取消等)
      * @param {object} order - CCXT订单对象
      */
     async handleOrderUpdate(order) {
         if (!order || !order.id) return;
         log.info(`${this.logPrefix} 收到订单${order.id}更新，状态: ${order.status}`, { userId: this.userId, strategyId: this.strategyId, orderStatus: order.status });

         const orderId = order.id;
         const levelOrTag = this.state.openOrders[orderId]; // Get level/tag from internal state

         if (levelOrTag === undefined) {
              log.warn(`${this.logPrefix} 收到未知或已处理订单${orderId}的更新，忽略`, { userId: this.userId, strategyId: this.strategyId });
             return; // Order not tracked or already processed
         }

         let stateChanged = false;

         if (order.status === 'closed') {
             log.info(`${this.logPrefix} 订单${orderId}(${levelOrTag})已关闭。方向: ${order.side}, 成交数量: ${order.filled}, 价格: ${order.price}`, { userId: this.userId, strategyId: this.strategyId });
             delete this.state.openOrders[orderId];
             stateChanged = true;

             if (order.side === 'buy') {
                 // Add to positions
                 this.state.positions.push({
                     price: parseFloat(order.price),
                     amount: parseFloat(order.filled),
                     level: levelOrTag // Store the level
                 });
                 // Recalculate position metrics
                 this._recalculatePosition(); // This emits stateUpdate
                 // Request placement of new Take Profit order
                 await this._requestPlaceTakeProfitOrder();
             } else if (order.side === 'sell' && levelOrTag === 'takeProfit') {
                 log.info(`${this.logPrefix} 止盈订单${orderId}已成交! 重置循环`, { userId: this.userId, strategyId: this.strategyId });
                 this.state.takeProfitOrderId = null;
                 this.state.positions = [];
                 this._recalculatePosition(); // Reset metrics, emits stateUpdate
                 // Request placement of initial buy order to restart
                 await this._placeInitialBuyOrderIfNeeded(order.price); // Use fill price as current price guess
             }
                 // 注意: 止损市价卖出由_triggerStopLoss处理

         } else if (order.status === 'canceled' || order.status === 'rejected') {
              log.warn(`${this.logPrefix} 订单${orderId}(${levelOrTag})状态变为${order.status}。从未结订单中移除`, { userId: this.userId, strategyId: this.strategyId });
             delete this.state.openOrders[orderId];
             if (orderId === this.state.takeProfitOrderId) {
                 this.state.takeProfitOrderId = null;
                 // 可能需要尝试替换止盈订单？还是等待下次检查循环？目前只是清除
                 log.warn(`${this.logPrefix} 止盈订单${orderId}状态变为${order.status}。可能需要手动干预或将在下次买入时替换`, { userId: this.userId, strategyId: this.strategyId });
             }
             stateChanged = true;
         }
            // 'open'未成交状态此处不需要处理

         if (stateChanged) {
             // Emit final state update for openOrders and takeProfitOrderId
             this.emit('stateUpdate', this.strategyId, {
                 openOrders: this.state.openOrders,
                 takeProfitOrderId: this.state.takeProfitOrderId
             });
         }
     }


    /**
     * 在满足条件时放置初始买单
     * @param {number} currentPrice - 当前市场价格
     * @private
     */
    async _placeInitialBuyOrderIfNeeded(currentPrice) {
        // Check if already exists
        const level0OrderExists = Object.values(this.state.openOrders).includes(0);
        if (level0OrderExists) {
             log.debug(`${this.logPrefix} Initial buy order (Level 0) already open.`, { userId: this.userId, strategyId: this.strategyId });
            return;
        }

        const initialLevelPrice = this.state.martinLevels[0];
        // Add a small buffer (e.g., 1%) to avoid placing if price spiked slightly
        if (currentPrice > initialLevelPrice * 1.01) {
            log.info(`${this.logPrefix} Current price ${currentPrice} too high for initial buy at ${initialLevelPrice}. Waiting.`, { userId: this.userId, strategyId: this.strategyId });
            return;
        }

        const amount = this.state.martinAmounts[0];
        this._requestPlaceLimitOrder('buy', amount, initialLevelPrice, 0); // Tag with level 0
    }

    /**
     * 检查是否应该放置下一个马丁格尔层级买单
     * @param {number} currentPrice - 当前市场价格
     * @private
     */
    async _checkAndPlaceMartinOrders(currentPrice) {
        let nextLevel = -1;
        // Find the highest level whose price is >= currentPrice
        for (let i = 0; i < this.state.martinLevels.length; i++) {
             if (currentPrice <= this.state.martinLevels[i]) {
                 nextLevel = i;
                 // break; // Don't break, find the *lowest* price level triggered
             } else {
                 break; // Price is above this level, no need to check lower levels (higher index)
             }
        }


        // Find the highest level we *already* have a position for
        let highestPositionLevel = -1;
        if (this.state.positions.length > 0) {
            highestPositionLevel = Math.max(...this.state.positions.map(p => p.level));
        }

        // Determine the actual next level to buy (must be higher than current highest position level)
        const targetLevel = highestPositionLevel + 1;


        // Check if price has dropped enough to trigger the *target* level buy
        if (targetLevel < this.params.levels && currentPrice <= this.state.martinLevels[targetLevel]) {
            // Check if an order for this target level is already open
            const orderOpenForTargetLevel = Object.entries(this.state.openOrders).some(([id, level]) => level === targetLevel);

            if (!orderOpenForTargetLevel) {
                const price = this.state.martinLevels[targetLevel];
                const amount = this.state.martinAmounts[targetLevel];
                log.info(`${this.logPrefix} Price ${currentPrice} triggered buy for next level ${targetLevel}.`, { userId: this.userId, strategyId: this.strategyId });
                this._requestPlaceLimitOrder('buy', amount, price, targetLevel); // Tag with level number
            } else {
                 log.debug(`${this.logPrefix} Order for level ${targetLevel} already open.`, { userId: this.userId, strategyId: this.strategyId });
            }
        } else {
             log.debug(`${this.logPrefix} Price ${currentPrice} has not triggered next level ${targetLevel} buy (Price Target: ${this.state.martinLevels[targetLevel]}).`, { userId: this.userId, strategyId: this.strategyId });
        }
    }

    /**
     * 请求取消现有的止盈订单(如果有)并放置新的止盈订单
     * @private
     */
    async _requestPlaceTakeProfitOrder() {
        // 1. Request cancellation of the old order (if exists)
        if (this.state.takeProfitOrderId) {
            log.info(`${this.logPrefix} Requesting cancellation of old TP order ${this.state.takeProfitOrderId}`, { userId: this.userId, strategyId: this.strategyId });
            this.emit('cancelOrderRequest', this.strategyId, this.state.takeProfitOrderId, this.symbol);
            // Clear locally, assuming cancellation request is processed
            this.state.takeProfitOrderId = null;
             this.emit('stateUpdate', this.strategyId, { takeProfitOrderId: null });
        }

        // 2. Request placement of the new order (if position exists)
        if (this.state.totalAmount > 0 && this.state.takeProfitPrice > 0) {
            log.info(`${this.logPrefix} Requesting new TP order: ${this.state.totalAmount} @ ${this.state.takeProfitPrice}`, { userId: this.userId, strategyId: this.strategyId });
            this._requestPlaceLimitOrder('sell', this.state.totalAmount, this.state.takeProfitPrice, 'takeProfit');
        } else {
            log.warn(`${this.logPrefix} Cannot place TP order - no position or invalid TP price. Amount: ${this.state.totalAmount}, TP Price: ${this.state.takeProfitPrice}`, { userId: this.userId, strategyId: this.strategyId });
        }
    }

    /**
     * 处理止损触发逻辑
     * @param {number} currentPrice - 触发止损的价格
     * @private
     */
    async _triggerStopLoss(currentPrice) {
        log.warn(`${this.logPrefix} STOP LOSS TRIGGERED! Price ${currentPrice} <= SL Price ${this.state.stopLossPrice}`, { userId: this.userId, strategyId: this.strategyId });

        // Immediately stop further checks by the loop
        this.isRunning = false;
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
            this.checkIntervalId = null;
        }

        // 1. Request cancellation of ALL open orders
        const openOrderIds = Object.keys(this.state.openOrders);
        log.warn(`${this.logPrefix} Requesting cancellation of ${openOrderIds.length} orders due to stop loss.`, { userId: this.userId, strategyId: this.strategyId });
        for (const orderId of openOrderIds) {
             this.emit('cancelOrderRequest', this.strategyId, orderId, this.symbol);
             // Remove from local state immediately
             delete this.state.openOrders[orderId];
        }
        this.state.openOrders = {};
        this.state.takeProfitOrderId = null;


        // 2. Request market sell of the entire position
        if (this.state.totalAmount > 0) {
            log.warn(`${this.logPrefix} Requesting market sell for ${this.state.totalAmount} ${this.market.base} due to stop loss.`, { userId: this.userId, strategyId: this.strategyId });
            this.emit('placeOrderRequest', this.strategyId, {
                symbol: this.symbol,
                type: 'market',
                side: 'sell',
                amount: this.state.totalAmount,
                tag: 'stop_loss_sell'
            });
            // Assume sell will execute; clear position locally. Service should confirm.
            this.state.positions = [];
            this._recalculatePosition(); // Reset metrics
        }

        // 3. Emit final state update
        this.emit('stateUpdate', this.strategyId, {
            isRunning: false,
            openOrders: {},
            takeProfitOrderId: null,
            positions: [],
            totalInvested: 0,
            totalAmount: 0,
            averageCost: 0,
            lastError: `Stop Loss Triggered at price ${currentPrice}` // Record the reason
        });

        log.warn(`${this.logPrefix} Stop Loss processing finished. Engine stopped.`, { userId: this.userId, strategyId: this.strategyId });
        // The StrategyService should handle the stopped state and not restart automatically immediately.
    }

}

module.exports = MartingaleEngine;
