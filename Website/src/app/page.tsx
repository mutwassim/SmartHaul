'use client';

import React from 'react';
import Link from 'next/link';
import { useLanguage } from '../context/LanguageContext';
import {
  Truck,
  ShieldCheck,
  TrendingDown,
  Navigation,
  FileCheck2,
  Users,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export default function HomePage() {
  const { t } = useLanguage();

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      {/* Hero Section */}
      <section
        style={{
          padding: '80px 24px',
          textAlign: 'center',
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
        }}
      >
        <div
          className="badge"
          style={{
            backgroundColor: 'var(--primary-glow)',
            color: 'var(--primary)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            padding: '6px 14px',
            fontSize: '0.85rem',
            gap: '8px',
          }}
        >
          <Sparkles size={14} />
          <span>Pakistan Heavy Goods Vehicle Logistics Platform</span>
        </div>

        <h1
          style={{
            fontSize: 'clamp(2.5rem, 5vw, 4rem)',
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            maxWidth: '900px',
          }}
        >
          Smart Freight Matching with <span style={{ color: 'var(--primary)' }}>Zero Broker Margin</span>
        </h1>

        <p
          style={{
            fontSize: '1.2rem',
            color: 'var(--text-secondary)',
            maxWidth: '720px',
            lineHeight: 1.6,
          }}
        >
          Connecting cargo owners, verified truck drivers, and fleet operators directly. Real-time GPS tracking, transparent competitive bidding, and rule-based return-load optimization.
        </p>

        {/* Portal Entry Buttons */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/login" className="btn btn-primary" style={{ padding: '14px 28px', fontSize: '1rem' }}>
            <span>Enter Portal</span>
            <ArrowRight size={18} />
          </Link>
          <Link href="/admin" className="btn btn-secondary" style={{ padding: '14px 24px', fontSize: '1rem' }}>
            <span>Admin Control Room</span>
          </Link>
          <Link href="/fleet" className="btn btn-secondary" style={{ padding: '14px 24px', fontSize: '1rem' }}>
            <span>Fleet Operations</span>
          </Link>
        </div>
      </section>

      {/* Feature Grid */}
      <section
        style={{
          padding: '60px 24px 100px 24px',
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
          }}
        >
          <div className="glass-card" style={{ padding: '32px 24px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: 'var(--primary-glow)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <TrendingDown size={24} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>
              Reduced Empty Running
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Rule-based matching algorithm prioritizes return loads and remaining-capacity consolidation, lowering operating costs and emissions across intercity corridors.
            </p>
          </div>

          <div className="glass-card" style={{ padding: '32px 24px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: 'var(--accent-cyan-bg)',
                color: 'var(--accent-cyan)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <Navigation size={24} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>
              Live GPS Route Tracking
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Real-time 30-second location updates, OSRM geometry calculation, and 120-second signal interruption watchdogs keep cargo owners and fleet operators informed.
            </p>
          </div>

          <div className="glass-card" style={{ padding: '32px 24px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: 'var(--accent-emerald-bg)',
                color: 'var(--accent-emerald)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <ShieldCheck size={24} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>
              Verified Trust & Safety
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Rigorous administrator document verification gate for CNIC and driving licenses with AES-256 encrypted custody and 15-minute secure inspection links.
            </p>
          </div>

          <div className="glass-card" style={{ padding: '32px 24px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: 'var(--accent-purple-bg)',
                color: 'var(--accent-purple)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <FileCheck2 size={24} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>
              Proof of Delivery & Ledger
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Mandatory photo-based handover proof before marking delivered, backed by an offline settlement audit ledger with dispute freeze protections.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
