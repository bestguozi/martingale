/*
  Warnings:

  - You are about to drop the column `apiKeyId` on the `strategies` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `api_keys` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX `operation_logs_strategyId_fkey` ON `operation_logs`;

-- DropIndex
DROP INDEX `operation_logs_userId_fkey` ON `operation_logs`;

-- DropIndex
DROP INDEX `strategies_apiKeyId_fkey` ON `strategies`;

-- DropIndex
DROP INDEX `strategies_userId_fkey` ON `strategies`;

-- AlterTable
ALTER TABLE `strategies` DROP COLUMN `apiKeyId`;

-- AlterTable
ALTER TABLE `users` DROP COLUMN `createdAt`,
    ADD COLUMN `apiKey` VARCHAR(191) NULL,
    ADD COLUMN `apiPassword` VARCHAR(191) NULL,
    ADD COLUMN `apiSecret` VARCHAR(191) NULL,
    ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `description` VARCHAR(191) NULL,
    ADD COLUMN `exchange_id` VARCHAR(191) NULL,
    ADD COLUMN `is_api_active` BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE `api_keys`;

-- AddForeignKey
ALTER TABLE `strategies` ADD CONSTRAINT `strategies_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `strategy_parameters` ADD CONSTRAINT `strategy_parameters_strategy_id_fkey` FOREIGN KEY (`strategy_id`) REFERENCES `strategies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `strategy_states` ADD CONSTRAINT `strategy_states_strategy_id_fkey` FOREIGN KEY (`strategy_id`) REFERENCES `strategies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_strategyId_fkey` FOREIGN KEY (`strategyId`) REFERENCES `strategies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
