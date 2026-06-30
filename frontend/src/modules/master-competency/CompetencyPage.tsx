import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Edit2, Save, X } from 'lucide-react';
import { masterApi } from '../../services/api';
import { Button, Card, Badge, Skeleton } from '../../components/ui';
import { useToastStore } from '../../store';
import { fmt } from '../../utils/formatters';
import type { CompetencyOverheadConfig, CompetencyLevel, ComplexityLevel } from '../../types';

const COMPLEXITIES: ComplexityLevel[] = ['Low', 'Medium', 'High', 'Very High', 'Unmanageable'];
const COMPETENCIES: CompetencyLevel[] = ['Emerging', 'Competent', 'Expert'];
const COMPETENCY_COLORS = { Emerging: '#E15A50', Competent: '#9B875F', Expert: '#19AA6E' };

function OverheadMatrix({ configs, onEdit }: { configs: CompetencyOverheadConfig[]; onEdit: (c: CompetencyOverheadConfig) => void }) {
  const get = (comp: CompetencyLevel, cmplx: ComplexityLevel) =>
    configs.find(c => c.competency === comp && c.complexity === cmplx);

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-xs font-semibold text-coolslate pb-3 pr-4 text-left w-28">Competency</th>
            {COMPLEXITIES.map(c => <th key={c} className="text-xs font-semibold text-coolslate pb-3 px-3 text-center min-w-[100px]">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {COMPETENCIES.map(comp => (
            <tr key={comp}>
              <td className="pr-4 py-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: COMPETENCY_COLORS[comp] }} />
                  <span className="text-sm font-semibold text-carbon dark:text-white">{comp}</span>
                </div>
              </td>
              {COMPLEXITIES.map(cmplx => {
                const cfg = get(comp, cmplx);
                return (
                  <td key={cmplx} className="px-2 py-2">
                    {cfg ? (
                      <button onClick={() => onEdit(cfg)}
                        className="w-full py-2 px-3 rounded-lg text-sm font-bold text-center transition-all hover:scale-105 hover:shadow-card"
                        style={{ background: COMPETENCY_COLORS[comp] + '18', color: COMPETENCY_COLORS[comp], border: `1.5px solid ${COMPETENCY_COLORS[comp]}30` }}
                      >
                        {fmt.pct(Number(cfg.overhead_percent))}
                      </button>
                    ) : <div className="text-center text-coolslate text-xs">—</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InlineEditor({ cfg, onSave, onCancel, loading }: { cfg: CompetencyOverheadConfig; onSave: (v: number) => void; onCancel: () => void; loading: boolean }) {
  const [val, setVal] = useState(String((Number(cfg.overhead_percent) * 100).toFixed(1)));
  return (
    <div className="flex items-center gap-3 p-4 bg-lgrayblue/20 dark:bg-carbon-800/50 rounded-xl border border-lgrayblue/30 dark:border-slate-700">
      <div className="flex items-center gap-2 text-sm font-semibold text-carbon dark:text-white">
        <div className="w-2 h-2 rounded-full" style={{ background: COMPETENCY_COLORS[cfg.competency] }} />
        {cfg.competency} × {cfg.complexity}
      </div>
      <span className="text-coolslate">→</span>
      <div className="flex items-center gap-1">
        <input type="number" value={val} onChange={(e) => setVal(e.target.value)} min="0" max="100" step="0.5"
          className="w-20 px-2 py-1.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20 text-right font-mono"
        />
        <span className="text-sm text-coolslate">%</span>
      </div>
      <div className="flex gap-1">
        <Button size="xs" variant="success" icon={<Save size={12} />} onClick={() => onSave(parseFloat(val) / 100)} loading={loading}>Save</Button>
        <Button size="xs" variant="ghost" icon={<X size={12} />} onClick={onCancel} />
      </div>
    </div>
  );
}

export default function CompetencyPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { addToast } = useToastStore();
  const [editCfg, setEditCfg] = useState<CompetencyOverheadConfig | undefined>();
  const [activeTab, setActiveTab] = useState<'matrix' | 'definitions'>('matrix');

  const { data: overheads, isLoading: ohLoading } = useQuery({ queryKey: ['competency-overheads'], queryFn: masterApi.getOverheads, retry: false });
  const { data: defs, isLoading: defLoading } = useQuery({ queryKey: ['competency-defs'], queryFn: masterApi.getCompetencyDefs, retry: false });

  const updateMutation = useMutation({
    mutationFn: ({ id, overhead_percent }: { id: string; overhead_percent: number }) => masterApi.updateOverhead(id, overhead_percent),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['competency-overheads'] }); setEditCfg(undefined); addToast({ type: 'success', title: 'Overhead updated' }); },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2"><Users size={22} /> Competency Levels</h1>
          <p className="text-sm text-coolslate mt-0.5">Manage overhead percentages and competency definitions</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-lgrayblue/30 dark:bg-slate-700/40 rounded-lg p-1">
            <button onClick={() => navigate('/master/story-points')}
              className="px-4 py-1.5 rounded-md text-xs font-medium transition-all text-coolslate hover:text-carbon dark:hover:text-white">
              Story Points
            </button>
            <button className="px-4 py-1.5 rounded-md text-xs font-medium transition-all bg-white dark:bg-carbon-700 text-carbon dark:text-white shadow-sm">
              Competency Levels
            </button>
          </div>
          <div className="flex gap-1 bg-lgrayblue/30 dark:bg-slate-700/40 rounded-lg p-1">
            {(['matrix', 'definitions'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${activeTab === t ? 'bg-white dark:bg-carbon-700 text-carbon dark:text-white shadow-sm' : 'text-coolslate hover:text-carbon dark:hover:text-white'}`}
              >{t}</button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'matrix' && (
        <div className="space-y-4">
          <Card padding="p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-semibold text-carbon dark:text-white">Overhead Percentage Matrix</h2>
                <p className="text-xs text-coolslate mt-0.5">Click any cell to edit. Applied as: Revised = Initial × (1 + Overhead%)</p>
              </div>
              <div className="flex gap-3">
                {Object.entries(COMPETENCY_COLORS).map(([c, col]) => (
                  <div key={c} className="flex items-center gap-1.5 text-xs text-coolslate">
                    <div className="w-2 h-2 rounded-full" style={{ background: col }} />{c}
                  </div>
                ))}
              </div>
            </div>
            {ohLoading ? <Skeleton className="h-40" /> : <OverheadMatrix configs={overheads || []} onEdit={setEditCfg} />}
          </Card>

          {editCfg && (
            <InlineEditor cfg={editCfg}
              onSave={(v) => updateMutation.mutate({ id: editCfg.id, overhead_percent: v })}
              onCancel={() => setEditCfg(undefined)}
              loading={updateMutation.isPending}
            />
          )}

          {/* Full table */}
          <Card padding="p-0">
            <div className="px-5 py-4 border-b border-lgrayblue/30 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-carbon dark:text-white">All Configurations</h3>
            </div>
            <table className="w-full">
              <thead><tr className="border-b border-lgrayblue/20 dark:border-slate-700">
                {['Competency', 'Complexity', 'Overhead %', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-coolslate uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {(overheads || []).map((o) => (
                  <tr key={o.id} className="border-b border-lgrayblue/10 dark:border-slate-700/30 last:border-0 hover:bg-lgrayblue/5 dark:hover:bg-slate-700/10 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: COMPETENCY_COLORS[o.competency] }} />
                        <span className="text-sm font-medium text-carbon dark:text-white">{o.competency}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-coolslate">{o.complexity}</td>
                    <td className="px-5 py-3">
                      <span className="text-sm font-bold" style={{ color: COMPETENCY_COLORS[o.competency] }}>{fmt.pct(Number(o.overhead_percent))}</span>
                    </td>
                    <td className="px-5 py-3">
                      <Button variant="ghost" size="xs" icon={<Edit2 size={13} />} onClick={() => setEditCfg(o)}>Edit</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {activeTab === 'definitions' && (
        <div className="space-y-4">
          {defLoading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : (defs || []).map((def) => (
            <Card key={def.id} padding="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                  style={{ background: COMPETENCY_COLORS[def.level] }}>
                  {def.level[0]}
                </div>
                <div>
                  <h3 className="font-display font-semibold text-carbon dark:text-white">{def.level}</h3>
                  <p className="text-xs text-coolslate">{def.description}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Knowledge Depth', value: def.knowledge_depth },
                  { label: 'Independence', value: def.independence },
                  { label: 'Problem Solving', value: def.problem_solving },
                  { label: 'Communication', value: def.communication },
                  { label: 'Mentorship', value: def.mentorship },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs font-semibold text-coolslate uppercase tracking-wide mb-1">{label}</p>
                    <p className="text-sm text-carbon dark:text-lgrayblue">{value}</p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
