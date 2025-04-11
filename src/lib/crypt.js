const crypto = require('crypto');

function encrypt(text, password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(12);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    content: encrypted.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
}

function decrypt(encrypted, password) {
  const salt = Buffer.from(encrypted.salt, 'base64');
  const iv = Buffer.from(encrypted.iv, 'base64');
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.content, 'base64')),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}

// // 使用示例
// const password = '强密码应该包含大小写、数字和特殊字符!@#';
// const data = '这是用密码保护的数据';

// const encrypted = encrypt(data, password);
// console.log('加密结果:', encrypted);

// const decrypted = decrypt(encrypted, password);
// console.log('解密结果:', decrypted);

module.exports = {
  encrypt,
  decrypt
};