/**
 * SmartHaul Platform Constants & Business Rules Configuration
 * Reference: SmartHaul SRS v1.0 (Revised)
 */

module.exports = {
  // Roles
  ROLES: {
    CARGO_OWNER: 'CARGO_OWNER',
    DRIVER: 'DRIVER',
    FLEET_OWNER: 'FLEET_OWNER',
    ADMIN: 'ADMIN',
  },

  // Account Statuses (Table C-2)
  ACCOUNT_STATUS: {
    PENDING: 'PENDING',
    VERIFIED: 'VERIFIED',
    REJECTED: 'REJECTED',
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
  },

  // Shipment Status Lifecycle (Appendix C.1, Fig C-1)
  SHIPMENT_STATUS: {
    PENDING: 'PENDING',
    BOOKED: 'BOOKED',
    REACHED_PICKUP: 'REACHED_PICKUP',
    CARGO_LOADED: 'CARGO_LOADED',
    IN_TRANSIT: 'IN_TRANSIT',
    REACHED_DESTINATION: 'REACHED_DESTINATION',
    DELIVERED: 'DELIVERED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
  },

  // Valid status transitions for the driver / lifecycle
  VALID_STATUS_TRANSITIONS: {
    PENDING: ['BOOKED', 'CANCELLED'],
    BOOKED: ['REACHED_PICKUP', 'CANCELLED'],
    REACHED_PICKUP: ['CARGO_LOADED', 'CANCELLED'],
    CARGO_LOADED: ['IN_TRANSIT', 'CANCELLED'],
    IN_TRANSIT: ['REACHED_DESTINATION', 'CANCELLED'],
    REACHED_DESTINATION: ['DELIVERED'],
    DELIVERED: ['COMPLETED'],
    COMPLETED: [],
    CANCELLED: [],
  },

  // Bid Statuses (Table C-6)
  BID_STATUS: {
    ACTIVE: 'ACTIVE',
    ACCEPTED: 'ACCEPTED',
    REJECTED: 'REJECTED',
    WITHDRAWN: 'WITHDRAWN',
  },

  // Payment Statuses (Table C-3)
  PAYMENT_STATUS: {
    PENDING: 'PENDING',
    PARTIAL: 'PARTIAL',
    PAID: 'PAID',
  },

  // Vehicle Types & Capacities (Table C-5)
  VEHICLE_TYPES: {
    OPEN_BODY: {
      label: 'Open-body truck (Shehzore or similar)',
      minCapacity: 1.0,
      maxCapacity: 3.0,
      compatibleCargos: ['GENERAL_GOODS', 'CONSTRUCTION_MATERIAL', 'AGRICULTURAL_PRODUCE'],
    },
    MAZDA_MGV: {
      label: 'Mazda / medium goods vehicle',
      minCapacity: 3.0,
      maxCapacity: 8.0,
      compatibleCargos: ['GENERAL_GOODS', 'PACKAGED_GOODS', 'FURNITURE', 'CONSTRUCTION_MATERIAL'],
    },
    HEAVY_SIX_WHEELER: {
      label: 'Heavy truck, six wheeler',
      minCapacity: 8.0,
      maxCapacity: 16.0,
      compatibleCargos: ['GENERAL_GOODS', 'BULK_GOODS', 'CONSTRUCTION_MATERIAL', 'MACHINERY'],
    },
    HEAVY_TEN_TWELVE_WHEELER: {
      label: 'Heavy truck, ten wheeler or twelve wheeler',
      minCapacity: 16.0,
      maxCapacity: 30.0,
      compatibleCargos: ['BULK_GOODS', 'CONSTRUCTION_MATERIAL', 'MACHINERY', 'INDUSTRIAL_RAW_MATERIAL'],
    },
    TRAILER_FLATBED: {
      label: 'Trailer, flatbed',
      minCapacity: 20.0,
      maxCapacity: 40.0,
      compatibleCargos: ['CONTAINERS', 'MACHINERY', 'OVERSIZED_AND_INDUSTRIAL_CARGO'],
    },
    CONTAINER_MOUNTED: {
      label: 'Container-mounted trailer',
      minCapacity: 20.0,
      maxCapacity: 30.0,
      compatibleCargos: ['CONTAINERISED_GOODS', 'EXPORT_AND_IMPORT_CONSIGNMENTS'],
    },
    REFRIGERATED: {
      label: 'Refrigerated vehicle',
      minCapacity: 1.0,
      maxCapacity: 15.0,
      compatibleCargos: ['PERISHABLE_GOODS', 'PHARMACEUTICAL_GOODS', 'TEMPERATURE_CONTROLLED_CARGO'],
    },
    TANKER: {
      label: 'Tanker',
      minCapacity: 10.0,
      maxCapacity: 30.0,
      compatibleCargos: ['LIQUIDS_AND_BULK_FLUID'],
    },
    DUMPER: {
      label: 'Dumper',
      minCapacity: 10.0,
      maxCapacity: 25.0,
      compatibleCargos: ['LOOSE_BULK_SAND_GRAVEL_EARTH'],
    },
  },

  // Complaint Categories (Table C-4)
  COMPLAINT_CATEGORIES: {
    PAYMENT_DISPUTE: 'PAYMENT_DISPUTE',
    NON_DELIVERY: 'NON_DELIVERY',
    DAMAGED_OR_MISSING_CARGO: 'DAMAGED_OR_MISSING_CARGO',
    DELAY: 'DELAY',
    CARGO_MISDESCRIPTION: 'CARGO_MISDESCRIPTION',
    LOADING_UNLOADING_DELAY: 'LOADING_UNLOADING_DELAY',
    CONDUCT: 'CONDUCT',
    CANCELLATION_DISPUTE: 'CANCELLATION_DISPUTE',
    TRACKING_OR_APPLICATION_FAULT: 'TRACKING_OR_APPLICATION_FAULT',
    OTHER: 'OTHER',
  },

  // Timeouts & Business Rules
  SECURITY: {
    ADMIN_INACTIVITY_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes (SEC-3)
    USER_INACTIVITY_TIMEOUT_MS: 12 * 60 * 60 * 1000, // 12 hours (SEC-3)
    ABSOLUTE_SESSION_LIFETIME_DAYS: 30, // 30 days (SEC-3)
    MAX_FAILED_LOGIN_ATTEMPTS: 5, // SEC-5
    LOCKOUT_DURATION_MS: 30 * 60 * 1000, // 30 minutes (SEC-5)
    FAILED_ATTEMPTS_WINDOW_MS: 15 * 60 * 1000, // 15 minutes (SEC-5)
    SIGNED_URL_EXPIRY_SECONDS: 15 * 60, // 15 minutes (SEC-8, SI-4.2)
  },

  TIMING: {
    OSRM_TIMEOUT_MS: 5000, // 5 seconds (SI-2.4)
    TRACKING_UPDATE_INTERVAL_SEC: 30, // 30s (FR-RT-2)
    TRACKING_INTERRUPTION_THRESHOLD_SEC: 120, // 120s (FR-RT-11)
    AUTO_COMPLETION_HOURS: 72, // 72 hours (BR-20, FR-CO-21)
    POSITION_RETENTION_DAYS: 90, // 90 days (BR-17, SEC-14)
  },

  LIMITS: {
    MAX_LIST_PAGE_SIZE: 100, // SI-1.5
    DEFAULT_LIST_PAGE_SIZE: 20,
    MAX_POD_IMAGES: 5, // BR-18, FR-DR-18
    MIN_POD_IMAGES: 1, // BR-18, FR-DR-19
    MAX_COMPLAINT_IMAGES: 3, // FR-CO-25
    MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5 MB (SI-4.3, OE-12)
    MAX_GPS_ACCURACY_METERS: 100, // HI-3
    RETURN_LOAD_RADIUS_KM: 50, // Proximity radius for return load detection
    SHARED_LOAD_DETOUR_PERCENT_MAX: 15, // Max allowable detour % for shared load
  },
};
