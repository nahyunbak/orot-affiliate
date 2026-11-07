import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function encryptionKey() {
  const key = process.env.WALLET_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-f]{64}$/i.test(key))
    throw new Error('테스트 지갑 암호화 키가 설정되지 않았습니다.');
  return Buffer.from(key, 'hex');
}
export function seal(privateKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((value) => value.toString('base64'))
    .join('.');
}
export function unseal(encryptedKey: string): string {
  const [iv, tag, encrypted] = encryptedKey
    .split('.')
    .map((value) => Buffer.from(value, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}
