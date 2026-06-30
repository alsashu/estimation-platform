import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Target, Plus, Edit2, Trash2 } from 'lucide-react';
import { masterApi } from '../../services/api';
import { Button, Card, Modal, ConfirmDialog, EmptyState, Skeleton, SPDot } from '../../components/ui';
import { useToastStore } from '../../store';
import { SP_COLORS } from '../../config/theme';
import type { StoryPointConfig, ComplexityLevel, RiskLevel } from '../../types';

const COMPLEXITIES: ComplexityLevel[] = ['Low', 'Medium', 'High', 'Very High', 'Unmanageable'];
const RISKS: RiskLevel[] = ['Low', 'Medium', 'High', 'Very High', 'Unknown'];

function SPCell({ sp }: { sp?: StoryPointConfig; onAdd?: () => void }) {
  if (!sp) return (
    <div className="h-14 flex items-center justify-center rounded-lg border-2 border-dashed border-lgrayblue/30 dark:border-slate-700 text-coolslate text-xs cursor-pointer hover:border-carbon/30 dark:hover:border-slate-500 transition-colors">
      —
    </div>
  );
  return (
    <div className="h-14 flex flex-col items-center justify-center rounded-lg text-white font-bold text-sm cursor-pointer transition-all hover:scale-105 hover:shadow-card"
      style={{ background: sp.color_hex }}>
      {sp.story_points}
    </div>
  );
}

function SPModal({ sp, isOpen, onClose, onSave, loading }: {
  sp?: StoryPointConfig; isOpen: boolean; onClose: () => void;
  onSave: (data: { story_points: number; color_hex: string; complexity?: string; risk?: string }) => void;
  loading: boolean;
}) {
  const [storyPoints, setStoryPoints] = useState(String(sp?.story_points || ''));
  const [color, setColor] = useState(sp?.color_hex || '#1E3246');
  const [complexity, setComplexity] = useState<ComplexityLevel>((sp?.complexity as ComplexityLevel) || 'Low');
  const [risk, setRisk] = useState<RiskLevel>((sp?.risk as RiskLevel) || 'Low');

  const isNew = !sp;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isNew ? 'Add Story Point Mapping' : 'Edit Story Points'}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave({ story_points: parseInt(storyPoints), color_hex: color, ...(isNew && { complexity, risk }) })} loading={loading} disabled={!storyPoints}>
          {isNew ? 'Add Mapping' : 'Save Changes'}
        </Button>
      </>}
    >
      <div className="space-y-4">
        {isNew && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Complexity</label>
                <select value={complexity} onChange={(e) => setComplexity(e.target.value as ComplexityLevel)}
                  className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20">
                  {COMPLEXITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Risk</label>
                <select value={risk} onChange={(e) => setRisk(e.target.value as RiskLevel)}
                  className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20">
                  {RISKS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
          </>
        )}
        {sp && (
          <div className="grid grid-cols-2 gap-2 bg-lgrayblue/20 dark:bg-carbon-800/50 rounded-lg p-3 text-sm">
            <div><span className="text-coolslate">Complexity:</span> <span className="font-medium text-carbon dark:text-white">{sp.complexity}</span></div>
            <div><span className="text-coolslate">Risk:</span> <span className="font-medium text-carbon dark:text-white">{sp.risk}</span></div>
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Story Points</label>
          <input type="number" value={storyPoints} onChange={(e) => setStoryPoints(e.target.value)} min="1" placeholder="e.g. 8"
            className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Colour</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
              className="w-12 h-9 rounded-lg border border-lgrayblue dark:border-slate-600 cursor-pointer"
            />
            <input type="text" value={color} onChange={(e) => setColor(e.target.value)} placeholder="#1E3246"
              className="flex-1 px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20 font-mono"
            />
            <div className="w-10 h-10 rounded-lg shadow-sm flex-shrink-0" style={{ background: color }} />
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {Object.entries(SP_COLORS).map(([sp, hex]) => (
              <button key={sp} onClick={() => setColor(hex)} className="w-6 h-6 rounded-md hover:scale-110 transition-transform" style={{ background: hex }} title={`SP ${sp}`} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function StoryPointsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { addToast } = useToastStore();
  const [editSP, setEditSP] = useState<StoryPointConfig | undefined>();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteSP, setDeleteSP] = useState<StoryPointConfig | undefined>();

  const { data: configs, isLoading } = useQuery({ queryKey: ['story-points'], queryFn: masterApi.getStoryPoints, retry: false });

  const getConfig = (c: ComplexityLevel, r: RiskLevel) => configs?.find(s => s.complexity === c && s.risk === r);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => masterApi.updateStoryPoint(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['story-points'] }); setEditSP(undefined); addToast({ type: 'success', title: 'Updated' }); },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });

  const createMutation = useMutation({
    mutationFn: masterApi.createStoryPoint,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['story-points'] }); setShowAdd(false); addToast({ type: 'success', title: 'Mapping added' }); },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => masterApi.deleteStoryPoint(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['story-points'] }); setDeleteSP(undefined); addToast({ type: 'success', title: 'Deleted' }); },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2"><Target size={22} /> Story Points</h1>
          <p className="text-sm text-coolslate mt-0.5">Manage Complexity × Risk → Story Point mappings</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-lgrayblue/30 dark:bg-slate-700/40 rounded-lg p-1">
            <button className="px-4 py-1.5 rounded-md text-xs font-medium transition-all bg-white dark:bg-carbon-700 text-carbon dark:text-white shadow-sm">
              Story Points
            </button>
            <button onClick={() => navigate('/master/competency')}
              className="px-4 py-1.5 rounded-md text-xs font-medium transition-all text-coolslate hover:text-carbon dark:hover:text-white">
              Competency Levels
            </button>
          </div>
          <Button icon={<Plus size={16} />} onClick={() => setShowAdd(true)}>Add Mapping</Button>
        </div>
      </div>

      {/* Matrix view */}
      <Card padding="p-5">
        <h2 className="font-semibold text-carbon dark:text-white mb-4 text-sm">Story Point Matrix</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-xs font-semibold text-coolslate pb-3 pr-3 text-left">Complexity \ Risk</th>
                {RISKS.map(r => <th key={r} className="text-xs font-semibold text-coolslate pb-3 px-2 text-center min-w-[80px]">{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {COMPLEXITIES.map(c => (
                <tr key={c}>
                  <td className="text-xs font-semibold text-coolslate pr-3 py-1 whitespace-nowrap">{c}</td>
                  {RISKS.map(r => {
                    const sp = getConfig(c, r);
                    return (
                      <td key={r} className="px-2 py-1">
                        {isLoading ? <Skeleton className="h-14 rounded-lg" /> : (
                          <div onClick={() => sp && setEditSP(sp)} className="relative group">
                            <SPCell sp={sp} />
                            {sp && (
                              <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); setEditSP(sp); }} className="p-0.5 bg-white/80 rounded text-carbon hover:bg-white">
                                  <Edit2 size={10} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setDeleteSP(sp); }} className="p-0.5 bg-white/80 rounded text-vibrant hover:bg-white">
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-lgrayblue/20 dark:border-slate-700">
          {Object.entries(SP_COLORS).map(([sp, hex]) => (
            <div key={sp} className="flex items-center gap-1.5 text-xs text-coolslate"><SPDot color={hex} />{sp} SP</div>
          ))}
        </div>
      </Card>

      {/* List view */}
      <Card padding="p-0">
        <div className="px-5 py-4 border-b border-lgrayblue/30 dark:border-slate-700">
          <h2 className="font-semibold text-carbon dark:text-white text-sm">{configs?.length || 0} Configurations</h2>
        </div>
        <table className="w-full">
          <thead><tr className="border-b border-lgrayblue/20 dark:border-slate-700">
            {['Complexity', 'Risk', 'Story Points', 'Colour', 'Actions'].map(h => (
              <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-coolslate uppercase tracking-wide">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {(configs || []).map((sp) => (
              <tr key={sp.id} className="border-b border-lgrayblue/10 dark:border-slate-700/30 last:border-0 hover:bg-lgrayblue/5 dark:hover:bg-slate-700/10 transition-colors">
                <td className="px-5 py-3 text-sm font-medium text-carbon dark:text-white">{sp.complexity}</td>
                <td className="px-5 py-3 text-sm text-coolslate">{sp.risk}</td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: sp.color_hex }}>
                    <SPDot color={sp.color_hex} />{sp.story_points} SP
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded" style={{ background: sp.color_hex }} />
                    <span className="text-xs font-mono text-coolslate">{sp.color_hex}</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-2">
                    <Button variant="ghost" size="xs" icon={<Edit2 size={13} />} onClick={() => setEditSP(sp)}>Edit</Button>
                    <Button variant="ghost" size="xs" icon={<Trash2 size={13} />} onClick={() => setDeleteSP(sp)} className="text-vibrant hover:text-vibrant">Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <SPModal sp={editSP} isOpen={!!editSP} onClose={() => setEditSP(undefined)}
        onSave={(data) => editSP && updateMutation.mutate({ id: editSP.id, data })}
        loading={updateMutation.isPending}
      />
      <SPModal isOpen={showAdd} onClose={() => setShowAdd(false)}
        onSave={(data) => createMutation.mutate(data as any)}
        loading={createMutation.isPending}
      />
      <ConfirmDialog isOpen={!!deleteSP} onClose={() => setDeleteSP(undefined)}
        onConfirm={() => deleteSP && deleteMutation.mutate(deleteSP.id)}
        loading={deleteMutation.isPending}
        title="Delete Story Point Mapping"
        message={`Remove the mapping for ${deleteSP?.complexity} / ${deleteSP?.risk} (${deleteSP?.story_points} SP)?`}
      />
    </div>
  );
}
