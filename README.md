# 多用户马丁格尔交易系统 (Multi-User Martingale Trading System)

## 项目简介

本项目实现了一个基于 Node.js、CCXT 库和 MySQL 数据库的**多用户**自动化加密货币**马丁格尔策略**交易系统。该系统允许多个用户使用各自的 API 密钥和参数独立运行马丁格尔策略，同时提供集中的日志记录和状态管理。

## 主要特性

*   **多用户架构:** 支持多个用户，每个用户拥有隔离的策略和 API 密钥。
*   **数据库驱动:** 使用 MySQL 和 Prisma ORM 进行持久化存储（用户、API 密钥元数据、策略配置、策略状态、操作日志）。
*   **交易所集成:** 通过 CCXT 连接多个加密货币交易所。
*   **马丁格尔策略引擎:** 核心策略逻辑实现，包括价格水平计算、订单管理、止盈止损。
*   **服务化架构:** 模块化的服务 (`userService`, `logService`, `strategyService`) 实现清晰的关注点分离。
*   **状态持久化:** 策略状态存储在数据库中，支持程序重启后恢复。
*   **安全:** API 密钥安全管理（公钥元数据在数据库，私钥在安全的配置文件中）。
*   **日志记录:** 结构化的日志记录到控制台和数据库，提供完整的操作审计追踪。

## 技术栈

*   **运行环境:** Node.js
*   **语言:** JavaScript (ES Modules)
*   **包管理器:** pnpm
*   **数据库:** MySQL
*   **ORM:** Prisma
*   **交易所库:** CCXT
*   **日志库:** Winston
*   **环境变量:** dotenv

## 系统架构

系统采用模块化的服务导向架构：
*   **核心服务:** `userService`, `logService`, `strategyService` 处理核心业务逻辑。
*   **策略引擎:** `MartingaleEngine` 类封装了可重用的马丁格尔策略实现。
*   **数据库层:** 使用 Prisma ORM 与 MySQL 数据库交互。
*   **事件驱动:** 策略引擎通过事件与服务进行松耦合通信。

## 安装与设置

1.  **环境准备:**
    *   安装 [Node.js](https://nodejs.org/) (建议使用 LTS 版本)
    *   安装 [pnpm](https://pnpm.io/installation) (`npm install -g pnpm`)
    *   安装并运行 [MySQL](https://dev.mysql.com/downloads/mysql/) 数据库服务。
2.  **克隆仓库:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```
3.  **安装依赖:**
    ```bash
    pnpm install
    ```
4.  **配置环境变量:**
    *   复制 `.env.example` 文件为 `.env`。
    *   在 `.env` 文件中配置你的 MySQL 数据库连接字符串 (`DATABASE_URL`)。
    ```dotenv
    # .env
    DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DATABASE_NAME"
    # 其他可选配置...
    ```
5.  **数据库迁移:**
    *   运行 Prisma 命令以创建数据库表结构：
    ```bash
    npx prisma migrate dev --name init
    ```
6.  **配置 API 密钥:**
    *   创建 `config/secrets.json` 文件 (此文件应被 `.gitignore` 忽略)。
    *   按照以下格式添加你的交易所 API 密钥。`apiKeyId` 必须与数据库中 `ApiKeys` 表的记录相对应。
    ```json
    // config/secrets.json
    {
      "apiKeyId1": { // 这个 ID 对应数据库中的 apiKeyId
        "apiKey": "YOUR_EXCHANGE_API_KEY",
        "secret": "YOUR_EXCHANGE_SECRET",
        "password": "YOUR_API_PASSWORD_IF_ANY" // 可选
      },
      "apiKeyId2": {
        "apiKey": "ANOTHER_API_KEY",
        "secret": "ANOTHER_SECRET"
      }
      // ...更多用户的密钥
    }
    ```
    *   **重要:** 你需要先通过其他方式（例如直接操作数据库或未来的管理界面）在 `Users` 和 `ApiKeys` 表中创建用户和对应的 API Key 元数据记录，然后才能在 `secrets.json` 中使用相应的 `apiKeyId`。

## 运行程序

配置完成后，使用以下命令启动应用程序：

```bash
node app.js
```

程序将自动加载数据库中标记为活跃的策略并开始运行。

## 配置说明

*   **`.env`:** 用于存储非敏感的核心配置，如数据库连接信息。
*   **`config/secrets.json`:** **(必须保密且不提交到 Git)** 用于存储敏感的交易所 API 密钥。通过数据库中的 `apiKeyId` 关联。
*   **数据库:** 用户的策略参数（如交易对、马丁格尔参数等）存储在数据库的 `Strategies` 和 `StrategyParameters` 表中。

## 安全

*   敏感的 API 私钥和密码存储在本地的 `config/secrets.json` 文件中，该文件不应被版本控制。
*   数据库仅存储 API Key 的元数据（如公钥、用户关联信息），不存储完整的敏感凭证。
*   所有关键操作都会被记录到数据库的 `OperationLogs` 表中，以供审计。

## 项目状态 (截至 2025-04-09)

*   核心的多用户马丁格尔策略功能已完成。
*   数据库持久化、服务化架构、安全凭证管理已实现。
*   当前主要工作集中在功能测试、多用户隔离验证和文档完善。
*   未来计划包括实现 REST API 管理接口和 Web UI。

## **风险提示**

**马丁格尔策略是一种高风险的交易策略。** 在市场持续下跌的情况下，它可能导致巨大的资金损失。用户在使用本系统前必须充分理解马丁格尔策略的原理及其潜在风险，并自行承担所有交易后果。**本项目仅供学习和研究目的，不构成任何投资建议。**
