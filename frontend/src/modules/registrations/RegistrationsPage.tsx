import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCheck, Clock, CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { registrationsApi } from '../../services/api';
import type { RegistrationRequest } from '../../services/api';
import { useToastStore } from '../../store';
import { fmt } from '../../utils/formatters';

function RejectModal({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { addToast } = useToastStore();
  const [reason, setReason] = useState('');

  const mut = useMutation({
    mutationFn: () => registrationsApi.reject(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['registrations'] }); addToast({ type: 'info', title: 'Registration rejected' }); onClose(); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-carbon-800 rounded-2xl shadow-modal w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-carbon dark:text-white mb-1">Reject Registration</h2>
        <p className="text-coolslate text-sm mb-4">Provide a reason for rejection (will be stored in audit log)</p>
        <textarea value={reason} onChange={e => setReason(e.target.value)}
          placeholder="Reason for rejection..." rows={3}
          className="w-full px-3 py-2 rounded-lg border border-lgrayblue/40 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-carbon/30 resize-none mb-4" />
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-coolslate hover:text-carbon dark:hover:text-white">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !reason.trim()}
            className="px-4 py-2 bg-vibrant text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Reject
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RegistrationsPage() {
  const { addToast } = useToastStore();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('pending');
  const [rejectId, setRejectId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['registrations', filter],
    queryFn: () => registrationsApi.list({ status: filter || undefined, limit: 50 }),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => registrationsApi.approve(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['registrations'] }); addToast({ type: 'success', title: 'Registration approved — user account created' }); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  const statusIcon = (s: string) => {
    if (s === 'pending')  return <Clock size={13} className="text-gold" />;
    if (s === 'approved') return <CheckCircle size={13} className="text-greenline" />;
    return <XCircle size={13} className="text-vibrant" />;
  };

  const statusColor = (s: string) => {
    if (s === 'pending')  return 'bg-gold/10 text-gold border-gold/30';
    if (s === 'approved') return 'bg-greenline/10 text-greenline border-greenline/30';
    return 'bg-vibrant/10 text-vibrant border-vibrant/30';
  };

  const pendingCount = data?.data?.filter(r => r.status === 'pending').length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center relative">
          <UserCheck size={18} className="text-white" />
          {pendingCount > 0 && filter !== 'pending' && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-vibrant text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {pendingCount}
            </span>
          )}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-carbon dark:text-white">Registration Requests</h1>
          <p className="text-coolslate text-xs">{data?.total ?? 0} total</p>
        </div>
      </div>

      {/* Pending alert banner */}
      {filter !== 'pending' && pendingCount > 0 && (
        <div className="flex items-center gap-3 p-4 bg-gold/10 border border-gold/30 rounded-xl">
          <AlertCircle size={18} className="text-gold flex-shrink-0 animate-pulse" />
          <p className="text-sm text-carbon dark:text-white font-medium">
            {pendingCount} pending registration{pendingCount > 1 ? 's' : ''} awaiting review
          </p>
          <button onClick={() => setFilter('pending')} className="ml-auto text-xs text-gold font-medium underline">Review now</button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { value: '', label: 'All' },
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
        ].map(({ value, label }) => (
          <button key={value} onClick={() => setFilter(value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === value ? 'bg-carbon dark:bg-white text-white dark:text-carbon' : 'bg-lgrayblue/20 dark:bg-slate-700 text-coolslate hover:text-carbon dark:hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-coolslate" /></div>
      ) : !data?.data?.length ? (
        <div className="bg-white dark:bg-carbon-800 rounded-2xl border border-lgrayblue/30 dark:border-slate-700 py-12 text-center text-coolslate text-sm">
          No {filter || ''} registration requests
        </div>
      ) : (
        <div className="space-y-3">
          {data.data.map((r: RegistrationRequest) => (
            <div key={r.id} className={`bg-white dark:bg-carbon-800 rounded-2xl border p-5 transition-shadow ${r.status === 'pending' ? 'border-gold/30 dark:border-gold/20 shadow-sm' : 'border-lgrayblue/30 dark:border-slate-700'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-semibold">{r.first_name[0]}{r.last_name[0]}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-carbon dark:text-white">{r.first_name} {r.last_name}</p>
                    <p className="text-coolslate text-xs">{r.email} · @{r.username}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-coolslate">
                      {r.requested_project_name && (
                        <span>Project: <strong className="text-carbon dark:text-lgrayblue">{r.requested_project_name}</strong></span>
                      )}
                      {r.requested_role_name && (
                        <span>Role: <strong className="text-carbon dark:text-lgrayblue">{r.requested_role_name}</strong></span>
                      )}
                      <span>Submitted: {fmt.datetime(r.created_at)}</span>
                    </div>
                    {r.rejection_reason && (
                      <p className="mt-2 text-xs text-vibrant">Rejection reason: {r.rejection_reason}</p>
                    )}
                    {r.reviewed_by_name && (
                      <p className="mt-1 text-xs text-coolslate">
                        {r.status === 'approved' ? 'Approved' : 'Rejected'} by {r.reviewed_by_name}
                        {r.reviewed_at && ` · ${fmt.datetime(r.reviewed_at)}`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${statusColor(r.status)}`}>
                    {statusIcon(r.status)} {r.status}
                  </span>

                  {r.status === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => setRejectId(r.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-vibrant/10 text-vibrant hover:bg-vibrant/20 transition-colors">
                        <XCircle size={12} /> Reject
                      </button>
                      <button onClick={() => approveMut.mutate(r.id)} disabled={approveMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-greenline/10 text-greenline hover:bg-greenline/20 transition-colors disabled:opacity-50">
                        {approveMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Approve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejectId && <RejectModal id={rejectId} onClose={() => setRejectId(null)} />}
    </div>
  );
}
