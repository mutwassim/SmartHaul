'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { ZoomIn, ZoomOut, RotateCw, ExternalLink } from 'lucide-react';
import { VerificationDocument } from '../../types';

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: VerificationDocument | null;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  isOpen,
  onClose,
  document,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  if (!document) return null;

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  const fileUrl = document.signedUrl || document.viewUrl || '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Document Review: ${document.documentType.replace(/_/g, ' ')}`}
      maxWidth="800px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Controls Toolbar (UI-23) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-primary)',
            padding: '8px 16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={handleZoomOut}>
              <ZoomOut size={16} />
            </button>
            <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={handleZoomIn}>
              <ZoomIn size={16} />
            </button>
            <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={handleRotate}>
              <RotateCw size={16} />
            </button>
          </div>

          {fileUrl && (
            <a
              href={`http://localhost:5000${fileUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            >
              <ExternalLink size={14} />
              <span>Open in new tab</span>
            </a>
          )}
        </div>

        {/* Document Preview Pane with Zoom & Rotation */}
        <div
          style={{
            minHeight: '400px',
            maxHeight: '500px',
            background: '#000000',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
            padding: '16px',
          }}
        >
          {fileUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`http://localhost:5000${fileUrl}`}
              alt={document.documentType}
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transition: 'transform 0.2s ease',
                maxWidth: '100%',
                maxHeight: '450px',
                objectFit: 'contain',
              }}
              onError={(e) => {
                // Fallback placeholder if image not found
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>No preview available</div>
          )}
        </div>

        {/* Document Metadata Details */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            fontSize: '0.85rem',
            background: 'var(--bg-primary)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Status: </span>
            <strong>{document.verificationStatus}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Expiry Date: </span>
            <strong>{document.expiryDate ? new Date(document.expiryDate).toLocaleDateString() : 'N/A'}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Uploaded: </span>
            <strong>{new Date(document.createdAt).toLocaleDateString()}</strong>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DocumentViewerModal;
