'use client';

import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/services/api';
import StatsCard from '@/components/ui/StatsCard';
import DataTable, { Column } from '@/components/ui/DataTable';
import {
  Megaphone,
  Send,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  Radio,
  FileText,
} from 'lucide-react';

interface AnnouncementLog {
  id: string;
  adminId: string;
  admin?: {
    name: string;
    email: string;
  };
  action: string;
  targetType: string;
  newState?: {
    title?: string;
    targetRole?: string;
    recipientCount?: number;
  };
  reason?: string;
  timestamp: string;
}

export default function AdminAnnouncementsPage() {
  const { t, isRTL } = useLanguage();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetRole, setTargetRole] = useState<'ALL' | 'CARGO_OWNER' | 'DRIVER' | 'FLEET_OWNER'>('ALL');

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [pastAnnouncements, setPastAnnouncements] = useState<AnnouncementLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const auditRes = await api.get<AnnouncementLog[]>('/admin/audit-logs');
      // Filter for announcement broadcasts
      const announcements = (auditRes || []).filter((l) => l.action === 'BROADCAST_ANNOUNCEMENT');
      setPastAnnouncements(announcements);
    } catch (err) {
      console.error('Failed to fetch announcements history', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setSuccessMsg(null);

      const res = await api.post<{ recipientCount: number }>('/admin/announcements', {
        title,
        message,
        targetRole,
      });

      setSuccessMsg(`Announcement successfully broadcasted to ${res.recipientCount || 'all target'} users (FR-AD-20)!`);
      setTitle('');
      setMessage('');
      await fetchHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to broadcast announcement');
    } finally {
      setLoading(false);
    }
  };

  const columns: Column<AnnouncementLog>[] = [
    {
      header: 'Announcement Title',
      accessor: (log) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {log.newState?.title || 'System Notification'}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {log.reason || 'Platform announcement'}
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Target Audience',
      accessor: (log) => {
        const role = log.newState?.targetRole || 'ALL';
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              background: 'rgba(37, 99, 235, 0.1)',
              color: 'var(--primary)',
              fontWeight: 600,
              fontSize: '0.8rem',
            }}
          >
            {role === 'ALL' ? 'All Roles' : role}
          </span>
        );
      },
    },
    {
      header: 'Delivered Recipients',
      accessor: (log) => (
        <span style={{ fontWeight: 600, color: '#16a34a' }}>
          {log.newState?.recipientCount || 0} users
        </span>
      ),
    },
    {
      header: 'Broadcasted By',
      accessor: (log) => (
        <div style={{ fontSize: '0.85rem' }}>
          <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{log.admin?.name || 'Administrator'}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{log.admin?.email}</div>
        </div>
      ),
    },
    {
      header: 'Timestamp',
      accessor: (log) => (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {new Date(log.timestamp).toLocaleString()}
        </div>
      ),
      sortable: true,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          {isRTL ? 'پلیٹ فارم اعلانات اور نشریات' : 'Platform Announcements & Broadcast Engine'}
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
          {isRTL
            ? 'پلیٹ فارم کے تمام صارفین یا مخصوص کرداروں کو فوری اعلانات اور نوٹیفیکیشنز ارسال کریں (FR-AD-20)'
            : 'Broadcast system-wide notices or role-targeted announcements via push & in-app inbox (FR-AD-20).'}
        </p>
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

      {/* Broadcast Composer Form */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <Megaphone size={20} style={{ color: 'var(--primary)' }} />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
            {isRTL ? 'نیا اعلان تیار کریں' : 'Compose Platform Announcement'}
          </h2>
        </div>

        <form onSubmit={handleBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                {isRTL ? 'اعلان کا عنوان' : 'Announcement Title'}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. System Maintenance Notice or Highway Advisory"
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
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                {isRTL ? 'مطلوبہ سامعین / کردار' : 'Target Role / Audience'}
              </label>
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-main)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                }}
              >
                <option value="ALL">All Platform Users (All Roles)</option>
                <option value="CARGO_OWNER">Cargo Owners Only</option>
                <option value="DRIVER">Drivers Only</option>
                <option value="FLEET_OWNER">Fleet Owners Only</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              {isRTL ? 'اعلان کا پیغام / تفصیل' : 'Announcement Message Body'}
            </label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write the full announcement message here. This will be delivered to mobile notification tray and web inbox..."
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-main)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                resize: 'vertical',
              }}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.7rem 1.5rem',
                borderRadius: '8px',
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              }}
            >
              <Send size={16} />
              {loading ? 'Broadcasting...' : 'Broadcast Announcement (FR-AD-20)'}
            </button>
          </div>
        </form>
      </div>

      {/* Broadcast Audit History */}
      <DataTable
        title={isRTL ? 'ماضی کے اعلانات کا ریکارڈ' : 'Broadcast Announcement History'}
        data={pastAnnouncements}
        columns={columns}
        keyExtractor={(l) => l.id}
        loading={historyLoading}
        searchable={true}
        searchPlaceholder="Search past announcements..."
        emptyMessage="No broadcast announcements recorded in audit history."
      />
    </div>
  );
}
