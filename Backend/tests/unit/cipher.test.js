const { encrypt, decrypt, hashDeterministic } = require('../../src/services/encryption.service');

describe('AES-256 Encryption & Deterministic Hashing Service (SEC-7, CON-12, BR-2, BR-30)', () => {
  const sampleCnic = '37405-9876543-1';
  const sampleReg = 'LEA-2024-9988';

  test('should encrypt and decrypt CNIC numbers reversibly and accurately', () => {
    const encrypted = encrypt(sampleCnic);
    expect(encrypted).toHaveProperty('encryptedData');
    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('authTag');

    const decrypted = decrypt(encrypted.encryptedData, encrypted.iv, encrypted.authTag);
    expect(decrypted).toBe(sampleCnic);
  });

  test('should encrypt and decrypt Vehicle Registration numbers accurately', () => {
    const encrypted = encrypt(sampleReg);
    const decrypted = decrypt(encrypted.encryptedData, encrypted.iv, encrypted.authTag);
    expect(decrypted).toBe(sampleReg);
  });

  test('should generate deterministic hashes for normalized matching and uniqueness lookups', () => {
    const hash1 = hashDeterministic('37405-9876543-1');
    const hash2 = hashDeterministic(' 3740598765431 '); // Different format / spacing
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex string
  });

  test('hashes are keyed: they differ from an unkeyed SHA-256 so a CNIC cannot be brute-forced offline (SEC-7)', () => {
    const crypto = require('crypto');
    const unkeyed = crypto.createHash('sha256').update('3740598765431').digest('hex');
    expect(hashDeterministic('37405-9876543-1')).not.toBe(unkeyed);
  });
});
