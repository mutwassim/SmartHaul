'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Modal } from '../../../components/ui/Modal';
import { Shipment, Vehicle, VehicleType } from '../../../types';
import { TrendingUp, DollarSign, Clock, MapPin, CheckCircle, AlertCircle } from 'lucide-react';

export default function FleetBidsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Bidding Modal State
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [isBidModalOpen, setIsBidModalOpen] = useState(false);
  const [proposedFare, setProposedFare] = useState<number | ''>('');
  const [estimatedDeliveryTime, setEstimatedDeliveryTime] = useState('');
  const [offeredVehicleType, setOfferedVehicleType] = useState<VehicleType>('OPEN_BODY');
  const [isProcessing, setIsProcessing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [vData, sData] = await Promise.all([
        api.get<Vehicle[]>('/fleet/vehicles'),
        api.get<Shipment[]>('/driver/matched-shipments'), // Reuse matching endpoint
      ]);
      setVehicles(vData || []);
      setShipments(sData || []);
      if (vData && vData.length > 0) {
        setOfferedVehicleType(vData[0].vehicleType);
      }
    } catch (err) {
      console.error('Error fetching matched loads:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenBidModal = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setProposedFare('');
    setOfferedVehicleType(shipment.requiredVehicleType);
    setEstimatedDeliveryTime(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16));
    setFormError(null);
    setIsBidModalOpen(true);
  };

  const handleSubmitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposedFare || Number(proposedFare) <= 0) {
      setFormError('Please enter a valid proposed fare');
      return;
    }

    setIsProcessing(true);
    setFormError(null);

    try {
      await api.post('/driver/bids', {
        shipmentId: selectedShipment?.id,
        proposedFare: Number(proposedFare),
        estimatedDeliveryTime: new Date(estimatedDeliveryTime).toISOString(),
        offeredVehicleType,
      });

      setIsBidModalOpen(false);
      alert('Fleet bid submitted successfully (FR-FO-12)');
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to submit bid');
    } finally {
      setIsProcessing(false);
    }
  };

  const columns: Column<Shipment>[] = [
    {
      header: 'Shipment #',
      accessor: 'shipmentNumber',
      sortable: true,
      render: (item) => <strong>{item.shipmentNumber}</strong>,
    },
    {
      header: 'Route & Distance',
      render: (item) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MapPin size={12} style={{ color: 'var(--primary)' }} />
            <span>{item.pickupAddress}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
            <MapPin size={12} style={{ color: 'var(--accent-emerald)' }} />
            <span>{item.dropoffAddress}</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
            Distance: {item.distanceKm} km (~{Math.round(item.durationMinutes / 60)}h)
          </span>
        </div>
      ),
    },
    {
      header: 'Cargo',
      render: (item) => (
        <div>
          <strong>{item.cargoWeight} tonnes</strong>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {item.cargoType}
          </span>
        </div>
      ),
    },
    {
      header: 'Required Vehicle',
      accessor: 'requiredVehicleType',
      sortable: true,
      render: (item) => (
        <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          {item.requiredVehicleType.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      header: 'Delivery Deadline',
      accessor: 'expectedDeliveryDate',
      sortable: true,
      render: (item) => (
        <div style={{ fontSize: '0.8rem' }}>
          {new Date(item.expectedDeliveryDate).toLocaleDateString()}
        </div>
      ),
    },
    {
      header: 'Actions',
      render: (item) => (
        <button
          className="btn btn-primary"
          style={{ padding: '6px 14px', fontSize: '0.8rem' }}
          onClick={() => handleOpenBidModal(item)}
        >
          <DollarSign size={14} />
          <span>Place Bid</span>
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Matched Shipment Loads (FR-FO-11, FR-FO-12)
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Open shipment requests matched against your fleet vehicles capacity and body types
        </p>
      </div>

      <DataTable
        columns={columns}
        data={shipments}
        keyExtractor={(item) => item.id}
        searchPlaceholder="Search matched loads by route, cargo, or vehicle..."
        isLoading={isLoading}
        emptyMessage="No open matching shipments currently found."
      />

      {/* Submit Fleet Bid Modal (FR-FO-12) */}
      <Modal
        isOpen={isBidModalOpen}
        onClose={() => setIsBidModalOpen(false)}
        title={`Place Bid: ${selectedShipment?.shipmentNumber || ''}`}
        maxWidth="500px"
      >
        <form onSubmit={handleSubmitBid} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Route: </span>
              <strong>{selectedShipment?.pickupAddress} → {selectedShipment?.dropoffAddress}</strong>
            </div>
            <div style={{ marginTop: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Load: </span>
              <strong>{selectedShipment?.cargoWeight}t {selectedShipment?.cargoType}</strong> ({selectedShipment?.distanceKm} km)
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Proposed Fare (PKR, BR-7)
            </label>
            <input
              type="number"
              required
              min="1000"
              placeholder="e.g. 55000"
              className="form-input"
              value={proposedFare}
              onChange={(e) => setProposedFare(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Offered Vehicle Class
            </label>
            <select
              className="form-select"
              value={offeredVehicleType}
              onChange={(e) => setOfferedVehicleType(e.target.value as VehicleType)}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.vehicleType}>
                  {v.model} ({v.vehicleType.replace(/_/g, ' ')}, {v.ratedCapacity}t)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Estimated Delivery Arrival
            </label>
            <input
              type="datetime-local"
              required
              className="form-input"
              value={estimatedDeliveryTime}
              onChange={(e) => setEstimatedDeliveryTime(e.target.value)}
            />
          </div>

          {formError && (
            <div style={{ padding: '10px', backgroundColor: 'var(--accent-rose-bg)', color: 'var(--accent-rose)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsBidModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isProcessing}>
              Submit Bid (BR-7)
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
