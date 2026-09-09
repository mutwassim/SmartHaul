'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { AdminAuditLog } from '../../../types';
import { ScrollText, ShieldAlert, Clock, Terminal } from 'lucide-react';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const data = await api.get<AdminAuditLog[]>('/admin/audit-logs');
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<AdminAuditLog>[] = [
    {
      header: 'Action Performed',
      accessor: 'action',
      sortable: true,
      render: (item) => (
        <span
          className="badge"
          style={{
            backgroundColor: 'var(--primary-glow)',
            color: 'var(--primary)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
          }}
        >
          {item.action}
        </span>
      ),
    },
    {
      header: 'Administrator',
      render: (item) => (
        <div>
          <strong>{item.admin?.name || 'Admin'}</strong>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {item.admin?.email}
          </span>
        </div>
      ),
    },
    {
      header: 'Target Record',
      render: (item) => (
        <div style={{ fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>{item.targetType}: </span>
          <code>{item.targetId.substring(0, 12)}...</code>
        </div>
      ),
    },
    {
      header: 'Recorded Reason',
      accessor: 'reason',
      render: (item) => (
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {item.reason || '—'}
        </span>
      ),
    },
    {
      header: 'Timestamp',
      accessor: 'timestamp',
      sortable: true,
      render: (item) => (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {new Date(item.timestamp).toLocaleString()}
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Administrative Audit Log (FR-AD-19, BR-28, SEC-15)
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Append-only, immutable record of every administrator action affecting verifications, accounts, complaints, and payment dispute settlements
        </p>
      </div>

      <DataTable
        columns={columns}
        data={logs}
        keyExtractor={(item) => item.id}
        searchPlaceholder="Search audit log by action or admin..."
        isLoading={isLoading}
        emptyMessage="No administrative audit records logged."
      />
    </div>
  );
}
