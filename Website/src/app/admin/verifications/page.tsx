'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Modal } from '../../../components/ui/Modal';
import { DocumentViewerModal } from '../../../components/ui/DocumentViewerModal';
import { VerificationDocument } from '../../../types';
import { CheckCircle, XCircle, Eye, Clock, ShieldCheck, AlertCircle } from 'lucide-react';

interface VerificationQueueItem {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  submittedAt: string;
  elapsedWaitingHours: number;
  documentsCount: number;
  hasVehicles: boolean;
}

export default function VerificationsPage() {
  const [queue, setQueue] = useState<VerificationQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userDocs, setUserDocs] = useState<VerificationDocument[]>([]);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [inspectingDoc, setInspectingDoc] = useState<VerificationDocument | null>(null);

  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    try {
      const data = await api.get<VerificationQueueItem[]>('/admin/verification-queue');
      setQueue(data || []);
    } catch (err) {
      console.error('Error fetching verification queue:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenReview = async (item: VerificationQueueItem) => {
    try {
      setActionError(null);
      setRejectionReason('');
      const data = await api.get<{ user: any; documents: VerificationDocument[] }>(
        `/admin/verification/${item.id}/documents`
      );
      setSelectedUser(data.user);
      setUserDocs(data.documents || []);
      setIsReviewModalOpen(true);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch user documents');
    }
  };

  const handleDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    if (decision === 'REJECTED' && !rejectionReason.trim()) {
      setActionError('A recorded rejection reason is mandatory (FR-AD-7).');
      return;
    }

    setIsProcessing(true);
    setActionError(null);

    try {
      await api.post(`/admin/verification/${selectedUser.id}/decision`, {
        decision,
        rejectionReason: decision === 'REJECTED' ? rejectionReason : undefined,
      });

      setIsReviewModalOpen(false);
      fetchQueue();
    } catch (err: any) {
      setActionError(err.message || 'Failed to process decision');
    } finally {
      setIsProcessing(false);
    }
  };

  const columns: Column<VerificationQueueItem>[] = [
    {
      header: 'Applicant Name',
      accessor: 'name',
      sortable: true,
      render: (item) => (
        <div>
          <strong style={{ display: 'block' }}>{item.name}</strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.email}</span>
        </div>
      ),
    },
    {
      header: 'Role',
      accessor: 'role',
      sortable: true,
      render: (item) => <StatusBadge status={item.role} size="sm" />,
    },
    {
      header: 'Contact',
      accessor: 'phone',
    },
    {
      header: 'Submitted Time',
      accessor: 'submittedAt',
      sortable: true,
      render: (item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={14} style={{ color: 'var(--accent-amber)' }} />
          <span>{item.elapsedWaitingHours}h ago</span>
        </div>
      ),
    },
    {
      header: 'Documents',
      accessor: 'documentsCount',
      render: (item) => (
        <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          {item.documentsCount} uploaded
        </span>
      ),
    },
    {
      header: 'Actions',
      render: (item) => (
        <button
          className="btn btn-primary"
          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
          onClick={() => handleOpenReview(item)}
        >
          <Eye size={14} />
          <span>Review Documents</span>
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Verification Queue (FR-AD-5, UC-13)
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Review submitted CNIC, driving license, and vehicle documents before granting bidding permissions (BR-3)
        </p>
      </div>

      <DataTable
        columns={columns}
        data={queue}
        keyExtractor={(item) => item.id}
        searchPlaceholder="Search applicant by name or email..."
        isLoading={isLoading}
        emptyMessage="No pending verification requests in the queue."
      />

      {/* Verification Review Modal (FR-AD-6, UI-23) */}
      <Modal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        title={`Verify Account: ${selectedUser?.name || ''}`}
        maxWidth="720px"
      >
        {selectedUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Applicant Summary */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                background: 'var(--bg-primary)',
                padding: '16px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Role: </span>
                <strong>{selectedUser.role}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Phone: </span>
                <strong>{selectedUser.phone}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Email: </span>
                <strong>{selectedUser.email}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Business Name: </span>
                <strong>{selectedUser.businessName || 'Individual Owner'}</strong>
              </div>
            </div>

            {/* Document Gallery (UI-23) */}
            <div>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-secondary)' }}>
                Uploaded Verification Documents (15-min Signed Links)
              </h4>

              {userDocs.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No documents uploaded yet.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  {userDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="glass-card"
                      style={{
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.85rem', display: 'block' }}>
                          {doc.documentType.replace(/_/g, ' ')}
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Status: {doc.verificationStatus}
                        </span>
                      </div>

                      <button
                        className="btn btn-secondary"
                        style={{ width: '100%', padding: '6px', fontSize: '0.75rem' }}
                        onClick={() => setInspectingDoc(doc)}
                      >
                        <Eye size={12} />
                        <span>Inspect Image</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {actionError && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--accent-rose-bg)',
                  border: '1px solid rgba(244, 63, 94, 0.4)',
                  color: 'var(--accent-rose)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} />
                <span>{actionError}</span>
              </div>
            )}

            {/* Rejection Remarks Form */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Rejection Reason (Mandatory if rejecting, FR-AD-7)
              </label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="State specific reason (e.g. CNIC photo blurry, driving license expired)..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isProcessing}
                onClick={() => handleDecision('REJECTED')}
              >
                <XCircle size={16} />
                <span>Reject Application</span>
              </button>

              <button
                type="button"
                className="btn btn-success"
                disabled={isProcessing}
                onClick={() => handleDecision('APPROVED')}
              >
                <CheckCircle size={16} />
                <span>Approve & Grant Permissions</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Zoomable Image Inspector Modal (UI-23) */}
      <DocumentViewerModal
        isOpen={!!inspectingDoc}
        onClose={() => setInspectingDoc(null)}
        document={inspectingDoc}
      />
    </div>
  );
}
