export type UserRole = 'CARGO_OWNER' | 'DRIVER' | 'FLEET_OWNER' | 'ADMIN';

export type AccountStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'ACTIVE' | 'SUSPENDED';

export type PreferredLanguage = 'EN' | 'UR';

export type VehicleType =
  | 'OPEN_BODY'
  | 'MAZDA_MGV'
  | 'HEAVY_SIX_WHEELER'
  | 'HEAVY_TEN_TWELVE_WHEELER'
  | 'TRAILER_FLATBED'
  | 'CONTAINER_MOUNTED'
  | 'REFRIGERATED'
  | 'TANKER'
  | 'DUMPER';

export type VehicleAvailability = 'AVAILABLE' | 'ASSIGNED' | 'INACTIVE' | 'UNDER_MAINTENANCE';

export type ShipmentStatus =
  | 'PENDING'
  | 'BOOKED'
  | 'REACHED_PICKUP'
  | 'CARGO_LOADED'
  | 'IN_TRANSIT'
  | 'REACHED_DESTINATION'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export type BidStatus = 'ACTIVE' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID';

export type ComplaintCategory =
  | 'PAYMENT_DISPUTE'
  | 'NON_DELIVERY'
  | 'DAMAGED_OR_MISSING_CARGO'
  | 'DELAY'
  | 'CARGO_MISDESCRIPTION'
  | 'LOADING_UNLOADING_DELAY'
  | 'CONDUCT'
  | 'CANCELLATION_DISPUTE'
  | 'TRACKING_OR_APPLICATION_FAULT'
  | 'OTHER';

export type ComplaintStatus = 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED' | 'WITHDRAWN';

export type NotificationType =
  | 'REGISTRATION_CONFIRMED'
  | 'VERIFICATION_OUTCOME'
  | 'NEW_MATCHING_SHIPMENT'
  | 'NEW_BID_RECEIVED'
  | 'BID_ACCEPTED'
  | 'SHIPMENT_BOOKED_BY_ANOTHER'
  | 'TRIP_STATUS_CHANGED'
  | 'TRACKING_UNAVAILABLE_OR_RESUMED'
  | 'PROOF_OF_DELIVERY_UPLOADED'
  | 'DELIVERY_CONFIRMED'
  | 'PAYMENT_STATUS_CHANGED'
  | 'COMPLAINT_RECEIVED'
  | 'COMPLAINT_STATUS_CHANGED'
  | 'ACCOUNT_SUSPENDED_OR_REINSTATED'
  | 'PLATFORM_ANNOUNCEMENT';

export interface User {
  id: string;
  role: UserRole;
  name: string;
  phone: string;
  email: string;
  accountStatus: AccountStatus;
  businessName?: string | null;
  businessAddress?: string | null;
  serviceArea?: string[];
  preferredLanguage: PreferredLanguage;
  avgRating: number;
  totalRatings: number;
  completedTripsCount: number;
  createdAt: string;
}

export interface VerificationDocument {
  id: string;
  userId: string;
  documentType: string;
  originalFilename?: string;
  fileSizeBytes: number;
  expiryDate?: string | null;
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
  signedUrl?: string;
  viewUrl?: string;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  ownerId: string;
  registrationNumber: string;
  vehicleType: VehicleType;
  ratedCapacity: number;
  model: string;
  year: number;
  availabilityStatus: VehicleAvailability;
  defaultDriver?: {
    id: string;
    name: string;
    phone: string;
    accountStatus: AccountStatus;
  } | null;
  createdAt: string;
}

export interface Shipment {
  id: string;
  shipmentNumber: string;
  cargoOwnerId: string;
  cargoOwner?: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
  };
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  cargoType: string;
  cargoWeight: number;
  requiredVehicleType: VehicleType;
  expectedDeliveryDate: string;
  distanceKm: number;
  durationMinutes: number;
  routePolyline?: string | null;
  isDistanceApproximate: boolean;
  status: ShipmentStatus;
  bids?: Bid[];
  trip?: Trip | null;
  paymentRecord?: PaymentRecord | null;
  complaints?: Complaint[];
  createdAt: string;
}

export interface Bid {
  id: string;
  shipmentId: string;
  bidderId: string;
  bidder?: User;
  offeredVehicleType: VehicleType;
  proposedFare: number;
  estimatedDeliveryTime: string;
  status: BidStatus;
  createdAt: string;
}

export interface Trip {
  id: string;
  shipmentId: string;
  shipment?: Shipment;
  driverId: string;
  driver?: User;
  vehicleId: string;
  vehicle?: Vehicle;
  fleetOwnerId?: string | null;
  agreedFare: number;
  startedAt?: string | null;
  completedAt?: string | null;
  isTrackingActive: boolean;
  isInterrupted: boolean;
  lastPositionAt?: string | null;
  positions?: {
    id: string;
    latitude: number;
    longitude: number;
    accuracy: number;
    recordedAt: string;
  }[];
}

export interface PaymentRecord {
  id: string;
  shipmentId: string;
  shipment?: Shipment;
  cargoOwnerId: string;
  driverId?: string | null;
  fleetOwnerId?: string | null;
  agreedFare: number;
  amountReceived: number;
  status: PaymentStatus;
  isFrozen: boolean;
  createdAt: string;
}

export interface Complaint {
  id: string;
  referenceCode: string;
  shipmentId: string;
  shipment?: Shipment;
  submitterId: string;
  submitter?: User;
  counterpartyId?: string | null;
  counterparty?: User | null;
  category: ComplaintCategory;
  description: string;
  attachmentKeys: string[];
  signedAttachmentUrls?: string[];
  status: ComplaintStatus;
  adminRemarks?: string | null;
  createdAt: string;
}

export interface AdminAuditLog {
  id: string;
  adminId: string;
  admin?: {
    id: string;
    name: string;
    email: string;
  };
  action: string;
  targetType: string;
  targetId: string;
  previousState?: any;
  newState?: any;
  reason?: string | null;
  ipAddress?: string | null;
  timestamp: string;
}

export interface Notification {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedShipmentId?: string | null;
  isRead: boolean;
  createdAt: string;
}
