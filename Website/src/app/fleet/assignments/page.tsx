'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Modal } from '../../../components/ui/Modal';
import { Shipment, Vehicle, User } from '../../../types';
import { UserCheck, Truck, ClipboardList, CheckCircle } from 'lucide-react';

export default function FleetAssignmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Assignment Modal
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [vData, dData, sData] = await Promise.all([
        api.get<Vehicle[]>('/fleet/vehicles'),
        api.get<User[]>('/fleet/drivers'),
        api.get<Shipment[]>('/shipments?status=BOOKED'),
      ]);
      setVehicles(vData || []);
      setDrivers(dData || []);
      setShipments(sData || []);

      if (vData && vData.length > 0) setSelectedVehicleId(vData[0].id);
      if (dData && dData.length > 0) setSelectedDriverId(dData[0].id);
    } catch (err) {
      console.error('Error fetching assignment data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAssignModal = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setFormError(null);
    setIsAssignModalOpen(true);
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setFormError(null);

    try {
      await api.post('/fleet/assign', {
        shipmentId: selectedShipment?.id,
        vehicleId: selectedVehicleId,
        driverId: selectedDriverId,
      });

      setIsAssignModalOpen(false);
      alert('Driver and Vehicle assigned to shipment successfully (FR-FO-13)');
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to assign resources');
    } finally {
      setIsProcessing(false);
    }
  };

  const availableVehicles = vehicles.filter((v) => v.availabilityStatus === 'AVAILABLE');
  const verifiedDrivers = drivers.filter((d) => d.accountStatus === 'VERIFIED');

  const columns: Column<Shipment>[] = [
    {
      header: 'Shipment #',
      accessor: 'shipmentNumber',
      sortable: true,
      render: (item) => <strong>{item.shipmentNumber}</strong>,
    },
    {
      header: 'Route',
      render: (item) => (
        <span style={{ fontSize: '0.85rem' }}>
          {item.pickupAddress} → {item.dropoffAddress}
        </span>
      ),
    },
    {
      header: 'Cargo Load',
      render: (item) => <strong>{item.cargoWeight} tonnes ({item.cargoType})</strong>,
    },
    {
      header: 'Required Type',
      accessor: 'requiredVehicleType',
      render: (item) => (
        <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          {item.requiredVehicleType.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      header: 'Action',
      render: (item) => (
        <button
          className="btn btn-primary"
          style={{ padding: '6px 14px', fontSize: '0.8rem' }}
          onClick={() => handleOpenAssignModal(item)}
        >
          <ClipboardList size={14} />
          <span>Assign Resources</span>
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Resource Assignment (FR-FO-13, FR-FO-14)
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Nominate specific verified drivers and available fleet vehicles to won shipment bookings (BR-12, BR-13)
        </p>
      </div>

      <DataTable
        columns={columns}
        data={shipments}
        keyExtractor={(item) => item.id}
        searchPlaceholder="Search won bookings..."
        isLoading={isLoading}
        emptyMessage="No won bookings awaiting resource assignment."
      />

      {/* Resource Assignment Modal (FR-FO-13) */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={`Assign Resources: ${selectedShipment?.shipmentNumber || ''}`}
        maxWidth="500px"
      >
        <form onSubmit={handleAssign} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Required Vehicle: </span>
              <strong>{selectedShipment?.requiredVehicleType.replace(/_/g, ' ')}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Cargo Weight: </span>
              <strong>{selectedShipment?.cargoWeight} tonnes</strong>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Select Fleet Vehicle (Must be Available & Capacity ≥ {selectedShipment?.cargoWeight}t, BR-4, BR-12)
            </label>
            <select
              className="form-select"
              required
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
            >
              {availableVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.model} ({v.registrationNumber}) — {v.ratedCapacity}t ({v.vehicleType})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Select Driver (Must be Verified, BR-13)
            </label>
            <select
              className="form-select"
              required
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
            >
              {verifiedDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.phone}) — {d.completedTripsCount} trips
                </option>
              ))}
            </select>
          </div>

          {formError && (
            <div style={{ padding: '10px', backgroundColor: 'var(--accent-rose-bg)', color: 'var(--accent-rose)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsAssignModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isProcessing}>
              Confirm Assignment (FR-FO-13)
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
