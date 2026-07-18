import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function getEncryptionKey() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || '';
  if (!secret.trim()) {
    throw Object.assign(new Error('Meta token encryption key is not configured'), {
      code: 'META_ENCRYPTION_NOT_CONFIGURED'
    });
  }

  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(value) {
  if (!value) return '';
  const iv = randomBytes(12);
  const key = getEncryptionKey();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptSecret(payload) {
  if (!payload) return '';
  const [ivPart, tagPart, encryptedPart] = String(payload).split('.');
  if (!ivPart || !tagPart || !encryptedPart) {
    throw Object.assign(new Error('Encrypted payload format is invalid'), {
      code: 'META_ENCRYPTION_INVALID_PAYLOAD'
    });
  }

  const key = getEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64')),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

export function maskSecret(value) {
  if (!value) return '';
  const text = String(value);
  if (text.length <= 8) return `${text.slice(0, 2)}***${text.slice(-2)}`;
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}
