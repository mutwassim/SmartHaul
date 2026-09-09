'use client';

import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/services/api';
import StatsCard from '@/components/ui/StatsCard';
import DataTable, { Column } from '@/components/ui/DataTable';
import {
  BarChart3,
  TrendingUp,
  Truck,
  Users,
  Star,
  ShieldAlert,
  Download,
  Percent,
  CheckCircle2,
} from 'lucide-react';

interface VehicleUtilization {
  vehicleId: string;
  model: string;
  vehicleType: string;
  completedTripsCount: number;
  loadedDistanceKm: number;
  estimatedTotalDistanceKm: number;
  emptyRunningPercentage: number;
}

interface DriverPerformance {
  driverId: string;
  name: string;
  completedTrips: number;
  avgRating: number;
  totalRatings: number;
  complaintsCount: number;
}

export default function FleetReportsPage() {
  const { t, isRTL } = useLanguage();
  const [utilizationData, setUtilizationData] = useState<VehicleUtilization[]>([]);
  const [driverData, setDriverData] = useState<DriverPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'VEHICLES' | 'DRIVERS'>('VEHICLES');

  useEffect(() => {
    async function loadReports() {
      try {
        setLoading(true);
        const [utilRes, driverRes] = await Promise.all([
          api.get<VehicleUtilization[]>('/fleet/reports/vehicle-utilization').catch(() => []),
          api.get<DriverPerformance[]>('/fleet/reports/driver-performance').catch(() => []),
        ]);
        setUtilizationData(utilRes || []);
        setDriverData(driverRes || []);
      } catch (err) {
        console.error('Failed to load fleet reports', err);
      } finally {
        setLoading(false);
      }
    }
    loadReports();
  }, []);

  // Aggregated KPIs
  const totalLoadedKm = utilizationData.reduce((acc, v) => acc + v.loadedDistanceKm, 0);
  const totalEstimatedKm = utilizationData.reduce((acc, v) => acc + v.estimatedTotalDistanceKm, 0);
  const avgEmptyRunning =
    totalEstimatedKm > 0 ? Math.round(((totalEstimatedKm - totalLoadedKm) / totalEstimatedKm) * 100) : 0;
  const topDriver = driverData.length > 0 ? [...driverData].sort((a, b) => b.avgRating - a.avgRating)[0] : null;

  const vehicleColumns: Column<VehicleUtilization>[] = [
    {
      header: 'Vehicle Model & Type',
      accessor: (v) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v.model}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{v.vehicleType}</div>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Completed Deliveries',
      accessor: (v) => <span style={{ fontWeight: 600 }}>{v.completedTripsCount} trips</span>,
      sortable: true,
    },
    {
      header: 'Loaded Distance (Revenue)',
      accessor: (v) => (
        <span style={{ fontWeight: 600, color: '#16a34a' }}>
          {v.loadedDistanceKm.toLocaleString()} km
        </span>
      ),
      sortable: true,
    },
    {
      header: 'Empty Running (Deadheading)',
      accessor: (v) => {
        const emptyKm = Math.max(0, v.estimatedTotalDistanceKm - v.loadedDistanceKm);
        const pct = v.emptyRunningPercentage;
        const color = pct <= 25 ? '#16a34a' : pct <= 35 ? '#f59e0b' : '#ef4444';

        return (
          <div style={{ minWidth: '160px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>{emptyKm.toLocaleString()} km</span>
              <span style={{ fontWeight: 700, color }}>{pct}%</span>
            </div>
            <div
              style={{
                width: '100%',
                height: '6px',
                background: 'var(--border-color)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, pct)}%`,
                  height: '100%',
                  background: color,
                  borderRadius: '3px',
                }}
              />
            </div>
          </div>
        );
      },
      sortable: true,
    },
  ];

  const driverColumns: Column<DriverPerformance>[] = [
    {
      header: 'Driver Name',
      accessor: (d) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
              color: 'white',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {d.name.charAt(0)}
          </div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</div>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Completed Deliveries',
      accessor: (d) => <span style={{ fontWeight: 600 }}>{d.completedTrips} trips</span>,
      sortable: true,
    },
    {
      header: 'Rating Score',
      accessor: (d) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, color: '#f59e0b' }}>
          <Star size={15} fill="#f59e0b" />
          <span>{d.avgRating?.toFixed(1) || '5.0'}</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({d.totalRatings} ratings)</span>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Disputes / Complaints',
      accessor: (d) => (
        <span
          style={{
            fontWeight: 600,
            color: d.complaintsCount > 0 ? '#ef4444' : '#16a34a',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}
        >
          {d.complaintsCount > 0 ? <ShieldAlert size={14} /> : <CheckCircle2 size={14} />}
          {d.complaintsCount} recorded
        </span>
      ),
      sortable: true,
    },
  ];

  const handleExportCSV = () => {
    let csv = '';
    if (activeTab === 'VEHICLES') {
      csv = 'Model,Type,Completed Trips,Loaded Distance (KM),Estimated Total (KM),Empty Running %\n';
      utilizationData.forEach((v) => {
        csv += `"${v.model}","${v.vehicleType}",${v.completedTripsCount},${v.loadedDistanceKm},${v.estimatedTotalDistanceKm},${v.emptyRunningPercentage}%\n`;
      });
    } else {
      csv = 'Driver Name,Completed Trips,Average Rating,Total Reviews,Complaints Count\n';
      driverData.forEach((d) => {
        csv += `"${d.name}",${d.completedTrips},${d.avgRating},${d.totalRatings},${d.complaintsCount}\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smarthaul_fleet_${activeTab.toLowerCase()}_report.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            {isRTL ? 'بیڑے کی کارکردگی اور خالی مائلیج رپورٹس' : 'Fleet Performance & Utilization Reports'}
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            {isRTL
              ? 'گاڑیوں کی خالی چلنے کی شرح اور ڈرائیوروں کی کارکردگی کا تفصیلی جائزہ (FR-FO-17, FR-AN-7)'
              : 'Deadheading distance analysis, fleet efficiency metrics, and driver scorecards (FR-FO-17, FR-AN-7).'}
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          style={{
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Download size={16} />
          {isRTL ? 'رپورٹ برآمد کریں (CSV)' : 'Export CSV Report'}
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
          title={isRTL ? 'کل آمدنی مائلیج' : 'Revenue Loaded Distance'}
          value={`${totalLoadedKm.toLocaleString()} km`}
          icon={<Truck size={22} />}
          description={isRTL ? 'مال برداری کا کل فاصلہ' : 'Cargo in transit distance'}
        />
        <StatsCard
          title={isRTL ? 'اوسط خالی چلنے کی شرح' : 'Avg Empty Running Ratio'}
          value={`${avgEmptyRunning}%`}
          icon={<Percent size={22} />}
          description={isRTL ? 'واپسی پر خالی مائلیج' : 'Target: < 25% (FR-FO-19)'}
        />
        <StatsCard
          title={isRTL ? 'نمایاں ڈرائیور' : 'Top Performing Driver'}
          value={topDriver ? topDriver.name : 'N/A'}
          icon={<Star size={22} />}
          description={topDriver ? `${topDriver.avgRating?.toFixed(1)} ★ (${topDriver.completedTrips} trips)` : 'No data'}
        />
        <StatsCard
          title={isRTL ? 'ٹریک کردہ گاڑیاں' : 'Monitored Fleet Assets'}
          value={utilizationData.length}
          icon={<BarChart3 size={22} />}
          description={isRTL ? 'رپورٹ میں شامل گاڑیاں' : 'Active vehicles in report'}
        />
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          background: 'var(--bg-card)',
          padding: '6px',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
          width: 'fit-content',
        }}
      >
        <button
          onClick={() => setActiveTab('VEHICLES')}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'VEHICLES' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'VEHICLES' ? 'white' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'all 0.2s ease',
          }}
        >
          <Truck size={15} />
          {isRTL ? 'گاڑیوں کا استعمال اور خالی مائلیج' : 'Vehicle Utilization (Deadheading)'}
        </button>
        <button
          onClick={() => setActiveTab('DRIVERS')}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'DRIVERS' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'DRIVERS' ? 'white' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'all 0.2s ease',
          }}
        >
          <Users size={15} />
          {isRTL ? 'ڈرائیور کارکردگی اسکور کارڈز' : 'Driver Performance Scorecards'}
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'VEHICLES' ? (
        <DataTable
          title={isRTL ? 'گاڑیوں کی تفصیلی مائلیج رپورٹ' : 'Vehicle Utilization Breakdown'}
          data={utilizationData}
          columns={vehicleColumns}
          keyExtractor={(v) => v.vehicleId}
          loading={loading}
          searchable={true}
          searchPlaceholder="Search vehicle model or type..."
          emptyMessage="No vehicle trip history available yet."
        />
      ) : (
        <DataTable
          title={isRTL ? 'ڈرائیور اسکور کارڈز' : 'Driver Quality & Trip Metrics'}
          data={driverData}
          columns={driverColumns}
          keyExtractor={(d) => d.driverId}
          loading={loading}
          searchable={true}
          searchPlaceholder="Search driver name..."
          emptyMessage="No driver performance data recorded yet."
        />
      )}
    </div>
  );
}
