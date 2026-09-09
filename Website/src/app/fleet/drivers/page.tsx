'use client';

import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { api, ApiError } from '@/services/api';
import { User, AccountStatus } from '@/types';
import StatusBadge from '@/components/ui/StatusBadge';
import StatsCard from '@/components/ui/StatsCard';
import DataTable, { Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import {
  Users,
  UserPlus,
  Phone,
  Mail,
  Star,
  CheckCircle2,
  Trash2,
  Search,
  ShieldCheck,
  AlertCircle,
  Truck,
} from 'lucide-react';

interface AvailableDriver {
  id: string;
  name: string;
  phone: string;
  email: string;
  avgRating: number;
  completedTripsCount: number;
}

export default function FleetDriversPage() {
  const { t, isRTL } = useLanguage();
  const [drivers, setDrivers] = useState<User[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<AvailableDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Link Modal
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [manualPhone, setManualPhone] = useState<string>('');
  const [linkMode, setLinkMode] = useState<'SELECT' | 'PHONE'>('SELECT');

  // Unlink Modal
  const [driverToUnlink, setDriverToUnlink] = useState<User | null>(null);

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      setError(null);
      const [linkedData, availData] = await Promise.all([
        api.get<User[]>('/fleet/drivers'),
        api.get<AvailableDriver[]>('/fleet/drivers/available').catch(() => []),
      ]);
      setDrivers(linkedData || []);
      setAvailableDrivers(availData || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load drivers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  const handleLinkDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      setError(null);
      setSuccessMsg(null);

      const payload = linkMode === 'SELECT' ? { driverId: selectedDriverId } : { phone: manualPhone };

      if (linkMode === 'SELECT' && !selectedDriverId) {
        setError('Please select a driver');
        setActionLoading(false);
        return;
      }
      if (linkMode === 'PHONE' && !manualPhone.trim()) {
        setError('Please enter a valid driver phone number');
        setActionLoading(false);
        return;
      }

      await api.post('/fleet/drivers', payload);
      setSuccessMsg('Driver linked to your fleet successfully!');
      setIsLinkModalOpen(false);
      setSelectedDriverId('');
      setManualPhone('');
      await fetchDrivers();
    } catch (err: any) {
      setError(err.message || 'Failed to link driver');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlinkDriver = async () => {
    if (!driverToUnlink) return;
    try {
      setActionLoading(true);
      setError(null);
      await api.delete(`/fleet/drivers/${driverToUnlink.id}`);
      setSuccessMsg(`Driver ${driverToUnlink.name} has been unlinked.`);
      setDriverToUnlink(null);
      await fetchDrivers();
    } catch (err: any) {
      setError(err.message || 'Failed to unlink driver');
    } finally {
      setActionLoading(false);
    }
  };

  // KPIs
  const totalDrivers = drivers.length;
  const verifiedDrivers = drivers.filter((d) => d.accountStatus === 'VERIFIED').length;
  const avgFleetRating =
    drivers.length > 0
      ? (drivers.reduce((acc, d) => acc + (d.avgRating || 0), 0) / drivers.length).toFixed(1)
      : '0.0';
  const totalTrips = drivers.reduce((acc, d) => acc + (d.completedTripsCount || 0), 0);

  const columns: Column<User>[] = [
    {
      header: 'Driver Name',
      accessor: (driver) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 600,
              fontSize: '1rem',
            }}
          >
            {driver.name.charAt(0)}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{driver.name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {driver.id.slice(0, 8)}...</div>
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Contact Info',
      accessor: (driver) => (
        <div style={{ fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-primary)' }}>
            <Phone size={13} style={{ color: 'var(--primary)' }} />
            {driver.phone}
          </div>
          {driver.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              <Mail size={13} />
              {driver.email}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Verification',
      accessor: (driver) => <StatusBadge status={driver.accountStatus} />,
    },
    {
      header: 'Rating & Performance',
      accessor: (driver) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600, color: '#f59e0b' }}>
            <Star size={15} fill="#f59e0b" />
            {driver.avgRating ? driver.avgRating.toFixed(1) : '5.0'}
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            ({driver.completedTripsCount || 0} trips)
          </span>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Actions',
      accessor: (driver) => (
        <button
          onClick={() => setDriverToUnlink(driver)}
          style={{
            padding: '0.4rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            background: 'rgba(239, 68, 68, 0.08)',
            color: '#ef4444',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.8rem',
            fontWeight: 500,
            transition: 'all 0.2s ease',
          }}
          title="Unlink driver from fleet"
        >
          <Trash2 size={13} />
          Unlink
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
            {isRTL ? 'ڈرائیور روسٹر' : 'Driver Roster'}
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            {isRTL
              ? 'اپنے بیڑے کے تمام مصدقہ ڈرائیوروں کا انتظام کریں اور نئے ڈرائیور شامل کریں۔'
              : 'Manage employed drivers, track ratings and link verified drivers to your fleet (FR-FO-7).'}
          </p>
        </div>

        <button
          onClick={() => {
            setIsLinkModalOpen(true);
            setError(null);
            setSuccessMsg(null);
          }}
          style={{
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
          }}
        >
          <UserPlus size={18} />
          {isRTL ? 'ڈرائیور لنک کریں' : 'Link New Driver'}
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '8px',
            color: '#16a34a',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
          }}
        >
          <CheckCircle2 size={18} />
          {successMsg}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
          }}
        >
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        <StatsCard
          title={isRTL ? 'کل ڈرائیورز' : 'Total Fleet Drivers'}
          value={totalDrivers}
          icon={<Users size={22} />}
          description={isRTL ? 'بیڑے میں رجسٹرڈ' : 'Employed in roster'}
        />
        <StatsCard
          title={isRTL ? 'مصدقہ ڈرائیورز' : 'Verified Status'}
          value={`${verifiedDrivers} / ${totalDrivers}`}
          icon={<ShieldCheck size={22} />}
          description={isRTL ? 'کامیاب تصدیق شدہ' : 'Eligible for dispatch (BR-13)'}
        />
        <StatsCard
          title={isRTL ? 'اوسط درجہ بندی' : 'Average Rating'}
          value={`${avgFleetRating} ★`}
          icon={<Star size={22} />}
          description={isRTL ? 'تمام ڈرائیوروں کا اوسط' : 'Fleet quality score'}
        />
        <StatsCard
          title={isRTL ? 'مکمل ٹرپس' : 'Completed Trips'}
          value={totalTrips}
          icon={<Truck size={22} />}
          description={isRTL ? 'کامیاب ترسیلات' : 'Lifetime fleet deliveries'}
        />
      </div>

      {/* Drivers Data Table */}
      <DataTable
        title={isRTL ? 'ڈرائیور فہرست' : 'Employed Driver Directory'}
        data={drivers}
        columns={columns}
        keyExtractor={(d) => d.id}
        loading={loading}
        searchable={true}
        searchPlaceholder={isRTL ? 'نام یا فون نمبر سے تلاش کریں...' : 'Search driver by name or phone...'}
        emptyMessage={isRTL ? 'کوئی ڈرائیور نہیں ملا۔' : 'No drivers linked to your fleet yet. Click "Link New Driver" to add drivers.'}
      />

      {/* Link Driver Modal */}
      <Modal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        title={isRTL ? 'بیڑے میں ڈرائیور شامل کریں' : 'Link Driver to Fleet'}
      >
        <form onSubmit={handleLinkDriver} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-card-hover)', padding: '4px', borderRadius: '8px' }}>
            <button
              type="button"
              onClick={() => setLinkMode('SELECT')}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '6px',
                border: 'none',
                background: linkMode === 'SELECT' ? 'var(--primary)' : 'transparent',
                color: linkMode === 'SELECT' ? 'white' : 'var(--text-muted)',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {isRTL ? 'موجودہ مصدقہ ڈرائیور منتخب کریں' : 'Pick Verified Driver'}
            </button>
            <button
              type="button"
              onClick={() => setLinkMode('PHONE')}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '6px',
                border: 'none',
                background: linkMode === 'PHONE' ? 'var(--primary)' : 'transparent',
                color: linkMode === 'PHONE' ? 'white' : 'var(--text-muted)',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {isRTL ? 'فون نمبر سے تلاش کریں' : 'Enter Phone Number'}
            </button>
          </div>

          {linkMode === 'SELECT' ? (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                {isRTL ? 'دستیاب غیر منسلک ڈرائیورز' : 'Available Unlinked Drivers'}
              </label>
              {availableDrivers.length > 0 ? (
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                  }}
                  required
                >
                  <option value="">-- Choose a verified driver --</option>
                  {availableDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.phone}) • {d.avgRating?.toFixed(1) || '5.0'}★ • {d.completedTripsCount || 0} trips
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ padding: '1rem', background: 'var(--bg-card-hover)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  No unlinked verified drivers currently listed. Switch to &quot;Enter Phone Number&quot; to link by direct phone number.
                </div>
              )}
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                {isRTL ? 'ڈرائیور کا فون نمبر' : 'Driver Mobile Phone Number'}
              </label>
              <input
                type="text"
                placeholder="e.g. 03001234567"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-main)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                }}
                required
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.35rem 0 0 0' }}>
                Driver must be registered with the Driver role on SmartHaul.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setIsLinkModalOpen(false)}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '6px',
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                fontWeight: 600,
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                opacity: actionLoading ? 0.7 : 1,
              }}
            >
              {actionLoading ? 'Linking...' : 'Confirm Link'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Unlink Confirmation Modal */}
      <Modal
        isOpen={!!driverToUnlink}
        onClose={() => setDriverToUnlink(null)}
        title={isRTL ? 'ڈرائیور کو غیر منسلک کریں' : 'Confirm Driver Unlink'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
            Are you sure you want to remove <strong>{driverToUnlink?.name}</strong> from your fleet?
          </p>
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '6px',
              fontSize: '0.85rem',
              color: '#ef4444',
            }}
          >
            Note: The driver cannot be unlinked if currently actively carrying an assigned shipment in transit.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setDriverToUnlink(null)}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUnlinkDriver}
              disabled={actionLoading}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '6px',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                fontWeight: 600,
                cursor: actionLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {actionLoading ? 'Unlinking...' : 'Confirm Unlink'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
