'use client';

import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  Package,
  MapPin,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const { t } = useLanguage();

  const getStatusConfig = () => {
    switch (status) {
      case 'PENDING':
        return {
          bg: 'var(--accent-amber-bg)',
          color: 'var(--accent-amber)',
          border: 'rgba(245, 158, 11, 0.3)',
          icon: Clock,
          shape: 'rounded',
        };
      case 'VERIFIED':
      case 'ACTIVE':
        return {
          bg: 'var(--accent-emerald-bg)',
          color: 'var(--accent-emerald)',
          border: 'rgba(16, 185, 129, 0.3)',
          icon: ShieldCheck,
          shape: 'pill',
        };
      case 'REJECTED':
      case 'CANCELLED':
        return {
          bg: 'var(--accent-rose-bg)',
          color: 'var(--accent-rose)',
          border: 'rgba(244, 63, 94, 0.3)',
          icon: XCircle,
          shape: 'rounded',
        };
      case 'SUSPENDED':
        return {
          bg: 'var(--accent-rose-bg)',
          color: 'var(--accent-rose)',
          border: 'rgba(244, 63, 94, 0.4)',
          icon: ShieldAlert,
          shape: 'pill',
        };
      case 'BOOKED':
        return {
          bg: 'rgba(59, 130, 246, 0.12)',
          color: '#3b82f6',
          border: 'rgba(59, 130, 246, 0.3)',
          icon: CheckCircle,
          shape: 'rounded',
        };
      case 'REACHED_PICKUP':
      case 'CARGO_LOADED':
        return {
          bg: 'var(--accent-purple-bg)',
          color: 'var(--accent-purple)',
          border: 'rgba(139, 92, 246, 0.3)',
          icon: Package,
          shape: 'rounded',
        };
      case 'IN_TRANSIT':
        return {
          bg: 'var(--accent-cyan-bg)',
          color: 'var(--accent-cyan)',
          border: 'rgba(6, 182, 212, 0.4)',
          icon: Truck,
          shape: 'pill',
        };
      case 'REACHED_DESTINATION':
        return {
          bg: 'rgba(20, 184, 166, 0.12)',
          color: '#14b8a6',
          border: 'rgba(20, 184, 166, 0.3)',
          icon: MapPin,
          shape: 'rounded',
        };
      case 'DELIVERED':
      case 'COMPLETED':
      case 'PAID':
        return {
          bg: 'var(--accent-emerald-bg)',
          color: 'var(--accent-emerald)',
          border: 'rgba(16, 185, 129, 0.3)',
          icon: CheckCircle,
          shape: 'pill',
        };
      case 'PARTIAL':
        return {
          bg: 'var(--accent-amber-bg)',
          color: 'var(--accent-amber)',
          border: 'rgba(245, 158, 11, 0.3)',
          icon: Clock,
          shape: 'rounded',
        };
      default:
        return {
          bg: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          border: 'var(--border-color)',
          icon: AlertTriangle,
          shape: 'rounded',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <span
      className="badge"
      style={{
        backgroundColor: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        borderRadius: config.shape === 'pill' ? '9999px' : '6px',
        padding: size === 'sm' ? '2px 8px' : '4px 10px',
        fontSize: size === 'sm' ? '0.7rem' : '0.75rem',
      }}
    >
      <Icon size={size === 'sm' ? 12 : 14} />
      <span>{t(status)}</span>
    </span>
  );
};

export default StatusBadge;
