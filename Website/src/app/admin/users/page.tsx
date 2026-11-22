'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Modal } from '../../../components/ui/Modal';
import { User } from '../../../types';
import { UserPlus, ShieldAlert, ShieldCheck, UserCheck, Phone, Mail } from 'lucide-react';

// Reinstatement restores the status held before suspension (FR-AD-5)
const reinstateStatus = (user: User | null) =>
  user?.statusBeforeSuspension || (user?.role === 'CARGO_OWNER' ? 'ACTIVE' : 'VERIFIED');

export default function UsersManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Suspend modal state
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<'SUSPENDED' | 'ACTIVE' | 'VERIFIED'>('SUSPENDED');
  const [statusReason, setStatusReason] = useState('');

  // Provision admin modal state (FR-AD-1)
  const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  // Password reset token modal state (FR-SV-4)
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetReason, setResetReason] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await api.get<User[]>('/admin/users?limit=100');
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenStatusModal = (user: User) => {
    setSelectedUser(user);
    setNewStatus(user.accountStatus === 'SUSPENDED' ? 'VERIFIED' : 'SUSPENDED');
    setStatusReason('');
    setFormError(null);
    setIsStatusModalOpen(true);
  };

  const handleUpdateStatus = async () => {
    if (!statusReason.trim()) {
      setFormError('A recorded reason is mandatory when changing account status (BR-28).');
      return;
    }

    setIsProcessing(true);
    setFormError(null);

    try {
      await api.post(`/admin/users/${selectedUser?.id}/status`, {
        status: newStatus === 'SUSPENDED' ? 'SUSPENDED' : reinstateStatus(selectedUser),
        reason: statusReason,
      });

      setIsStatusModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update account status');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleIssueResetToken = async () => {
    if (resetReason.trim().length < 3) {
      setFormError('Record how the identity of the account owner was checked (FR-SV-4).');
      return;
    }
    setIsProcessing(true);
    setFormError(null);
    try {
      const res = await api.post<{ resetToken: string }>(`/admin/users/${resetUser?.id}/reset-token`, {
        reason: resetReason,
      });
      setResetToken(res.resetToken);
    } catch (err: any) {
      setFormError(err.message || 'Failed to issue reset token');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProvisionAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setFormError(null);

    try {
      await api.post('/admin/provision-account', {
        name: adminName,
        email: adminEmail,
        phone: adminPhone,
        password: adminPassword,
      });

      setIsProvisionModalOpen(false);
      setAdminName('');
      setAdminEmail('');
      setAdminPhone('');
      setAdminPassword('');
      alert('Administrator account provisioned successfully (FR-AD-1)');
    } catch (err: any) {
      setFormError(err.message || 'Failed to provision administrator');
    } finally {
      setIsProcessing(false);
    }
  };

  const columns: Column<User>[] = [
    {
      header: 'Name',
      accessor: 'name',
      sortable: true,
      render: (item) => (
        <div>
          <strong>{item.name}</strong>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {item.businessName || 'Individual'}
          </span>
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
      render: (item) => (
        <div style={{ fontSize: '0.8rem' }}>
          <div>{item.phone}</div>
          <div style={{ color: 'var(--text-muted)' }}>{item.email}</div>
        </div>
      ),
    },
    {
      header: 'Account Status',
      accessor: 'accountStatus',
      sortable: true,
      render: (item) => <StatusBadge status={item.accountStatus} size="sm" />,
    },
    {
      header: 'Actions',
      render: (item) =>
        item.role === 'ADMIN' ? null : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              onClick={() => handleOpenStatusModal(item)}
            >
              {item.accountStatus === 'SUSPENDED' ? 'Reinstate' : 'Suspend Account'}
            </button>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              onClick={() => {
                setResetUser(item);
                setResetReason('');
                setResetToken(null);
                setFormError(null);
              }}
            >
              Reset Password
            </button>
          </div>
        ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            User Account Management (FR-SV-11, FR-AD-5)
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Manage platform accounts, suspend/reinstate users with recorded reasons, and provision staff
          </p>
        </div>

        <button
          className="btn btn-primary"
          style={{ padding: '10px 18px', gap: '8px' }}
          onClick={() => {
            setFormError(null);
            setIsProvisionModalOpen(true);
          }}
        >
          <UserPlus size={16} />
          <span>Provision Administrator (FR-AD-1)</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        data={users}
        keyExtractor={(item) => item.id}
        searchPlaceholder="Search users by name, phone, or email..."
        isLoading={isLoading}
      />

      {/* Account Status Modal (FR-AD-5) */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title={`Change Status: ${selectedUser?.name || ''}`}
        maxWidth="500px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Target Status
            </label>
            <select
              className="form-select"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as any)}
            >
              <option value="SUSPENDED">Suspended (Block bidding & trips, FR-AD-5)</option>
              <option value="VERIFIED">Verified / Active (Reinstated)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Recorded Reason (Mandatory for audit log, BR-28)
            </label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="State reason for suspension or reinstatement..."
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
            />
          </div>

          {formError && (
            <div style={{ padding: '10px', backgroundColor: 'var(--accent-rose-bg)', color: 'var(--accent-rose)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsStatusModalOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={newStatus === 'SUSPENDED' ? 'btn btn-danger' : 'btn btn-success'}
              disabled={isProcessing}
              onClick={handleUpdateStatus}
            >
              Confirm Status Change
            </button>
          </div>
        </div>
      </Modal>

      {/* Password reset token (FR-SV-4) */}
      <Modal
        isOpen={resetUser !== null}
        onClose={() => setResetUser(null)}
        title={`Reset Password: ${resetUser?.name || ''}`}
        maxWidth="500px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {resetToken ? (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Give this single-use token to the account owner. It expires in 15 minutes and is not shown again.
              </p>
              <code style={{ padding: '12px', wordBreak: 'break-all', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                {resetToken}
              </code>
            </>
          ) : (
            <>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                How was the identity of the account owner checked? (recorded in the audit log)
              </label>
              <textarea
                className="form-textarea"
                rows={3}
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
              />
              {formError && (
                <div style={{ padding: '10px', backgroundColor: 'var(--accent-rose-bg)', color: 'var(--accent-rose)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                  {formError}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setResetUser(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" disabled={isProcessing} onClick={handleIssueResetToken}>
                  Issue Token
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Provision Administrator Modal (FR-AD-1) */}
      <Modal
        isOpen={isProvisionModalOpen}
        onClose={() => setIsProvisionModalOpen(false)}
        title="Provision Administrator Account (FR-AD-1)"
        maxWidth="520px"
      >
        <form onSubmit={handleProvisionAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Full Name
            </label>
            <input
              type="text"
              required
              className="form-input"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Official Email
            </label>
            <input
              type="email"
              required
              className="form-input"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Phone Number
            </label>
            <input
              type="text"
              required
              className="form-input"
              value={adminPhone}
              onChange={(e) => setAdminPhone(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Temporary Password (min 8 chars, 1 uppercase, 1 special)
            </label>
            <input
              type="password"
              required
              className="form-input"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
            />
          </div>

          {formError && (
            <div style={{ padding: '10px', backgroundColor: 'var(--accent-rose-bg)', color: 'var(--accent-rose)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsProvisionModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isProcessing}>
              Provision Account
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
