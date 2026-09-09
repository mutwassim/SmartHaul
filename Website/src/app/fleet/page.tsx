'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '../../services/api';
import { StatsCard } from '../../components/ui/StatsCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import {
  Truck,
  ClipboardCheck,
  Navigation,
  DollarSign,
  TrendingUp,
  ArrowRight,
  PlusCircle,
} from 'lucide-react';

export default function FleetDashboardPage() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [liveMap, setLiveMap] = useState<any[]>([]);
  const [utilization, setUtilization] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchFleetData();
  }, []);

  const fetchFleetData = async () => {
    try {
      const [vData, lmData, utData] = await Promise.all([
        api.get<any[]>('/fleet/vehicles'),
        api.get<any[]>('/fleet/live-map'),
        api.get<any[]>('/fleet/reports/vehicle-utilization'),
      ]);
      setVehicles(vData || []);
      setLiveMap(lmData || []);
      setUtilization(utData || []);
    } catch (err) {
      console.error('Error fetching fleet dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const totalVehicles = vehicles.length;
  const assignedVehicles = vehicles.filter((v) => v.availabilityStatus === 'ASSIGNED').length;
  const activeDeliveries = liveMap.length;

  const avgUtilization =
    utilization.length > 0
      ? Math.round(utilization.reduce((acc, u) => acc + (u.emptyRunningPercentage || 0), 0) / utilization.length)
      : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Fleet Operations Dashboard (UI-20)
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Multi-vehicle dispatch monitoring, resource allocation, and utilization analytics
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <Link href="/fleet/vehicles" className="btn btn-primary" style={{ padding: '10px 18px', gap: '8px' }}>
            <PlusCircle size={16} />
            <span>Add Vehicle</span>
          </Link>
          <Link href="/fleet/bids" className="btn btn-secondary" style={{ padding: '10px 18px', gap: '8px' }}>
            <TrendingUp size={16} />
            <span>Find Loads</span>
          </Link>
        </div>
      </div>

      {/* 5 Headline Figures (UI-20) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <StatsCard
          title="Total Vehicles"
          value={totalVehicles}
          subtitle="Registered fleet trucks"
          icon={Truck}
          color="blue"
          href="/fleet/vehicles"
        />
        <StatsCard
          title="Currently Assigned"
          value={assignedVehicles}
          subtitle="Committed to shipments"
          icon={ClipboardCheck}
          color="purple"
          href="/fleet/assignments"
        />
        <StatsCard
          title="Active In-Transit"
          value={activeDeliveries}
          subtitle="Real-time live tracked"
          icon={Navigation}
          color="cyan"
          href="/fleet/live-map"
        />
        <StatsCard
          title="Average Utilization"
          value={`${100 - avgUtilization}%`}
          subtitle="Loaded distance efficiency"
          icon={TrendingUp}
          color="emerald"
          href="/fleet/reports"
        />
        <StatsCard
          title="Recorded Receivables"
          value="PKR 0"
          subtitle="Settlement records to date"
          icon={DollarSign}
          color="amber"
          href="/fleet/payments"
        />
      </div>

      {/* Active Fleet Trips Monitoring Grid (FR-FO-15) */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Active Fleet Dispatches (FR-FO-15)</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '2px' }}>
              Real-time monitoring across all assigned fleet vehicles
            </p>
          </div>
          <Link href="/fleet/live-map" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
            <span>Full Fleet Map</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {liveMap.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '28px 0' }}>
            No vehicles currently in active transit.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {liveMap.map((t) => (
              <div
                key={t.tripId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '0.9rem' }}>{t.shipment.shipmentNumber}</strong>
                    <StatusBadge status={t.shipment.status} size="sm" />
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Driver: <strong>{t.driver.name}</strong> • Vehicle: <strong>{t.vehicle.model}</strong> ({t.vehicle.type})
                  </p>
                </div>

                <Link href="/fleet/live-map" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                  Track Live
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
