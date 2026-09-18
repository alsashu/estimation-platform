import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, parametricMasterApi } from '../../services/api';
import { Card, Skeleton, EmptyState } from '../../components/ui';
import { useToastStore } from '../../store';
import { FolderOpen } from 'lucide-react';

const selectClass = 'w-full px-3 py-2 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20';

export function ProjectMappingSection() {
  const qc = useQueryClient();
  const { addToast } = useToastStore();

  const { data: projectsRes, isLoading: loadingProjects } = useQuery({
    queryKey: ['projects', { limit: 200 }],
    queryFn: () => projectsApi.list({ limit: 200 }),
    retry: false,
  });
  const { data: averageConfigs } = useQuery({ queryKey: ['parametric-average-configs'], queryFn: parametricMasterApi.getAverageConfigs, retry: false });
  const { data: expertConfigs } = useQuery({ queryKey: ['parametric-expert-configs'], queryFn: parametricMasterApi.getExpertConfigs, retry: false });

  const mapMutation = useMutation({
    mutationFn: ({ projectId, body }: { projectId: string; body: { parametric_average_config_id?: string | null; parametric_expert_config_id?: string | null } }) =>
      parametricMasterApi.setProjectConfig(projectId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      addToast({ type: 'success', title: 'Project mapping updated' });
    },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });

  const projects = projectsRes?.data ?? [];

  return (
    <Card padding="p-0">
      <div className="px-5 py-4 border-b border-lgrayblue/30 dark:border-slate-700">
        <h2 className="font-semibold text-carbon dark:text-white text-sm">Project → Configuration Mapping</h2>
        <p className="text-xs text-coolslate mt-0.5">Choose which Average and Expert Judgement configuration each project uses. Leave as "Use default" to follow whichever configuration is currently marked default.</p>
      </div>

      {loadingProjects ? (
        <div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : projects.length === 0 ? (
        <EmptyState icon={<FolderOpen size={28} />} title="No projects found" />
      ) : (
        <table className="w-full">
          <thead><tr className="border-b border-lgrayblue/20 dark:border-slate-700">
            {['Project', 'Average Estimation Config', 'Expert Judgement Config'].map(h => (
              <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-coolslate uppercase tracking-wide">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-b border-lgrayblue/10 dark:border-slate-700/30 last:border-0">
                <td className="px-5 py-3">
                  <p className="text-sm font-medium text-carbon dark:text-white">{p.name}</p>
                  {p.code && <p className="text-xs text-coolslate">{p.code}</p>}
                </td>
                <td className="px-5 py-3">
                  <select
                    className={selectClass}
                    value={p.parametric_average_config_id ?? ''}
                    onChange={(e) => mapMutation.mutate({ projectId: p.id, body: { parametric_average_config_id: e.target.value || null } })}
                  >
                    <option value="">Use default{averageConfigs ? ` (${averageConfigs.find(c => c.is_default)?.name ?? '—'})` : ''}</option>
                    {(averageConfigs ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </td>
                <td className="px-5 py-3">
                  <select
                    className={selectClass}
                    value={p.parametric_expert_config_id ?? ''}
                    onChange={(e) => mapMutation.mutate({ projectId: p.id, body: { parametric_expert_config_id: e.target.value || null } })}
                  >
                    <option value="">Use default{expertConfigs ? ` (${expertConfigs.find(c => c.is_default)?.name ?? '—'})` : ''}</option>
                    {(expertConfigs ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
