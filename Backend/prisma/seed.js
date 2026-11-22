const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();
const { hashDeterministic } = require('../src/services/encryption.service');

const prisma = new PrismaClient();

// AES-256 helper for seeding (SEC-7, CON-12)
function encryptAES(plainText) {
  const secret = process.env.AES_SECRET_KEY || '9f8e7d6c5b4a3928170e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a';
  const key = Buffer.from(secret, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  const hash = hashDeterministic(plainText);
  return { encrypted, iv: iv.toString('hex'), authTag, hash };
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error('Refusing to seed a production database (known demo passwords). Set ALLOW_PRODUCTION_SEED=true to override.');
  }
  console.log('🌱 Seeding SmartHaul initial database...');

  // 1. Platform Administrator
  const adminEmail = 'admin@smarthaul.pk';
  let admin = await prisma.user.findFirst({
    where: { email: adminEmail, role: 'ADMIN' },
  });

  if (!admin) {
    const passwordHash = await bcrypt.hash('SmartHaul@Admin2026!', 10);
    const cnicEnc = encryptAES('37405-1234567-1');

    admin = await prisma.user.create({
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
      },
    });
    console.log(`✅ Provisioned Administrator: ${admin.email}`);
  } else {
    console.log(`ℹ️ Administrator already exists: ${admin.email}`);
  }

  // 2. Fleet Owner
  const fleetEmail = 'fleet@haul.pk';
  let fleetOwner = await prisma.user.findFirst({
    where: { email: fleetEmail, role: 'FLEET_OWNER' },
  });

  if (!fleetOwner) {
    const passwordHash = await bcrypt.hash('FleetPass@2026!', 10);
    const cnicEnc = encryptAES('37405-9876543-2');

    fleetOwner = await prisma.user.create({
      data: {
        role: 'FLEET_OWNER',
        name: 'Tariq Mahmood',
        email: fleetEmail,
        phone: '+923009876543',
        passwordHash,
        accountStatus: 'ACTIVE',
        cnicEncrypted: cnicEnc.encrypted,
        cnicIv: cnicEnc.iv,
        cnicTag: cnicEnc.authTag,
        cnicHash: cnicEnc.hash,
        businessName: 'Apex Freight Logistics Pvt Ltd',
        businessAddress: 'Plot 45, Sector I-9 Industrial Area, Islamabad',
        preferredLanguage: 'EN',
        avgRating: 4.85,
        totalRatings: 34,
        completedTripsCount: 42,
      },
    });
    console.log(`✅ Provisioned Fleet Owner: ${fleetOwner.email}`);
  } else {
    console.log(`ℹ️ Fleet Owner already exists: ${fleetOwner.email}`);
  }

  // 3. Demo Driver
  const driverEmail = 'driver@haul.pk';
  let driver = await prisma.user.findFirst({
    where: { email: driverEmail, role: 'DRIVER' },
  });

  if (!driver) {
    const passwordHash = await bcrypt.hash('DriverPass@2026!', 10);
    const cnicEnc = encryptAES('37405-5551234-3');

    driver = await prisma.user.create({
      data: {
        role: 'DRIVER',
        name: 'Muhammad Aslam',
        email: driverEmail,
        phone: '+923015551234',
        passwordHash,
        accountStatus: 'ACTIVE',
        cnicEncrypted: cnicEnc.encrypted,
        cnicIv: cnicEnc.iv,
        cnicTag: cnicEnc.authTag,
        cnicHash: cnicEnc.hash,
        preferredLanguage: 'UR',
        avgRating: 4.9,
        totalRatings: 28,
        completedTripsCount: 31,
      },
    });

    // Link driver to fleet owner
    await prisma.driverFleetLink.upsert({
      where: { driverId: driver.id },
      update: { fleetOwnerId: fleetOwner.id },
      create: {
        fleetOwnerId: fleetOwner.id,
        driverId: driver.id,
      },
    });
    console.log(`✅ Provisioned Driver: ${driver.email} linked to Fleet Owner`);
  } else {
    console.log(`ℹ️ Driver already exists: ${driver.email}`);
  }

  // 4. Demo Cargo Owner
  const shipperEmail = 'shipper@haul.pk';
  let shipper = await prisma.user.findFirst({
    where: { email: shipperEmail, role: 'CARGO_OWNER' },
  });

  if (!shipper) {
    const passwordHash = await bcrypt.hash('ShipperPass@2026!', 10);
    const cnicEnc = encryptAES('37405-8889900-4');

    shipper = await prisma.user.create({
      data: {
        role: 'CARGO_OWNER',
        name: 'Bilal Siddiqui',
        email: shipperEmail,
        phone: '+923028889900',
        passwordHash,
        accountStatus: 'ACTIVE',
        cnicEncrypted: cnicEnc.encrypted,
        cnicIv: cnicEnc.iv,
        cnicTag: cnicEnc.authTag,
        cnicHash: cnicEnc.hash,
        businessName: 'National Goods & Trading Co.',
        businessAddress: 'Main Gulberg III, Lahore',
        preferredLanguage: 'EN',
        avgRating: 4.75,
        totalRatings: 19,
        completedTripsCount: 22,
      },
    });
    console.log(`✅ Provisioned Cargo Owner: ${shipper.email}`);
  } else {
    console.log(`ℹ️ Cargo Owner already exists: ${shipper.email}`);
  }

  // 5. Fleet Vehicles
  const reg1Enc = encryptAES('LEA-2022-4921');
  const existingV1 = await prisma.vehicle.findUnique({
    where: { registrationNumberHash: reg1Enc.hash },
  });

  let vehicle1;
  if (!existingV1) {
    vehicle1 = await prisma.vehicle.create({
      data: {
        ownerId: fleetOwner.id,
        registrationNumberEncrypted: reg1Enc.encrypted,
        registrationNumberIv: reg1Enc.iv,
        registrationNumberTag: reg1Enc.authTag,
        registrationNumberHash: reg1Enc.hash,
        vehicleType: 'MAZDA_MGV',
        ratedCapacity: 3.5,
        model: 'Mazda Titan 3.5T Heavy Duty',
        year: 2022,
        availabilityStatus: 'AVAILABLE',
        defaultDriverId: driver.id,
      },
    });
    console.log('✅ Created Vehicle 1: Mazda Titan 3.5T');
  } else {
    vehicle1 = existingV1;
  }

  const reg2Enc = encryptAES('KHI-2023-8812');
  const existingV2 = await prisma.vehicle.findUnique({
    where: { registrationNumberHash: reg2Enc.hash },
  });

  if (!existingV2) {
    await prisma.vehicle.create({
      data: {
        ownerId: fleetOwner.id,
        registrationNumberEncrypted: reg2Enc.encrypted,
        registrationNumberIv: reg2Enc.iv,
        registrationNumberTag: reg2Enc.authTag,
        registrationNumberHash: reg2Enc.hash,
        vehicleType: 'CONTAINER_MOUNTED',
        ratedCapacity: 15.0,
        model: 'Hino 500 24-Foot Container',
        year: 2023,
        availabilityStatus: 'AVAILABLE',
      },
    });
    console.log('✅ Created Vehicle 2: Hino 500 Container');
  }

  const reg3Enc = encryptAES('RWP-2021-3319');
  const existingV3 = await prisma.vehicle.findUnique({
    where: { registrationNumberHash: reg3Enc.hash },
  });

  if (!existingV3) {
    await prisma.vehicle.create({
      data: {
        ownerId: fleetOwner.id,
        registrationNumberEncrypted: reg3Enc.encrypted,
        registrationNumberIv: reg3Enc.iv,
        registrationNumberTag: reg3Enc.authTag,
        registrationNumberHash: reg3Enc.hash,
        vehicleType: 'TRAILER_FLATBED',
        ratedCapacity: 25.0,
        model: 'ISUZU Giga 40-Foot Flatbed',
        year: 2021,
        availabilityStatus: 'AVAILABLE',
      },
    });
    console.log('✅ Created Vehicle 3: ISUZU Giga Flatbed');
  }

  // 6. Sample Verification Documents for Admin Review Queue
  const existingDoc = await prisma.verificationDocument.findFirst({
    where: { userId: fleetOwner.id },
  });

  if (!existingDoc) {
    await prisma.verificationDocument.createMany({
      data: [
        {
          userId: fleetOwner.id,
          documentType: 'BUSINESS_REGISTRATION',
          storageKey: 'documents/demo_business_reg.pdf',
          originalFilename: 'apex_freight_secp_cert.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: 412000,
          verificationStatus: 'APPROVED',
          verifiedByAdminId: admin.id,
          verifiedAt: new Date(),
        },
        {
          userId: driver.id,
          documentType: 'DRIVING_LICENCE',
          storageKey: 'documents/demo_driver_license.jpg',
          originalFilename: 'aslam_htv_license.jpg',
          mimeType: 'image/jpeg',
          fileSizeBytes: 285000,
          verificationStatus: 'APPROVED',
          verifiedByAdminId: admin.id,
          verifiedAt: new Date(),
        },
      ],
    });
    console.log('✅ Created sample verification documents');
  }

  // 7. Sample Shipment for Bidding / Live Operations
  const shipmentNumber = 'SH-2026-10001';
  let shipment = await prisma.shipment.findUnique({
    where: { shipmentNumber },
  });

  if (!shipment) {
    shipment = await prisma.shipment.create({
      data: {
        shipmentNumber,
        cargoOwnerId: shipper.id,
        pickupAddress: 'I-9 Industrial Area, Islamabad',
        pickupLat: 33.6625,
        pickupLng: 73.0485,
        pickupContactName: 'Kamran Shah',
        pickupContactPhone: '+923331112233',
        dropoffAddress: 'Sundar Industrial Estate, Lahore',
        dropoffLat: 31.2858,
        dropoffLng: 74.1685,
        dropoffContactName: 'Tariq Javed',
        dropoffContactPhone: '+923334445566',
        cargoType: 'PACKAGED_GOODS',
        cargoWeight: 3.2,
        requiredVehicleType: 'MAZDA_MGV',
        expectedDeliveryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        distanceKm: 375.4,
        durationMinutes: 310,
        status: 'PENDING',
      },
    });

    // Add active bid by fleet owner
    await prisma.bid.create({
      data: {
        shipmentId: shipment.id,
        bidderId: fleetOwner.id,
        offeredVehicleType: 'MAZDA_MGV',
        proposedFare: 65000,
        estimatedDeliveryTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
      },
    });

    console.log(`✅ Provisioned Sample Shipment (${shipmentNumber}) with active Fleet Bid`);
  }

  console.log('🎉 SmartHaul database seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
