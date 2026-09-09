'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { StatsCard } from '../../../components/ui/StatsCard';
import { BarChart3, Download, TrendingDown, Route, FileCheck, ArrowUpRight } from 'lucide-react';

export default function AnalyticsPage() {
  const [throughput, setThroughput] = useState<any>(null);
  const [routeDemand, setRouteDemand] = useState<any[]>([]);
  const [emptyRunning, setEmptyRunning] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  const fetchAnalyticsData = async () => {
    try {
      const [tp, rd, er] = await Promise.all([
        api.get<any>('/analytics/verifications'),
        api.get<any[]>('/analytics/route-demand'),
        api.get<any>('/analytics/empty-running'),
      ]);
      setThroughput(tp);
      setRouteDemand(rd || []);
      setEmptyRunning(er);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      window.open('http://localhost:5000/api/v1/analytics/export?reportType=shipments', '_blank');
    } catch (err) {
      alert('Failed to trigger export');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Platform Analytics & Reporting (MOD-9, FR-AR-1 to FR-AR-14)
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Verification throughput, corridor demand distribution, and empty running reduction metrics
          </p>
        </div>

        <button
          className="btn btn-primary"
          style={{ gap: '8px', padding: '10px 18px' }}
          onClick={handleExportCSV}
        >
          <Download size={16} />
          <span>Export CSV Report (FR-AR-13)</span>
        </button>
      </div>

      {/* KPI Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <StatsCard
          title="Empty Running Ratio"
          value={`${emptyRunning?.emptyRunningPercentage ?? 0}%`}
          subtitle={`Total loaded distance: ${emptyRunning?.totalLoadedDistanceKm?.toLocaleString() ?? 0} km`}
          icon={TrendingDown}
          color="emerald"
        />
        <StatsCard
          title="Total Completed Trips"
          value={emptyRunning?.totalCompletedTrips ?? 0}
          subtitle="Intercity freight jobs executed"
          icon={BarChart3}
          color="blue"
        />
        <StatsCard
          title="Verification Backlog"
          value={throughput?.pending ?? 0}
          subtitle={`${throughput?.approved ?? 0} approved to date`}
          icon={FileCheck}
          color="amber"
        />
      </div>

      {/* Top Corridors Demand Ranking (FR-AR-6) */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px' }}>
          Top Freight Corridors Demand Ranking (FR-AR-6)
        </h3>

        {routeDemand.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No route demand recorded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {routeDemand.slice(0, 8).map((route, idx) => (
              <div
                key={idx}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--bg-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    #{idx + 1}
                  </span>
                  <strong style={{ fontSize: '0.9rem' }}>{route.corridor}</strong>
                </div>

                <span className="badge" style={{ backgroundColor: 'var(--primary-glow)', color: 'var(--primary)' }}>
                  {route.shipmentCount} shipments
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
