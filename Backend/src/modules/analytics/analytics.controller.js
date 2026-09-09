const prisma = require('../../config/db');
const { successResponse, errorResponse } = require('../../utils/response');
const { ROLES, SHIPMENT_STATUS, ACCOUNT_STATUS } = require('../../config/constants');

/**
 * Platform headline statistics
 * Requirement: FR-AR-2, FR-AD-17, BR-34
 */
async function getPlatformSummary(req, res, next) {
  try {
    const [
      totalCargoOwners,
      totalDrivers,
      totalFleetOwners,
      totalVehicles,
      pendingVerifications,
      activeTrips,
      completedShipments,
      openComplaints,
    ] = await Promise.all([
      prisma.user.count({ where: { role: ROLES.CARGO_OWNER } }),
      prisma.user.count({ where: { role: ROLES.DRIVER } }),
      prisma.user.count({ where: { role: ROLES.FLEET_OWNER } }),
      prisma.vehicle.count(),
      prisma.user.count({ where: { accountStatus: ACCOUNT_STATUS.PENDING } }),
      prisma.trip.count({ where: { isTrackingActive: true } }),
      prisma.shipment.count({ where: { status: SHIPMENT_STATUS.COMPLETED } }),
      prisma.complaint.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
    ]);

    return successResponse(
      res,
      {
        users: {
          cargoOwners: totalCargoOwners,
          drivers: totalDrivers,
          fleetOwners: totalFleetOwners,
          pendingVerifications,
        },
        vehicles: {
          total: totalVehicles,
        },
        shipments: {
          activeTrips,
          completedDeliveries: completedShipments,
        },
        complaints: {
          open: openComplaints,
        },
      },
      'Platform summary statistics retrieved (FR-AR-2)'
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Verification throughput report
 * Requirement: FR-AR-3
 */
async function getVerificationThroughput(req, res, next) {
  try {
    const [pending, approved, rejected] = await Promise.all([
      prisma.verificationDocument.count({ where: { verificationStatus: 'PENDING' } }),
      prisma.verificationDocument.count({ where: { verificationStatus: 'APPROVED' } }),
      prisma.verificationDocument.count({ where: { verificationStatus: 'REJECTED' } }),
    ]);

    return successResponse(
      res,
      {
        pending,
        approved,
        rejected,
        total: pending + approved + rejected,
      },
      'Verification throughput report retrieved (FR-AR-3)'
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Route demand analysis (Corridors)
 * Requirement: FR-AR-6
 */
async function getRouteDemand(req, res, next) {
  try {
    const shipments = await prisma.shipment.findMany({
      select: {
        pickupAddress: true,
        dropoffAddress: true,
      },
      take: 500,
    });

    const routeCounts = {};
    shipments.forEach((s) => {
      // Simplified city extraction
      const pickupCity = s.pickupAddress.split(',').pop().trim();
      const dropoffCity = s.dropoffAddress.split(',').pop().trim();
      const corridor = `${pickupCity} -> ${dropoffCity}`;
      routeCounts[corridor] = (routeCounts[corridor] || 0) + 1;
    });

    const formattedRoutes = Object.entries(routeCounts)
      .map(([corridor, count]) => ({ corridor, shipmentCount: count }))
      .sort((a, b) => b.shipmentCount - a.shipmentCount);

    return successResponse(res, formattedRoutes, 'Route demand statistics retrieved (FR-AR-6)');
  } catch (error) {
    next(error);
  }
}

/**
 * Empty running & vehicle utilisation report
 * Requirement: FR-AR-7
 */
async function getEmptyRunningReport(req, res, next) {
  try {
    const trips = await prisma.trip.findMany({
      where: { shipment: { status: SHIPMENT_STATUS.COMPLETED } },
      include: { shipment: true },
    });

    let totalLoadedKm = 0;
    trips.forEach((t) => {
      totalLoadedKm += t.shipment.distanceKm || 0;
    });

    // Total estimated running distance including return runs
    const estimatedTotalKm = Math.round(totalLoadedKm * 1.3);
    const estimatedEmptyKm = estimatedTotalKm - Math.round(totalLoadedKm);
    const emptyRunningPercentage = estimatedTotalKm > 0 ? Math.round((estimatedEmptyKm / estimatedTotalKm) * 100) : 0;

    return successResponse(
      res,
      {
        totalCompletedTrips: trips.length,
        totalLoadedDistanceKm: Math.round(totalLoadedKm),
        estimatedTotalDistanceKm: estimatedTotalKm,
        estimatedEmptyDistanceKm: estimatedEmptyKm,
        emptyRunningPercentage,
      },
      'Vehicle utilisation & empty running report retrieved (FR-AR-7)'
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Export data to CSV format
 * Requirement: FR-AR-13, FR-AD-18
 */
async function exportReport(req, res, next) {
  try {
    const { reportType } = req.query;

    if (reportType === 'shipments') {
      const shipments = await prisma.shipment.findMany({
        take: 1000,
        orderBy: { createdAt: 'desc' },
        select: {
          shipmentNumber: true,
          status: true,
          cargoType: true,
          cargoWeight: true,
          requiredVehicleType: true,
          distanceKm: true,
          pickupAddress: true,
          dropoffAddress: true,
          createdAt: true,
        },
      });

      const header = 'Shipment Number,Status,Cargo Type,Weight (t),Vehicle Type,Distance (km),Pickup,Dropoff,Created At\n';
      const rows = shipments
        .map(
          (s) =>
            `"${s.shipmentNumber}","${s.status}","${s.cargoType}",${s.cargoWeight},"${s.requiredVehicleType}",${s.distanceKm},"${s.pickupAddress}","${s.dropoffAddress}","${s.createdAt.toISOString()}"`
        )
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="shipments_report.csv"');
      return res.status(200).send(header + rows);
    }

    return errorResponse(res, 'INVALID_REPORT_TYPE', 'Supported report types for export: shipments', 400);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPlatformSummary,
  getVerificationThroughput,
  getRouteDemand,
  getEmptyRunningReport,
  exportReport,
};
