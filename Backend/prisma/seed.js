const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

const prisma = new PrismaClient();

// AES-256 helper for seeding
function encryptAES(plainText) {
  const secret = process.env.AES_SECRET_KEY || '9f8e7d6c5b4a3928170e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a';
  const key = Buffer.from(secret, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  const hash = crypto.createHash('sha256').update(plainText).digest('hex');
  return { encrypted, iv: iv.toString('hex'), authTag, hash };
}

async function main() {
  console.log('🌱 Seeding SmartHaul initial database...');

  // 1. Check / Create Bootstrap Platform Administrator
  const adminEmail = 'admin@smarthaul.pk';
  const existingAdmin = await prisma.user.findFirst({
    where: { email: adminEmail, role: 'ADMIN' }
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('SmartHaul@Admin2026!', 10);
    const cnicEnc = encryptAES('37405-1234567-1');

    const admin = await prisma.user.create({
      data: {
        role: 'ADMIN',
        name: 'System Administrator',
        email: adminEmail,
        phone: '+923001234567',
        passwordHash,
        accountStatus: 'ACTIVE',
        cnicEncrypted: cnicEnc.encrypted,
        cnicIv: cnicEnc.iv,
        cnicTag: cnicEnc.authTag,
        cnicHash: cnicEnc.hash,
        preferredLanguage: 'EN',
      }
    });

    console.log(`✅ Provisioned Administrator: ${admin.email}`);
  } else {
    console.log(`ℹ️ Administrator already exists: ${existingAdmin.email}`);
  }

  console.log('✅ SmartHaul database seed completed.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
