'use client';

import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/services/api';
import { PaymentRecord, PaymentStatus } from '@/types';
import StatusBadge from '@/components/ui/StatusBadge';
import StatsCard from '@/components/ui/StatsCard';
import DataTable, { Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import {
  DollarSign,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Clock,
  ArrowUpRight,
  Filter,
  Lock,
  Edit3,
  FileText,
} from 'lucide-react';

export default function FleetPaymentsPage() {
  const { t, isRTL } = useLanguage();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Status Filter Tab
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Update Payment Status Modal
  const [activePayment, setActivePayment] = useState<PaymentRecord | null>(null);
  const [newStatus, setNewStatus] = useState<PaymentStatus>('PAID');
  const [newAmountReceived, setNewAmountReceived] = useState<number>(0);

  // Raise Dispute / Freeze Modal
  const [disputePayment, setDisputePayment] = useState<PaymentRecord | null>(null);
  const [disputeReason, setDisputeReason] = useState<string>('');

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<PaymentRecord[]>('/payments');
      setPayments(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load payment records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePayment) return;
    try {
      setActionLoading(true);
      setError(null);
      setSuccessMsg(null);

      await api.post(`/payments/${activePayment.id}/status`, {
        status: newStatus,
        amountReceived: Number(newAmountReceived),
      });

      setSuccessMsg(`Payment record for shipment ${activePayment.shipment?.shipmentNumber || activePayment.id} updated!`);
      setActivePayment(null);
      await fetchPayments();
    } catch (err: any) {
      setError(err.message || 'Failed to update payment status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRaiseDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputePayment) return;
    try {
      setActionLoading(true);
      setError(null);
      setSuccessMsg(null);

      await api.post(`/payments/${disputePayment.id}/dispute`, {
        reason: disputeReason,
      });

      setSuccessMsg(`Payment frozen and dispute raised with SmartHaul Administration (BR-26).`);
      setDisputePayment(null);
      setDisputeReason('');
      await fetchPayments();
    } catch (err: any) {
      setError(err.message || 'Failed to raise payment dispute');
    } finally {
      setActionLoading(false);
    }
  };

  // KPIs
  const totalAgreed = payments.reduce((acc, p) => acc + (p.agreedFare || 0), 0);
  const totalReceived = payments.reduce((acc, p) => acc + (p.amountReceived || 0), 0);
  const totalOutstanding = Math.max(0, totalAgreed - totalReceived);
  const frozenCount = payments.filter((p) => p.isFrozen).length;

  // Filtered List
  const filteredPayments = payments.filter((p) => {
    if (selectedStatus === 'ALL') return true;
    if (selectedStatus === 'FROZEN') return p.isFrozen;
    return p.status === selectedStatus;
  });

  const columns: Column<PaymentRecord>[] = [
    {
      header: 'Shipment #',
      accessor: (p) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--primary)' }}>
            {p.shipment?.shipmentNumber || p.shipmentId.slice(0, 8)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {p.shipment?.cargoType || 'Heavy Freight'}
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Agreed Fare (PKR)',
      accessor: (p) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          Rs. {p.agreedFare?.toLocaleString() || 0}
        </span>
      ),
      sortable: true,
    },
    {
      header: 'Amount Received',
      accessor: (p) => (
        <span style={{ fontWeight: 600, color: p.amountReceived >= p.agreedFare ? '#16a34a' : '#f59e0b' }}>
          Rs. {p.amountReceived?.toLocaleString() || 0}
        </span>
      ),
      sortable: true,
    },
    {
      header: 'Remaining Balance',
      accessor: (p) => {
        const remaining = Math.max(0, (p.agreedFare || 0) - (p.amountReceived || 0));
        return (
          <span style={{ fontWeight: 500, color: remaining > 0 ? '#ef4444' : 'var(--text-muted)' }}>
            Rs. {remaining.toLocaleString()}
          </span>
        );
      },
    },
    {
      header: 'Ledger Status',
      accessor: (p) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <StatusBadge status={p.status} />
          {p.isFrozen && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#ef4444',
                background: 'rgba(239, 68, 68, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              <Lock size={11} />
              Frozen
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Actions',
      accessor: (p) => (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => {
              setActivePayment(p);
              setNewStatus(p.status);
              setNewAmountReceived(p.amountReceived || 0);
            }}
            disabled={p.isFrozen}
            style={{
              padding: '0.35rem 0.65rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              cursor: p.isFrozen ? 'not-allowed' : 'pointer',
              opacity: p.isFrozen ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.8rem',
            }}
          >
            <Edit3 size={13} />
            Update
          </button>

          {!p.isFrozen && p.status !== 'PAID' && (
            <button
              onClick={() => {
                setDisputePayment(p);
                setDisputeReason('');
              }}
              style={{
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                background: 'rgba(239, 68, 68, 0.08)',
                color: '#ef4444',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.8rem',
                fontWeight: 500,
              }}
            >
              <ShieldAlert size={13} />
              Dispute
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          {isRTL ? 'وصولیات اور ادائیگی لیجر' : 'Receivables & Payment Ledger'}
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
          {isRTL
            ? 'آف لائن ادائیگیوں، جزوی وصولیوں اور متنازعہ واجبات کا مکمل حساب کتاب (CON-8, FR-PM-6)'
            : 'Non-custodial offline payment tracking, partial settlement recording, and dispute arbitration (CON-8, FR-PM-6).'}
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

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        <StatsCard
          title={isRTL ? 'کل متفقہ کرایہ' : 'Total Receivables'}
          value={`Rs. ${totalAgreed.toLocaleString()}`}
          icon={<DollarSign size={22} />}
          description={isRTL ? 'تمام بکنگز کا کل کرایہ' : 'Agreed trip revenue'}
        />
        <StatsCard
          title={isRTL ? 'وصول شدہ رقم' : 'Amount Collected'}
          value={`Rs. ${totalReceived.toLocaleString()}`}
          icon={<CheckCircle2 size={22} />}
          description={isRTL ? 'موصولہ نقد / بینک ٹرانسفر' : 'Settled offline'}
        />
        <StatsCard
          title={isRTL ? 'بقیہ واجبات' : 'Outstanding Balance'}
          value={`Rs. ${totalOutstanding.toLocaleString()}`}
          icon={<Clock size={22} />}
          description={isRTL ? 'زیر التواء رقم' : 'Pending settlement'}
        />
        <StatsCard
          title={isRTL ? 'منجمد / متنازعہ' : 'Disputed / Frozen'}
          value={frozenCount}
          icon={<ShieldAlert size={22} />}
          description={isRTL ? 'انتظامیہ کے زیر جائزہ' : 'Frozen under review (BR-26)'}
        />
      </div>

      {/* Filter Tabs */}
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
        {[
          { id: 'ALL', label: 'All Records' },
          { id: 'PENDING', label: 'Pending' },
          { id: 'PARTIAL', label: 'Partial' },
          { id: 'PAID', label: 'Settled / Paid' },
          { id: 'FROZEN', label: 'Frozen / Disputed' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedStatus(tab.id)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: 'none',
              background: selectedStatus === tab.id ? 'var(--primary)' : 'transparent',
              color: selectedStatus === tab.id ? 'white' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Payment Records Table */}
      <DataTable
        title={isRTL ? 'ادائیگیوں کا لیجر' : 'Trip Payment Ledgers'}
        data={filteredPayments}
        columns={columns}
        keyExtractor={(p) => p.id}
        loading={loading}
        searchable={true}
        searchPlaceholder={isRTL ? 'شپمنٹ نمبر سے تلاش کریں...' : 'Search by shipment # or cargo...'}
        emptyMessage="No payment records found matching the criteria."
      />

      {/* Update Settlement Modal */}
      <Modal
        isOpen={!!activePayment}
        onClose={() => setActivePayment(null)}
        title={isRTL ? 'ادائیگی کی صورتحال تبدیل کریں' : 'Update Settlement Record'}
      >
        <form onSubmit={handleUpdatePayment} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div
            style={{
              padding: '0.85rem',
              background: 'var(--bg-card-hover)',
              borderRadius: '8px',
              fontSize: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
            }}
          >
            <div><strong>Shipment:</strong> {activePayment?.shipment?.shipmentNumber}</div>
            <div><strong>Agreed Total Fare:</strong> Rs. {activePayment?.agreedFare.toLocaleString()}</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Settlement Status
            </label>
            <select
              value={newStatus}
              onChange={(e) => {
                const s = e.target.value as PaymentStatus;
                setNewStatus(s);
                if (s === 'PAID' && activePayment) {
                  setNewAmountReceived(activePayment.agreedFare);
                }
              }}
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
              <option value="PENDING">PENDING - No payment received yet</option>
              <option value="PARTIAL">PARTIAL - Partial advance / token received</option>
              <option value="PAID">PAID - Fully settled offline</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Amount Collected to Date (PKR)
            </label>
            <input
              type="number"
              min="0"
              max={activePayment?.agreedFare}
              value={newAmountReceived}
              onChange={(e) => setNewAmountReceived(Number(e.target.value))}
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setActivePayment(null)}
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
              }}
            >
              {actionLoading ? 'Saving...' : 'Save Settlement'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Raise Dispute Modal */}
      <Modal
        isOpen={!!disputePayment}
        onClose={() => setDisputePayment(null)}
        title={isRTL ? 'ادائیگی منجمد کریں اور شکایت درج کریں' : 'Freeze Payment & Raise Dispute'}
      >
        <form onSubmit={handleRaiseDispute} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div
            style={{
              padding: '0.85rem',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              fontSize: '0.85rem',
              color: '#ef4444',
            }}
          >
            <strong>Warning (BR-26):</strong> Submitting this dispute will immediately freeze this payment ledger record.
            The SmartHaul Dispute Arbitration board will be notified for resolution.
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Reason for Non-Payment / Dispute Details
            </label>
            <textarea
              rows={4}
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="e.g. Cargo Owner refusing to pay final agreed balance after delivery completion..."
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setDisputePayment(null)}
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
                background: '#ef4444',
                color: 'white',
                border: 'none',
                fontWeight: 600,
                cursor: actionLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {actionLoading ? 'Submitting...' : 'Freeze & Submit Dispute'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
