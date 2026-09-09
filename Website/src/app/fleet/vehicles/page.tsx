'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Modal } from '../../../components/ui/Modal';
import { Vehicle, VehicleType } from '../../../types';
import { PlusCircle, Trash2, Wrench, Truck, AlertCircle } from 'lucide-react';

export default function FleetVehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('OPEN_BODY');
  const [ratedCapacity, setRatedCapacity] = useState<number>(3);
  const [model, setModel] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [isProcessing, setIsProcessing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      const data = await api.get<Vehicle[]>('/fleet/vehicles');
      setVehicles(data || []);
    } catch (err) {
      console.error('Error fetching fleet vehicles:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setFormError(null);

    try {
      await api.post('/fleet/vehicles', {
        registrationNumber,
        vehicleType,
        ratedCapacity: Number(ratedCapacity),
        model,
        year: Number(year),
      });

      setIsAddModalOpen(false);
      setRegistrationNumber('');
      setModel('');
      fetchVehicles();
    } catch (err: any) {
      setFormError(err.message || 'Failed to register vehicle');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleMaintenance = async (vehicle: Vehicle) => {
    const newStatus = vehicle.availabilityStatus === 'UNDER_MAINTENANCE' ? 'AVAILABLE' : 'UNDER_MAINTENANCE';
    try {
      await api.put(`/fleet/vehicles/${vehicle.id}`, {
        availabilityStatus: newStatus,
      });
      fetchVehicles();
    } catch (err: any) {
      alert(err.message || 'Failed to update vehicle status');
    }
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    if (!confirm('Are you sure you want to remove this vehicle from the fleet?')) return;

    try {
      await api.delete(`/fleet/vehicles/${vehicleId}`);
      fetchVehicles();
    } catch (err: any) {
      alert(err.message || 'Cannot remove vehicle while assigned to active shipment (BR-31)');
    }
  };

  const columns: Column<Vehicle>[] = [
    {
      header: 'Vehicle Model',
      accessor: 'model',
      sortable: true,
      render: (item) => (
        <div>
          <strong>{item.model}</strong>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Year: {item.year}
          </span>
        </div>
      ),
    },
    {
      header: 'Registration',
      accessor: 'registrationNumber',
      sortable: true,
      render: (item) => <code>{item.registrationNumber}</code>,
    },
    {
      header: 'Body Type (Table C-5)',
      accessor: 'vehicleType',
      sortable: true,
      render: (item) => (
        <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          {item.vehicleType.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      header: 'Rated Capacity',
      accessor: 'ratedCapacity',
      sortable: true,
      render: (item) => <strong>{item.ratedCapacity} tonnes</strong>,
    },
    {
      header: 'Availability',
      accessor: 'availabilityStatus',
      sortable: true,
      render: (item) => <StatusBadge status={item.availabilityStatus} size="sm" />,
    },
    {
      header: 'Actions',
      render: (item) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-secondary"
            style={{ padding: '6px 10px', fontSize: '0.75rem' }}
            onClick={() => handleToggleMaintenance(item)}
            title="Toggle Maintenance Status"
          >
            <Wrench size={14} />
            <span>{item.availabilityStatus === 'UNDER_MAINTENANCE' ? 'Set Available' : 'Maintenance'}</span>
          </button>
          <button
            className="btn btn-secondary"
            style={{ padding: '6px 10px', color: 'var(--accent-rose)' }}
            onClick={() => handleDeleteVehicle(item.id)}
            title="Remove Vehicle"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Vehicle Register (FR-FO-3 to FR-FO-6)
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Maintain fleet trucks, rated capacities, body types, and availability states for matching (BR-4, BR-30)
          </p>
        </div>

        <button
          className="btn btn-primary"
          style={{ padding: '10px 18px', gap: '8px' }}
          onClick={() => {
            setFormError(null);
            setIsAddModalOpen(true);
          }}
        >
          <PlusCircle size={16} />
          <span>Register Vehicle</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        data={vehicles}
        keyExtractor={(item) => item.id}
        searchPlaceholder="Search vehicles by model or registration..."
        isLoading={isLoading}
        emptyMessage="No vehicles registered in fleet."
      />

      {/* Register Vehicle Modal (FR-FO-3) */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register Vehicle to Fleet (FR-FO-3)"
        maxWidth="540px"
      >
        <form onSubmit={handleAddVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Vehicle Registration Number (Unique Platform-Wide, BR-30)
            </label>
            <input
              type="text"
              required
              placeholder="e.g. LES-2024-9988"
              className="form-input"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Vehicle Make & Model
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Hino 500 Super Dolphin"
                className="form-input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Manufacturing Year
              </label>
              <input
                type="number"
                required
                className="form-input"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Vehicle Body Type (Table C-5)
              </label>
              <select
                className="form-select"
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as VehicleType)}
              >
                <option value="OPEN_BODY">Open-body truck (1–3t)</option>
                <option value="MAZDA_MGV">Mazda / medium goods (3–8t)</option>
                <option value="HEAVY_SIX_WHEELER">Heavy six wheeler (8–16t)</option>
                <option value="HEAVY_TEN_TWELVE_WHEELER">Heavy ten/twelve wheeler (16–30t)</option>
                <option value="TRAILER_FLATBED">Trailer, flatbed (20–40t)</option>
                <option value="CONTAINER_MOUNTED">Container-mounted trailer (20–30t)</option>
                <option value="REFRIGERATED">Refrigerated vehicle (1–15t)</option>
                <option value="TANKER">Tanker (10–30t)</option>
                <option value="DUMPER">Dumper (10–25t)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Rated Load Capacity (Tonnes, BR-4)
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                required
                className="form-input"
                value={ratedCapacity}
                onChange={(e) => setRatedCapacity(Number(e.target.value))}
              />
            </div>
          </div>

          {formError && (
            <div style={{ padding: '10px', backgroundColor: 'var(--accent-rose-bg)', color: 'var(--accent-rose)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isProcessing}>
              Register Vehicle
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
