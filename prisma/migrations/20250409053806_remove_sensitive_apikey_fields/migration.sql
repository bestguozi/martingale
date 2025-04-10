/*
  Warnings:

  - You are about to drop the column `apiPassword` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `apiSecret` on the `api_keys` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX `api_keys_userId_fkey` ON `api_keys`;

-- DropIndex
DROP INDEX `operation_logs_strategyId_fkey` ON `operation_logs`;

-- DropIndex
DROP INDEX `operation_logs_userId_fkey` ON `operation_logs`;

-- DropIndex
DROP INDEX `strategies_apiKeyId_fkey` ON `strategies`;

-- DropIndex
DROP INDEX `strategies_userId_fkey` ON `strategies`;

-- AlterTable
ALTER TABLE `api_keys` DROP COLUMN `apiPassword`,
    DROP COLUMN `apiSecret`;

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
