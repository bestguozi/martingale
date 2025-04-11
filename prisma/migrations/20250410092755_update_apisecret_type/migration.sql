-- DropIndex
DROP INDEX `operation_logs_strategyId_fkey` ON `operation_logs`;

-- DropIndex
DROP INDEX `operation_logs_userId_fkey` ON `operation_logs`;

-- DropIndex
DROP INDEX `strategies_userId_fkey` ON `strategies`;

-- AlterTable
ALTER TABLE `users` MODIFY `apiPassword` TEXT NULL,
    MODIFY `apiSecret` TEXT NULL;

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
