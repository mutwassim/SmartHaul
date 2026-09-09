'use client';

import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/services/api';
import { Shipment, ShipmentStatus } from '@/types';
import StatusBadge from '@/components/ui/StatusBadge';
import StatsCard from '@/components/ui/StatsCard';
import DataTable, { Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import {
  Package,
  Truck,
  MapPin,
  Clock,
  AlertTriangle,
  Eye,
  CheckCircle2,
  Calendar,
  DollarSign,
  User,
  ShieldAlert,
  Search,
  RefreshCw,
} from 'lucide-react';

export default function AdminShipmentsPage() {
  const { t, isRTL } = useLanguage();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [onlyExceptions, setOnlyExceptions] = useState<boolean>(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  const fetchShipments = async () => {
    try {
      setLoading(true);
      if (onlyExceptions) {
        const excData = await api.get<Shipment[]>('/admin/shipments/exceptional');
        setShipments(excData || []);
      } else {
        const endpoint = selectedStatus === 'ALL' ? '/admin/shipments' : `/admin/shipments?status=${selectedStatus}`;
        const allData = await api.get<Shipment[]>(endpoint);
        setShipments(allData || []);
      }
    } catch (err) {
      console.error('Failed to fetch shipments', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShipments();
  }, [selectedStatus, onlyExceptions]);

  // Aggregate stats
  const totalCount = shipments.length;
  const inTransitCount = shipments.filter((s) => s.status === 'IN_TRANSIT').length;
  const bookedCount = shipments.filter((s) => s.status === 'BOOKED').length;
  const completedCount = shipments.filter((s) => s.status === 'COMPLETED' || s.status === 'DELIVERED').length;

  const columns: Column<Shipment>[] = [
    {
      header: 'Shipment #',
      accessor: (s) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{s.shipmentNumber}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Created: {new Date(s.createdAt).toLocaleDateString()}
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Cargo Details',
      accessor: (s) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.cargoType}</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {s.cargoWeight} tonnes • {s.requiredVehicleType}
          </div>
        </div>
      ),
    },
    {
      header: 'Route Corridor',
      accessor: (s) => (
        <div style={{ fontSize: '0.85rem' }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
            {s.pickupAddress} &rarr; {s.dropoffAddress}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {s.distanceKm} km (~{Math.round(s.durationMinutes / 60)} hrs)
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (s) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <StatusBadge status={s.status} />
          {s.complaints && s.complaints.length > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                fontSize: '0.75rem',
                color: '#ef4444',
                background: 'rgba(239, 68, 68, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              <ShieldAlert size={12} />
              Disputed
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Cargo Owner',
      accessor: (s) => (
        <div style={{ fontSize: '0.85rem' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.cargoOwner?.name || 'N/A'}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.cargoOwner?.phone || ''}</div>
        </div>
      ),
    },
    {
      header: 'Actions',
      accessor: (s) => (
        <button
          onClick={() => setSelectedShipment(s)}
          style={{
            padding: '0.4rem 0.8rem',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.8rem',
            fontWeight: 500,
          }}
        >
          <Eye size={13} />
          Inspect
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            {isRTL ? 'پلیٹ فارم ترسیلات ڈائریکٹری' : 'Platform Shipments & Exception Monitoring'}
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            {isRTL
              ? 'پلیٹ فارم پر موجود تمام ترسیلات کی مکمل نگرانی، تلاش اور استثنائی حالات کا معائنہ (FR-AD-10, FR-AD-12)'
              : 'Search, filter, inspect and monitor all platform freight operations and exceptions (FR-AD-10, FR-AD-12).'}
          </p>
        </div>

        <button
          onClick={fetchShipments}
          disabled={loading}
          style={{
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {isRTL ? 'تازہ کریں' : 'Refresh'}
        </button>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        <StatsCard
          title={isRTL ? 'کل ترسیلات' : 'Total Shipments'}
          value={totalCount}
          icon={<Package size={22} />}
          description={isRTL ? 'پلیٹ فارم لسٹنگز' : 'All recorded shipments'}
        />
        <StatsCard
          title={isRTL ? 'راستے میں' : 'In Transit'}
          value={inTransitCount}
          icon={<Truck size={22} />}
          description={isRTL ? 'فعال سفر' : 'Live tracking active'}
        />
        <StatsCard
          title={isRTL ? 'بک شدہ' : 'Booked / Dispatch'}
          value={bookedCount}
          icon={<Clock size={22} />}
          description={isRTL ? 'ڈرائیور تعیناتی کا انتظار' : 'Awaiting transit start'}
        />
        <StatsCard
          title={isRTL ? 'مکمل ترسیلات' : 'Completed Deliveries'}
          value={completedCount}
          icon={<CheckCircle2 size={22} />}
          description={isRTL ? 'کامیاب ترسیلات' : 'Confirmed POD'}
        />
      </div>

      {/* Filters & Exception Toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '0.4rem',
            background: 'var(--bg-card)',
            padding: '6px',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            flexWrap: 'wrap',
          }}
        >
          {[
            { id: 'ALL', label: 'All Statuses' },
            { id: 'PENDING', label: 'Pending Bids' },
            { id: 'BOOKED', label: 'Booked' },
            { id: 'IN_TRANSIT', label: 'In Transit' },
            { id: 'DELIVERED', label: 'Delivered' },
            { id: 'COMPLETED', label: 'Completed' },
            { id: 'CANCELLED', label: 'Cancelled' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setOnlyExceptions(false);
                setSelectedStatus(tab.id);
              }}
              style={{
                padding: '0.45rem 0.9rem',
                borderRadius: '6px',
                border: 'none',
                background: !onlyExceptions && selectedStatus === tab.id ? 'var(--primary)' : 'transparent',
                color: !onlyExceptions && selectedStatus === tab.id ? 'white' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setOnlyExceptions(!onlyExceptions)}
          style={{
            padding: '0.55rem 1.1rem',
            borderRadius: '8px',
            border: onlyExceptions ? '2px solid #ef4444' : '1px solid var(--border-color)',
            background: onlyExceptions ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-card)',
            color: onlyExceptions ? '#ef4444' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'all 0.2s ease',
          }}
        >
          <AlertTriangle size={16} />
          {isRTL ? 'صرف استثنائی و تاخیر شدہ دکھائیں (FR-AD-12)' : 'Exceptions Queue Only (FR-AD-12)'}
        </button>
      </div>

      {/* Shipment Directory Table */}
      <DataTable
        title={onlyExceptions ? 'Exceptional Shipments (Delayed / Disputed / Unassigned)' : 'Platform Shipment Directory'}
        data={shipments}
        columns={columns}
        keyExtractor={(s) => s.id}
        loading={loading}
        searchable={true}
        searchPlaceholder="Search by shipment #, cargo, or address..."
        emptyMessage={onlyExceptions ? 'No exceptional shipments detected. All operations normal.' : 'No shipments found.'}
      />

      {/* Shipment Inspection Modal */}
      <Modal
        isOpen={!!selectedShipment}
        onClose={() => setSelectedShipment(null)}
        title={selectedShipment ? `Shipment Inspection: ${selectedShipment.shipmentNumber}` : 'Shipment Inspection'}
      >
        {selectedShipment && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <StatusBadge status={selectedShipment.status} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                UUID: {selectedShipment.id}
              </span>
            </div>

            {/* Cargo & Route Info */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                background: 'var(--bg-card-hover)',
                padding: '1rem',
                borderRadius: '8px',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Cargo Type</span>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedShipment.cargoType}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Weight & Body</span>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedShipment.cargoWeight} tonnes ({selectedShipment.requiredVehicleType})
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Distance & Duration</span>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedShipment.distanceKm} km (~{Math.round(selectedShipment.durationMinutes / 60)} hrs)
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Expected Delivery</span>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {new Date(selectedShipment.expectedDeliveryDate).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Origin & Destination */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <MapPin size={16} style={{ color: '#16a34a', marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <strong>Pickup Origin:</strong> {selectedShipment.pickupAddress}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <MapPin size={16} style={{ color: '#ef4444', marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <strong>Dropoff Destination:</strong> {selectedShipment.dropoffAddress}
                </div>
              </div>
            </div>

            {/* Stakeholders & Resources */}
            <div
              style={{
                borderTop: '1px solid var(--border-color)',
                paddingTop: '1rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
              }}
            >
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--primary)' }}>
                  Cargo Owner
                </strong>
                <div>{selectedShipment.cargoOwner?.name || 'N/A'}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {selectedShipment.cargoOwner?.phone || selectedShipment.cargoOwner?.email}
                </div>
              </div>

              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--secondary)' }}>
                  Assigned Driver & Vehicle
                </strong>
                {selectedShipment.trip?.driver ? (
                  <div>
                    <div>{selectedShipment.trip.driver.name} ({selectedShipment.trip.driver.phone})</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      Vehicle: {selectedShipment.trip.vehicle?.model || 'Assigned'}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)' }}>No driver assigned yet</div>
                )}
              </div>
            </div>

            {/* Agreed Fare & Payment */}
            {selectedShipment.paymentRecord && (
              <div
                style={{
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Agreed Fare</span>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                    Rs. {selectedShipment.paymentRecord.agreedFare.toLocaleString()}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Payment Status</span>
                  <div>
                    <StatusBadge status={selectedShipment.paymentRecord.status} />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setSelectedShipment(null)}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '6px',
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
