import { useState, useEffect } from 'react';
import { getActivityLogs } from '../utils/storage';
import type { ActivityLog as ActivityLogType } from '../types';
import { Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';

const ActivityLog = () => {
  const [logs, setLogs] = useState<ActivityLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;

  const fetchLogs = async (pageNum = 0, append = false) => {
    if (!append) setLoading(true);
    try {
      const data = await getActivityLogs(PAGE_SIZE, pageNum * PAGE_SIZE);
      if (append) {
        setLogs(prev => [...prev, ...data]);
      } else {
        setLogs(data);
      }
      setHasMore(data.length === PAGE_SIZE);
    } catch (error) {
      console.error('Failed to fetch activity logs:', error);
    } finally {
      if (!append) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(0, false);
    setPage(0);
  }, []);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchLogs(nextPage, true);
  };

  return (
    <div className="fade-in" style={{ padding: '1rem 0 3rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>
          Riwayat Penggunaan
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', margin: 0, marginTop: '0.25rem' }}>
          Pemantauan audit log permanen dari seluruh aktivitas sistem
        </p>
      </div>

      <div className="card" style={{ padding: '0' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '180px' }}>Waktu</th>
                <th style={{ width: '220px' }}>Aksi Sistem</th>
                <th>Detail Aktivitas</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3}>
                    <div className="loading-spinner" style={{ margin: '2rem auto' }} />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center text-muted" style={{ padding: '3rem 1rem' }}>
                    <Clock size={32} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                    <p style={{ margin: 0 }}>Belum ada riwayat aktivitas.</p>
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id}>
                    <td className="text-sm text-secondary font-medium" style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Clock size={14} />
                        {format(parseISO(log.created_at), "dd MMM yyyy, HH:mm", { locale: id })}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-neutral text-xs" style={{ fontFamily: 'monospace', background: 'var(--color-bg)' }}>
                        {log.action}
                      </span>
                    </td>
                    <td className="text-sm font-medium" style={{ whiteSpace: 'normal', minWidth: '250px' }}>
                      <div style={{ color: 'var(--color-text)', lineHeight: 1.4 }}>
                        {log.description}
                      </div>
                      {(log.actor_name || log.reason) && (
                        <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--color-surface-alt)', borderRadius: '6px', fontSize: '0.8rem', border: '1px solid var(--color-border-light)' }}>
                          {log.actor_name && <div style={{ marginBottom: '0.2rem' }}><span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Oleh:</span> {log.actor_name}</div>}
                          {log.reason && <div><span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Alasan:</span> {log.reason}</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {hasMore && !loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
              <button className="btn btn-outline" onClick={loadMore}>Muat Lebih Banyak</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityLog;
