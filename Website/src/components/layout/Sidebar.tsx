'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  LayoutDashboard,
  FileCheck,
  Package,
  AlertTriangle,
  Users,
  ScrollText,
  Megaphone,
  BarChart3,
  Truck,
  UserCheck,
  TrendingUp,
  MapPin,
  CreditCard,
  ClipboardList,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const pathname = usePathname();

  if (!user) return null;

  const isAdmin = user.role === 'ADMIN';

  const adminNavItems = [
    { label: t('dashboard'), href: '/admin', icon: LayoutDashboard },
    { label: t('verifications'), href: '/admin/verifications', icon: FileCheck },
    { label: t('shipments'), href: '/admin/shipments', icon: Package },
    { label: t('complaints'), href: '/admin/complaints', icon: AlertTriangle },
    { label: t('users'), href: '/admin/users', icon: Users },
    { label: t('audit_logs'), href: '/admin/audit-logs', icon: ScrollText },
    { label: t('announcements'), href: '/admin/announcements', icon: Megaphone },
    { label: t('analytics'), href: '/admin/analytics', icon: BarChart3 },
  ];

  const fleetNavItems = [
    { label: t('dashboard'), href: '/fleet', icon: LayoutDashboard },
    { label: t('vehicles'), href: '/fleet/vehicles', icon: Truck },
    { label: t('drivers'), href: '/fleet/drivers', icon: UserCheck },
    { label: t('bids'), href: '/fleet/bids', icon: TrendingUp },
    { label: t('assignments'), href: '/fleet/assignments', icon: ClipboardList },
    { label: t('live_map'), href: '/fleet/live-map', icon: MapPin },
    { label: t('payments'), href: '/fleet/payments', icon: CreditCard },
    { label: t('reports'), href: '/fleet/reports', icon: BarChart3 },
  ];

  const navItems = isAdmin ? adminNavItems : fleetNavItems;

  return (
    <aside
      style={{
        width: '240px',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
        minHeight: 'calc(100vh - 64px)',
        padding: '20px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        flexShrink: 0,
      }}
    >
      <div style={{ padding: '0 12px 12px 12px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        {isAdmin ? 'Administration Portal' : 'Fleet Operations'}
      </div>

      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (item.href !== '/admin' && item.href !== '/fleet' && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.875rem',
              fontWeight: isActive ? 600 : 400,
              backgroundColor: isActive ? 'var(--primary-glow)' : 'transparent',
              color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
              border: isActive ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </aside>
  );
};
