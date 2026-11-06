import { commonApi } from '@/api';
import type { AuditEntry } from '@/api/types';
import { Button, EmptyState, ErrorBanner, LoadingBlock, Modal } from '@/components/ui';
import { useApi } from '@/hooks/useApi';

function toCsv(rows: AuditEntry[]) {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  return ['Time,User,Role,Action,Detail', ...rows.map((r) => [r.at, r.userId, r.role, r.action, r.detail].map(esc).join(','))].join('\n');
}

/** Who did what, and when (Supervisor and Administrator). Served by GET /audit-log. */
export function AuditLogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, loading, error, reload } = useApi(() => commonApi.auditLog(), [open], { enabled: open });
  const rows = data ?? [];
  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `inodose-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Modal open={open} onClose={onClose} title="Audit Log" width="lg" footer={<Button variant="secondary" onClick={download} disabled={!rows.length}>Export CSV</Button>}>
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBanner message={error.message} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState title="No activity yet" />
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="sticky top-0 bg-gray-100 text-left text-[12px] uppercase tracking-wide text-gray-600">
              {['Time', 'User', 'Action', 'Detail'].map((h) => (
                <th key={h} className="border-b border-gray-300 p-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="align-top">
                <td className="border-b border-gray-100 p-2 tabular-nums">{new Date(r.at).toLocaleString()}</td>
                <td className="border-b border-gray-100 p-2">{r.userId} <span className="text-gray-500">({r.role})</span></td>
                <td className="border-b border-gray-100 p-2 font-semibold">{r.action}</td>
                <td className="border-b border-gray-100 p-2">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
