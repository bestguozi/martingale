const prisma = require('../lib/prisma');
const log = require('./logService');
const crypt = require('../lib/crypt');


/**
 * 更新用户API Key信息
 * @param {number} userId - 用户ID
 * @param {string} exchangeId - 交易所ID
 * @param {string} apiKey - API公钥
 * @param {string} apiSecret - API私钥
 * @param {string} [apiPassword] - API密码(可选)
 * @param {string} [description] - 描述(可选)
 * @returns {Promise<object>} 更新后的用户对象
 */
async function updateUserApiKey(userId, exchangeId, apiKey, apiSecret, apiPassword = null, description = null) {
    try {
        const encryptionKey = process.env.API_KEY_ENCRYPTION_KEY;
        if (!encryptionKey) {
            throw new Error('API_KEY_ENCRYPTION_KEY环境变量未设置');
        }

        log.info(`更新用户 ${userId} 的API Key信息`);
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                exchangeId,
                apiKey: crypt.encrypt(apiKey, encryptionKey),
                apiSecret: crypt.encrypt(apiSecret, encryptionKey),
                apiPassword: crypt.encrypt(apiPassword, encryptionKey),
                description,
                isApiActive: true
            }
        });
        log.info(`成功更新用户 ${userId} 的API Key信息`);
        return updatedUser;
    } catch (error) {
        log.error('更新用户API Key失败', error, { userId });
        throw error;
    }
}

/**
 * 获取用户API Key信息
 * @param {number} userId - 用户ID
 * @returns {Promise<object|null>} 用户对象(包含解密后的API Key信息)或null
 */
async function getUserApiKey(userId) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user || !user.apiKey) {
            log.info(`用户 ${userId} 未设置API Key`);
            return null;
        }

        const encryptionKey = process.env.API_KEY_ENCRYPTION_KEY;
        if (!encryptionKey) {
            throw new Error('API_KEY_ENCRYPTION_KEY环境变量未设置');
        }
        const apiKey = user.apiKey ? crypt.decrypt(user.apiKey) : null;
        const apiSecret = user.apiSecret ? crypt.decrypt(user.apiSecret) : null;
        const apiPassword = user.apiPassword ? crypt.decrypt(user.apiPassword) : null;
        
        if (user.apiSecret && !apiSecret) {
            log.error(`用户 ${userId} 的API Secret解密失败`);
            return null;
        }

        return {
            ...user,
            apiKey,
            apiSecret,
            apiPassword
        };
    } catch (error) {
        log.error(`获取用户 ${userId} API Key信息失败`, error);
        return null; // 返回null而不是抛出错误，让调用方能够更优雅地处理
    }
}

/**
 * 禁用用户API Key
 * @param {number} userId - 用户ID
 * @returns {Promise<object>} 更新后的用户对象
 */
async function disableUserApiKey(userId) {
    try {
        log.info(`禁用用户 ${userId} 的API Key`);
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { isApiActive: false }
        });
        log.info(`成功禁用用户 ${userId} 的API Key`);
        return updatedUser;
    } catch (error) {
        log.error(`禁用用户 ${userId} API Key失败`, error);
        throw error;
    }
}

// 用户管理函数保持不变
async function createUser(username) {
    try {
        log.info(`创建用户 ${username}`);
        const newUser = await prisma.user.create({
            data: { username }
        });
        log.info(`成功创建用户 ${newUser.id} (${username})`);
        return newUser;
    } catch (error) {
        log.error(`创建用户 ${username} 失败`, error);
        if (error.code === 'P2002' && error.meta?.target?.includes('username')) {
             throw new Error(`用户名 "${username}" 已存在`);
        }
        throw error;
    }
}

async function findUserByUsername(username) {
    try {
        return await prisma.user.findUnique({
            where: { username }
        });
    } catch (error) {
        log.error(`查找用户 ${username} 失败`, error);
        throw error;
    }
}

module.exports = {
    updateUserApiKey,
    getUserApiKey,
    disableUserApiKey,
    createUser,
    findUserByUsername
};
