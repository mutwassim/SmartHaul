'use client';

import React from 'react';
import Link from 'next/link';
import { LucideIcon, ArrowUpRight } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  description?: string;
  icon: any;
  color?: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'cyan';
  href?: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  subtitle,
  description,
  icon: IconOrElement,
  color = 'blue',
  href,
}) => {
  const getColorStyle = () => {
    switch (color) {
      case 'emerald':
        return { bg: 'var(--accent-emerald-bg)', text: 'var(--accent-emerald)', glow: 'rgba(16, 185, 129, 0.2)' };
      case 'amber':
        return { bg: 'var(--accent-amber-bg)', text: 'var(--accent-amber)', glow: 'rgba(245, 158, 11, 0.2)' };
      case 'rose':
        return { bg: 'var(--accent-rose-bg)', text: 'var(--accent-rose)', glow: 'rgba(244, 63, 94, 0.2)' };
      case 'purple':
        return { bg: 'var(--accent-purple-bg)', text: 'var(--accent-purple)', glow: 'rgba(139, 92, 246, 0.2)' };
      case 'cyan':
        return { bg: 'var(--accent-cyan-bg)', text: 'var(--accent-cyan)', glow: 'rgba(6, 182, 212, 0.2)' };
      default:
        return { bg: 'var(--primary-glow)', text: 'var(--primary)', glow: 'var(--primary-glow)' };
    }
  };

  const colorStyle = getColorStyle();
  const subText = subtitle || description;

  const CardContent = (
    <div
      className="glass-card"
      style={{
        padding: '20px 24px',
        position: 'relative',
        overflow: 'hidden',
        cursor: href ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            {title}
          </p>
          <h3 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {value}
          </h3>
          {subText && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {subText}
            </p>
          )}
        </div>

        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: colorStyle.bg,
            color: colorStyle.text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {React.isValidElement(IconOrElement) ? (
            IconOrElement
          ) : typeof IconOrElement === 'function' ? (
            <IconOrElement size={22} />
          ) : null}
        </div>
      </div>

      {href && (
        <div
          style={{
            marginTop: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.8rem',
            color: colorStyle.text,
            fontWeight: 500,
          }}
        >
          <span>View details</span>
          <ArrowUpRight size={14} />
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{CardContent}</Link>;
  }

  return CardContent;
};

export default StatsCard;
