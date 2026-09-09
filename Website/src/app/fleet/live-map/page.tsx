'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/services/api';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  MapPin,
  Truck,
  User,
  AlertTriangle,
  RefreshCw,
  Clock,
  Radio,
  Navigation,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';

interface LiveTripData {
  tripId: string;
  shipment: {
    id: string;
    shipmentNumber: string;
    status: string;
    pickupAddress: string;
    dropoffAddress: string;
  };
  driver: {
    id: string;
    name: string;
    phone: string;
  };
  vehicle: {
    id: string;
    model: string;
    type: string;
  };
  lastKnownPosition: {
    latitude: number;
    longitude: number;
    accuracy: number;
    recordedAt: string;
  } | null;
  isInterrupted: boolean;
}

export default function FleetLiveMapPage() {
  const { t, isRTL } = useLanguage();
  const [trips, setTrips] = useState<LiveTripData[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});

  const fetchLiveMapData = async () => {
    try {
      setLoading(true);
      const data = await api.get<LiveTripData[]>('/fleet/live-map');
      setTrips(data || []);
      setLastRefreshed(new Date());
      if (data && data.length > 0 && !selectedTripId) {
        setSelectedTripId(data[0].tripId);
      }
    } catch (err) {
      console.error('Failed to fetch live map data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveMapData();
  }, []);

  // Polling interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLiveMapData();
    }, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Initialize Leaflet Map
  useEffect(() => {
    let isMounted = true;

    async function initLeaflet() {
      if (typeof window === 'undefined' || !mapRef.current) return;

      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      if (!leafletMapRef.current && mapRef.current) {
        const map = L.map(mapRef.current).setView([30.3753, 69.3451], 6); // Centered on Pakistan

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(map);

        leafletMapRef.current = map;
      }

      if (!leafletMapRef.current) return;
      const map = leafletMapRef.current;

      // Clear existing markers
      Object.values(markersRef.current).forEach((m: any) => map.removeLayer(m));
      markersRef.current = {};

      const bounds: any[] = [];

      trips.forEach((trip) => {
        if (!trip.lastKnownPosition) return;

        const { latitude, longitude } = trip.lastKnownPosition;
        bounds.push([latitude, longitude]);

        const markerColor = trip.isInterrupted ? '#ef4444' : '#2563eb';

        const customIcon = L.divIcon({
          className: 'custom-truck-marker',
          html: `
            <div style="
              background: ${markerColor};
              width: 36px;
              height: 36px;
              border-radius: 50%;
              border: 3px solid white;
              box-shadow: 0 4px 10px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              cursor: pointer;
            ">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="3" width="15" height="13"></rect>
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                <circle cx="5.5" cy="18.5" r="2.5"></circle>
                <circle cx="18.5" cy="18.5" r="2.5"></circle>
              </svg>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const marker = L.marker([latitude, longitude], { icon: customIcon }).addTo(map);

        marker.bindPopup(`
          <div style="font-family: inherit; min-width: 180px; padding: 4px;">
            <div style="font-weight: 700; color: #0f172a; margin-bottom: 4px;">${trip.shipment.shipmentNumber}</div>
            <div style="font-size: 12px; color: #475569;">Driver: <strong>${trip.driver.name}</strong></div>
            <div style="font-size: 12px; color: #475569;">Vehicle: <strong>${trip.vehicle.model}</strong></div>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Status: <strong>${trip.shipment.status}</strong></div>
            ${
              trip.isInterrupted
                ? '<div style="color: #ef4444; font-size: 11px; font-weight: 600; margin-top: 4px;">⚠ Tracking Interrupted (>120s)</div>'
                : '<div style="color: #16a34a; font-size: 11px; font-weight: 600; margin-top: 4px;">● Live GPS Active</div>'
            }
          </div>
        `);

        marker.on('click', () => {
          setSelectedTripId(trip.tripId);
        });

        markersRef.current[trip.tripId] = marker;
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    }

    initLeaflet();

    return () => {
      isMounted = false;
    };
  }, [trips]);

  // Pan to selected trip
  const handleSelectTrip = (trip: LiveTripData) => {
    setSelectedTripId(trip.tripId);
    if (leafletMapRef.current && trip.lastKnownPosition) {
      leafletMapRef.current.flyTo([trip.lastKnownPosition.latitude, trip.lastKnownPosition.longitude], 12, {
        duration: 1.5,
      });
      const marker = markersRef.current[trip.tripId];
      if (marker) {
        marker.openPopup();
      }
    }
  };

  const selectedTrip = trips.find((t) => t.tripId === selectedTripId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: 'calc(100vh - 120px)' }}>
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'var(--bg-card)',
          padding: '1rem 1.25rem',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              padding: '0.5rem',
              background: 'rgba(37, 99, 235, 0.1)',
              borderRadius: '8px',
              color: 'var(--primary)',
            }}
          >
            <Radio size={22} className="animate-pulse" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {isRTL ? 'بیڑے کا لائیو ٹریکنگ نقشہ' : 'Fleet Live Operations Map'}
            </h1>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {isRTL
                ? `${trips.length} فعال گاڑیاں لائیو جی پی ایس پر موجود ہیں (FR-FO-15)`
                : `${trips.length} active fleet vehicles currently reporting live GPS streams (FR-FO-15)`}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <Clock size={14} />
            <span>Updated {lastRefreshed.toLocaleTimeString()}</span>
          </div>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: autoRefresh ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
              color: autoRefresh ? '#16a34a' : 'var(--text-muted)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: autoRefresh ? '#16a34a' : 'var(--text-muted)',
              }}
            />
            {autoRefresh ? 'Auto (15s)' : 'Paused'}
          </button>

          <button
            onClick={fetchLiveMapData}
            disabled={loading}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              background: 'var(--primary)',
              color: 'white',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {isRTL ? 'تازہ کریں' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Main Map & Sidebar Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '360px 1fr',
          gap: '1rem',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Active Vehicles Sidebar */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '1rem',
              borderBottom: '1px solid var(--border-color)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{isRTL ? 'فعال ٹرپس' : 'Active Dispatches'} ({trips.length})</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Select to locate</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {trips.length === 0 ? (
              <div
                style={{
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.9rem',
                }}
              >
                <Truck size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                No active dispatches currently in transit.
              </div>
            ) : (
              trips.map((trip) => {
                const isSelected = trip.tripId === selectedTripId;
                return (
                  <div
                    key={trip.tripId}
                    onClick={() => handleSelectTrip(trip)}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                      background: isSelected ? 'rgba(37, 99, 235, 0.06)' : 'var(--bg-card-hover)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        {trip.shipment.shipmentNumber}
                      </span>
                      <StatusBadge status={trip.shipment.status} />
                    </div>

                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <User size={12} style={{ color: 'var(--primary)' }} />
                        <span>Driver: <strong>{trip.driver.name}</strong> ({trip.driver.phone})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Truck size={12} style={{ color: 'var(--secondary)' }} />
                        <span>Vehicle: <strong>{trip.vehicle.model}</strong></span>
                      </div>
                    </div>

                    {trip.isInterrupted ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          color: '#ef4444',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: 'rgba(239, 68, 68, 0.08)',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                        }}
                      >
                        <AlertTriangle size={12} />
                        Tracking Interrupted (&gt;120s)
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          color: '#16a34a',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                        }}
                      >
                        <Navigation size={12} />
                        {trip.lastKnownPosition
                          ? `Lat: ${trip.lastKnownPosition.latitude.toFixed(4)}, Lng: ${trip.lastKnownPosition.longitude.toFixed(4)}`
                          : 'Waiting for first GPS ping...'}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Leaflet Map Canvas Container */}
        <div
          style={{
            position: 'relative',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid var(--border-color)',
            background: '#e2e8f0',
          }}
        >
          <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '400px' }} />

          {/* Selected Trip floating card */}
          {selectedTrip && (
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                right: '16px',
                left: isRTL ? '16px' : 'auto',
                width: '320px',
                background: 'rgba(15, 23, 42, 0.92)',
                backdropFilter: 'blur(8px)',
                color: 'white',
                padding: '1rem',
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                zIndex: 1000,
                fontSize: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 700, color: '#60a5fa' }}>{selectedTrip.shipment.shipmentNumber}</span>
                <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: '#334155' }}>
                  {selectedTrip.shipment.status}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', color: '#cbd5e1' }}>
                <div><strong>From:</strong> {selectedTrip.shipment.pickupAddress}</div>
                <div><strong>To:</strong> {selectedTrip.shipment.dropoffAddress}</div>
                <div><strong>Driver:</strong> {selectedTrip.driver.name} ({selectedTrip.driver.phone})</div>
                <div><strong>Vehicle:</strong> {selectedTrip.vehicle.model} ({selectedTrip.vehicle.type})</div>
                {selectedTrip.lastKnownPosition && (
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                    Last Ping: {new Date(selectedTrip.lastKnownPosition.recordedAt).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
