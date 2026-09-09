'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUpDown, Search, Inbox } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export interface Column<T> {
  header: string;
  accessor?: keyof T | ((item: T) => React.ReactNode);
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
}

export interface DataTableProps<T> {
  title?: string;
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  searchPlaceholder?: string;
  searchField?: keyof T;
  searchable?: boolean;
  isLoading?: boolean;
  loading?: boolean;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, any>>({
  title,
  columns,
  data,
  keyExtractor,
  searchPlaceholder = 'Search records...',
  searchField,
  searchable = true,
  isLoading = false,
  loading = false,
  emptyMessage = 'No matching records found',
}: DataTableProps<T>) {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortIndex, setSortIndex] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const isDataLoading = isLoading || loading;

  // Search filtering
  const filteredData = data.filter((item) => {
    if (!searchTerm) return true;
    if (searchField && item[searchField]) {
      return String(item[searchField]).toLowerCase().includes(searchTerm.toLowerCase());
    }
    return Object.values(item).some((val) => {
      if (typeof val === 'object' && val !== null) {
        return Object.values(val).some((nested) =>
          String(nested).toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      return String(val).toLowerCase().includes(searchTerm.toLowerCase());
    });
  });

  // Sorting
  const sortedData = [...filteredData].sort((a, b) => {
    if (sortIndex === null) return 0;
    const col = columns[sortIndex];
    if (!col) return 0;

    let valA: any = null;
    let valB: any = null;

    if (typeof col.accessor === 'string') {
      valA = a[col.accessor];
      valB = b[col.accessor];
    } else if (typeof col.accessor === 'function') {
      valA = col.accessor(a);
      valB = col.accessor(b);
    }

    if (valA === valB) return 0;
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (idx: number) => {
    if (sortIndex === idx) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortIndex(idx);
      setSortDirection('asc');
    }
  };

  const renderCell = (col: Column<T>, item: T) => {
    if (col.render) {
      return col.render(item);
    }
    if (typeof col.accessor === 'function') {
      return col.accessor(item);
    }
    if (typeof col.accessor === 'string' && item[col.accessor] !== undefined) {
      return String(item[col.accessor]);
    }
    return '—';
  };

  return (
    <div className="glass-card" style={{ padding: '20px', overflow: 'hidden' }}>
      {/* Optional Title */}
      {title && (
        <div style={{ marginBottom: '14px', fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
          {title}
        </div>
      )}

      {/* Top search & counter bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        {searchable ? (
          <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '36px' }}
              placeholder={t(searchPlaceholder)}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        ) : <div />}

        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Showing <strong>{paginatedData.length}</strong> of <strong>{sortedData.length}</strong> records (UI-22)
        </div>
      </div>

      {/* Table grid */}
      <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  style={{
                    padding: '12px 16px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: col.sortable ? 'pointer' : 'default',
                  }}
                  onClick={() => col.sortable && handleSort(idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{col.header}</span>
                    {col.sortable && <ArrowUpDown size={12} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isDataLoading ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading records...</div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '48px 24px' }}>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '12px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <Inbox size={40} strokeWidth={1.5} />
                    <p style={{ fontSize: '0.9rem' }}>{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((item) => (
                <tr
                  key={keyExtractor(item)}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {columns.map((col, idx) => (
                    <td key={idx} style={{ padding: '14px 16px', fontSize: '0.875rem' }}>
                      {renderCell(col, item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          <button
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          >
            <ChevronLeft size={14} />
            <span>Previous</span>
          </button>

          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Page {currentPage} of {totalPages}
          </span>

          <button
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
          >
            <span>Next</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default DataTable;
