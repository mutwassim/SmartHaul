// One-off: recompute stored CNIC and vehicle-registration lookup hashes with the keyed hash (DEF-18).
// Safe to run more than once. Usage: npm run prisma:rehash
const { PrismaClient } = require('@prisma/client');
const { decrypt, hashDeterministic } = require('../src/services/encryption.service');

const prisma = new PrismaClient();

async function main() {
  let users = 0;
  let vehicles = 0;

  const accounts = await prisma.user.findMany({
    where: { cnicEncrypted: { not: null } },
    select: { id: true, cnicEncrypted: true, cnicIv: true, cnicTag: true, cnicHash: true },
  });
  for (const user of accounts) {
    const hash = hashDeterministic(decrypt(user.cnicEncrypted, user.cnicIv, user.cnicTag));
    if (hash && hash !== user.cnicHash) {
      await prisma.user.update({ where: { id: user.id }, data: { cnicHash: hash } });
      users++;
    }
  }

  const fleet = await prisma.vehicle.findMany({
    select: {
      id: true,
      registrationNumberEncrypted: true,
      registrationNumberIv: true,
      registrationNumberTag: true,
      registrationNumberHash: true,
    },
  });
  for (const vehicle of fleet) {
    let plain;
    try {
      plain = decrypt(vehicle.registrationNumberEncrypted, vehicle.registrationNumberIv, vehicle.registrationNumberTag);
    } catch (error) {
      console.warn(`Skipped vehicle ${vehicle.id}: registration number could not be decrypted`);
      continue;
    }
    const hash = hashDeterministic(plain);
    if (hash && hash !== vehicle.registrationNumberHash) {
      await prisma.vehicle.update({ where: { id: vehicle.id }, data: { registrationNumberHash: hash } });
      vehicles++;
    }
  }

  console.log(`Re-hashed ${users} CNIC value(s) and ${vehicles} vehicle registration(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
