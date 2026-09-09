'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '../../services/api';
import { StatsCard } from '../../components/ui/StatsCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import {
  Users,
  FileCheck,
  AlertTriangle,
  Truck,
  CheckCircle,
  Package,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [exceptionalShipments, setExceptionalShipments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [platformStats, exceptions] = await Promise.all([
        api.get<any>('/analytics/platform-summary'),
        api.get<any[]>('/admin/shipments/exceptional'),
      ]);
      setStats(platformStats);
      setExceptionalShipments(exceptions || []);
    } catch (err) {
      console.error('Error fetching admin dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const totalUsers =
    stats && stats.users
      ? (stats.users.cargoOwners || 0) + (stats.users.drivers || 0) + (stats.users.fleetOwners || 0)
      : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Administrator Control Room
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Platform monitoring, document verification, dispute arbitration, and audit oversight (UI-21)
        </p>
      </div>

      {/* KPI Cards Grid (UI-21, FR-AD-17) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        <StatsCard
          title="Pending Verifications"
          value={stats?.users?.pendingVerifications ?? 0}
          subtitle="Awaiting document review"
          icon={FileCheck}
          color="amber"
          href="/admin/verifications"
        />
        <StatsCard
          title="Open Complaints"
          value={stats?.complaints?.open ?? 0}
          subtitle="Requires admin arbitration"
          icon={AlertTriangle}
          color="rose"
          href="/admin/complaints"
        />
        <StatsCard
          title="Active Trips"
          value={stats?.shipments?.activeTrips ?? 0}
          subtitle="Vehicles currently in transit"
          icon={Truck}
          color="cyan"
          href="/admin/shipments"
        />
        <StatsCard
          title="Completed Deliveries"
          value={stats?.shipments?.completedDeliveries ?? 0}
          subtitle="Successful freight journeys"
          icon={CheckCircle}
          color="emerald"
          href="/admin/shipments"
        />
        <StatsCard
          title="Registered Users"
          value={totalUsers}
          subtitle={`${stats?.users?.drivers ?? 0} drivers, ${stats?.users?.cargoOwners ?? 0} shippers`}
          icon={Users}
          color="purple"
          href="/admin/users"
        />
      </div>

      {/* Exceptional Shipments Attention Section (FR-AD-12) */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
              Exceptional Shipments Attention Queue (FR-AD-12)
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '2px' }}>
              Surfacing delayed deliveries, unassigned bookings, and shipments with open disputes
            </p>
          </div>
          <Link href="/admin/shipments" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
            <span>View All Shipments</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {exceptionalShipments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
            <ShieldCheck size={36} style={{ color: 'var(--accent-emerald)', margin: '0 auto 8px auto' }} />
            <p style={{ fontSize: '0.875rem' }}>All active shipments are operating normally within SLA.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {exceptionalShipments.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '0.9rem' }}>{s.shipmentNumber}</strong>
                    <StatusBadge status={s.status} size="sm" />
                    {s.complaints && s.complaints.length > 0 && (
                      <span className="badge" style={{ backgroundColor: 'var(--accent-rose-bg)', color: 'var(--accent-rose)' }}>
                        Dispute Active
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {s.pickupAddress} → {s.dropoffAddress} • {s.cargoWeight}t ({s.requiredVehicleType})
                  </p>
                </div>

                <Link href={`/admin/complaints`} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                  Investigate
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
