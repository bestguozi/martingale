-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_keys` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `exchange_id` VARCHAR(191) NOT NULL,
    `apiKey` VARCHAR(191) NOT NULL,
    `apiSecret` VARCHAR(191) NOT NULL,
    `apiPassword` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `strategies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `apiKeyId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NOT NULL,
    `strategy_type` VARCHAR(191) NOT NULL DEFAULT 'martingale',
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `strategy_parameters` (
    `strategy_id` INTEGER NOT NULL,
    `initial_price` DECIMAL(20, 8) NULL,
    `price_drop_percent` DECIMAL(10, 4) NOT NULL,
    `levels` INTEGER NOT NULL,
    `initial_amount` DECIMAL(20, 8) NOT NULL,
    `amount_multiplier` DECIMAL(10, 4) NOT NULL,
    `take_profit` DECIMAL(10, 4) NOT NULL,
    `stop_loss` DECIMAL(10, 4) NOT NULL,
    `check_interval` INTEGER NOT NULL DEFAULT 60000,

    PRIMARY KEY (`strategy_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `strategy_states` (
    `strategy_id` INTEGER NOT NULL,
    `is_running` BOOLEAN NOT NULL DEFAULT false,
    `open_orders` JSON NULL,
    `positions` JSON NULL,
    `martin_levels` JSON NULL,
    `martin_amounts` JSON NULL,
    `total_invested` DECIMAL(20, 8) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(20, 8) NOT NULL DEFAULT 0,
    `average_cost` DECIMAL(20, 8) NOT NULL DEFAULT 0,
    `take_profit_price` DECIMAL(20, 8) NULL,
    `stop_loss_price` DECIMAL(20, 8) NULL,
    `take_profit_order_id` VARCHAR(191) NULL,
    `last_error` TEXT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`strategy_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operation_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` INTEGER NULL,
    `strategyId` INTEGER NULL,
    `level` VARCHAR(20) NOT NULL,
    `message` TEXT NOT NULL,
    `context` JSON NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `strategies` ADD CONSTRAINT `strategies_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `strategies` ADD CONSTRAINT `strategies_apiKeyId_fkey` FOREIGN KEY (`apiKeyId`) REFERENCES `api_keys`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `strategy_parameters` ADD CONSTRAINT `strategy_parameters_strategy_id_fkey` FOREIGN KEY (`strategy_id`) REFERENCES `strategies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `strategy_states` ADD CONSTRAINT `strategy_states_strategy_id_fkey` FOREIGN KEY (`strategy_id`) REFERENCES `strategies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_strategyId_fkey` FOREIGN KEY (`strategyId`) REFERENCES `strategies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
