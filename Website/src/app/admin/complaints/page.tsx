'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Modal } from '../../../components/ui/Modal';
import { Complaint } from '../../../types';
import { AlertTriangle, CheckCircle, XCircle, Scale, DollarSign, MessageSquare } from 'lucide-react';

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);

  const [adminRemarks, setAdminRemarks] = useState('');
  const [adjustedFare, setAdjustedFare] = useState<number | ''>('');
  const [adjustedPaymentStatus, setAdjustedPaymentStatus] = useState<'PENDING' | 'PARTIAL' | 'PAID'>('PAID');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchComplaints();
  }, []);

  const fetchComplaints = async () => {
    try {
      const data = await api.get<Complaint[]>('/admin/complaints');
      setComplaints(data || []);
    } catch (err) {
      console.error('Error fetching complaints:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenArbitration = (complaint: Complaint) => {
    setSelectedComplaint(complaint);
    setAdminRemarks('');
    setAdjustedFare('');
    setErrorMessage(null);
    setIsResolveModalOpen(true);
  };

  const handleResolve = async (decision: 'RESOLVED' | 'REJECTED') => {
    if (!adminRemarks.trim()) {
      setErrorMessage('Written remarks are mandatory for complaint decision (FR-AD-15).');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      await api.post(`/admin/complaints/${selectedComplaint?.id}/resolve`, {
        decision,
        adminRemarks,
        adjustedFare: adjustedFare !== '' ? Number(adjustedFare) : undefined,
        adjustedPaymentStatus:
          selectedComplaint?.category === 'PAYMENT_DISPUTE' ? adjustedPaymentStatus : undefined,
      });

      setIsResolveModalOpen(false);
      fetchComplaints();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to resolve complaint');
    } finally {
      setIsProcessing(false);
    }
  };

  const columns: Column<Complaint>[] = [
    {
      header: 'Reference',
      accessor: 'referenceCode',
      sortable: true,
      render: (item) => <strong>{item.referenceCode}</strong>,
    },
    {
      header: 'Category',
      accessor: 'category',
      sortable: true,
      render: (item) => (
        <span
          className="badge"
          style={{
            backgroundColor: item.category === 'PAYMENT_DISPUTE' ? 'var(--accent-amber-bg)' : 'var(--accent-rose-bg)',
            color: item.category === 'PAYMENT_DISPUTE' ? 'var(--accent-amber)' : 'var(--accent-rose)',
          }}
        >
          {item.category.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      header: 'Shipment',
      render: (item) => (
        <div>
          <span>{item.shipment?.shipmentNumber}</span>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Status: {item.shipment?.status}
          </span>
        </div>
      ),
    },
    {
      header: 'Submitter',
      render: (item) => (
        <div>
          <strong>{item.submitter?.name}</strong>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {item.submitter?.role}
          </span>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      sortable: true,
      render: (item) => <StatusBadge status={item.status} size="sm" />,
    },
    {
      header: 'Actions',
      render: (item) => (
        <button
          className="btn btn-primary"
          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
          onClick={() => handleOpenArbitration(item)}
        >
          <Scale size={14} />
          <span>Arbitrate Dispute</span>
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Dispute & Complaint Resolution (FR-AD-13, FR-AD-16)
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Examine submitted evidence, unfreeze disputed payment records, adjust fares, and record immutable decisions (BR-23, BR-28)
        </p>
      </div>

      <DataTable
        columns={columns}
        data={complaints}
        keyExtractor={(item) => item.id}
        searchPlaceholder="Search complaints by reference or shipment..."
        isLoading={isLoading}
        emptyMessage="No complaints or payment disputes registered."
      />

      {/* Arbitration Modal (FR-AD-14, FR-AD-15, FR-AD-16) */}
      <Modal
        isOpen={isResolveModalOpen}
        onClose={() => setIsResolveModalOpen(false)}
        title={`Arbitrate Complaint: ${selectedComplaint?.referenceCode || ''}`}
        maxWidth="700px"
      >
        {selectedComplaint && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Dispute Summary Details */}
            <div
              style={{
                backgroundColor: 'var(--bg-primary)',
                padding: '16px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Category: </span>
                <strong>{selectedComplaint.category.replace(/_/g, ' ')}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Submitter: </span>
                <strong>{selectedComplaint.submitter?.name}</strong> ({selectedComplaint.submitter?.role})
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Counterparty: </span>
                <strong>{selectedComplaint.counterparty?.name || 'N/A'}</strong>
              </div>
              <div style={{ marginTop: '8px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Description / Evidence Stated:
                </span>
                <p style={{ backgroundColor: 'var(--bg-secondary)', padding: '10px', borderRadius: 'var(--radius-sm)' }}>
                  {selectedComplaint.description}
                </p>
              </div>
            </div>

            {/* If Payment Dispute, Show Fare Adjustment Control (FR-AD-16, BR-23) */}
            {selectedComplaint.category === 'PAYMENT_DISPUTE' && (
              <div
                style={{
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  backgroundColor: 'var(--accent-amber-bg)',
                  padding: '14px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <h4 style={{ fontSize: '0.85rem', color: 'var(--accent-amber)', marginBottom: '8px' }}>
                  Payment Dispute Resolution & Fare Amendment (FR-AD-16)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Corrected Fare (PKR, Optional)
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="e.g. 40000"
                      value={adjustedFare}
                      onChange={(e) => setAdjustedFare(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Settlement Status
                    </label>
                    <select
                      className="form-select"
                      value={adjustedPaymentStatus}
                      onChange={(e) => setAdjustedPaymentStatus(e.target.value as any)}
                    >
                      <option value="PENDING">Pending</option>
                      <option value="PARTIAL">Partial</option>
                      <option value="PAID">Paid</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {errorMessage && (
              <div style={{ padding: '10px', backgroundColor: 'var(--accent-rose-bg)', color: 'var(--accent-rose)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                {errorMessage}
              </div>
            )}

            {/* Written Remarks (FR-AD-15) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Administrator Resolution Remarks (Visible to both parties, FR-AD-15)
              </label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="State the arbitration findings and reason for decision..."
                value={adminRemarks}
                onChange={(e) => setAdminRemarks(e.target.value)}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isProcessing}
                onClick={() => handleResolve('REJECTED')}
              >
                <XCircle size={16} />
                <span>Reject Complaint</span>
              </button>

              <button
                type="button"
                className="btn btn-success"
                disabled={isProcessing}
                onClick={() => handleResolve('RESOLVED')}
              >
                <CheckCircle size={16} />
                <span>Resolve & Unfreeze Payment</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
