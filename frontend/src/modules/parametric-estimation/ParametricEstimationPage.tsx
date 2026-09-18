import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sigma, Save, Info, Loader2, TrendingUp, CheckCircle2 } from 'lucide-react';
import { parametricEstimationsApi } from '../../services/api';
import { useProjectStore } from '../../store/projectStore';
import { useToastStore } from '../../store';
import { Card, Button, Badge, Tooltip } from '../../components/ui';
import { cn } from '../../utils/formatters';
import type { ParametricSize } from '../../types';
import { ParametricExcelUpload } from './ParametricExcelUpload';

const SIZE_OPTIONS: ParametricSize[] = ['Small', 'Medium', 'Large', 'NA'];

const TEAM_EFFICIENCY_OPTIONS = [
  { value: '1',   label: 'Experienced — 100%' },
  { value: '0.8', label: 'Intermediate — 80%' },
  { value: '0.5', label: 'Beginner — 50%' },
];

type FieldKey = 'middleware_inputs' | 'application' | 'system_configuration' | 'data_and_control_flow' | 'use_case';

const FIELD_DEFS: { key: FieldKey; label: string; hint: string }[] = [
  { key: 'middleware_inputs',     label: 'Middleware Inputs',      hint: 'Complexity of the middleware / API inputs required.' },
  { key: 'application',           label: 'Application',            hint: 'Application-layer development effort.' },
  { key: 'system_configuration',  label: 'System Configuration',   hint: 'System / environment configuration effort.' },
  { key: 'data_and_control_flow', label: 'Data and Control Flow',  hint: 'Data and control-flow complexity.' },
  { key: 'use_case',              label: 'Use Case',               hint: 'Use-case scope and count.' },
];

const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20 focus:border-carbon transition-colors';
const labelClass = 'text-sm font-medium text-carbon dark:text-lgrayblue flex items-center gap-1 mb-1';

interface FormData {
  task_title: string;
  project_id: string;
  description: string;
  work_group: string;
  middleware_inputs: ParametricSize | '';
  application: ParametricSize | '';
  system_configuration: ParametricSize | '';
  data_and_control_flow: ParametricSize | '';
  use_case: ParametricSize | '';
  team_efficiency: string;
}

type TabKey = 'estimate' | 'upload';

function ResultsPanel({
  calculating, canCalculate, calc, error,
}: {
  calculating: boolean;
  canCalculate: boolean;
  calc?: import('../../types').ParametricCalculationResult;
  error?: Error | null;
}) {
  if (!canCalculate) {
    return (
      <Card className="bg-carbon/3 dark:bg-carbon-800/50 border-dashed border-lgrayblue/40" padding="p-4">
        <p className="text-xs text-coolslate text-center">Select all five complexity inputs and team efficiency to see the calculation.</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card padding="p-4" className="border-vibrant/30 bg-vibrant/5">
        <p className="text-xs text-vibrant font-medium">{error.message}</p>
      </Card>
    );
  }

  if (calculating || !calc) {
    return (
      <Card padding="p-6" className="flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-coolslate" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="p-4" className="bg-gradient-to-br from-carbon/3 to-transparent dark:from-carbon-800/50 border-carbon/10">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} className="text-gold" />
          <span className="text-xs font-semibold text-carbon dark:text-white uppercase tracking-wide">Calculation Results</span>
        </div>
        <div className="space-y-2 text-xs">
          <div className="bg-white/60 dark:bg-carbon-700/50 rounded-lg p-2.5 flex items-center justify-between">
            <span className="text-coolslate">Multiplier (1 / Team Efficiency)</span>
            <span className="font-semibold text-carbon dark:text-white">{calc.multiplier}</span>
          </div>
          <div className={cn('rounded-lg p-2.5 flex items-center justify-between', calc.final_basis === 'detailed' ? 'bg-greenline/10 border border-greenline/20' : 'bg-white/60 dark:bg-carbon-700/50')}>
            <span className="text-coolslate flex items-center gap-1">
              Detailed Estimation
              {calc.final_basis === 'detailed' && <CheckCircle2 size={11} className="text-greenline" />}
            </span>
            <span className="font-semibold text-carbon dark:text-white">{calc.detailed_estimation.toFixed(2)} PD</span>
          </div>
          <div className={cn('rounded-lg p-2.5 flex items-center justify-between', calc.final_basis === 'average' ? 'bg-greenline/10 border border-greenline/20' : 'bg-white/60 dark:bg-carbon-700/50')}>
            <span className="text-coolslate flex items-center gap-1">
              Average Estimation
              {calc.final_basis === 'average' && <CheckCircle2 size={11} className="text-greenline" />}
            </span>
            <span className="font-semibold text-carbon dark:text-white">{calc.average_estimation.toFixed(2)} PD</span>
          </div>
        </div>
        <div className="bg-carbon dark:bg-carbon-800 rounded-xl p-4 text-center mt-3">
          <p className="text-white/60 text-xs uppercase tracking-wide">Final Estimation</p>
          <p className="text-white text-2xl font-display font-bold mt-1">{calc.final_estimation.toFixed(2)} PD</p>
          <p className="text-white/40 text-[11px] mt-1">= MAX(Detailed, Average) — driven by {calc.final_basis}</p>
        </div>
      </Card>

      <Card padding="p-4">
        <p className="text-xs font-semibold text-coolslate uppercase tracking-wide mb-2">Master Data In Use</p>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-coolslate">Expert Judgement</span><Badge variant="info">{calc.expert_config.name}</Badge></div>
          <div className="flex justify-between"><span className="text-coolslate">Average Estimation</span><Badge variant="info">{calc.average_config.name}</Badge></div>
        </div>
      </Card>
    </div>
  );
}

export default function ParametricEstimationPage() {
  const { addToast } = useToastStore();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { selectedProjectId, projects } = useProjectStore();
  const [tab, setTab] = useState<TabKey>('estimate');

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      task_title: '', project_id: selectedProjectId ?? '', description: '', work_group: '',
      middleware_inputs: '', application: '', system_configuration: '', data_and_control_flow: '', use_case: '',
      team_efficiency: '1',
    },
  });

  const values = watch();
  const canCalculate = FIELD_DEFS.every(f => values[f.key]) && !!values.team_efficiency;

  const { data: calc, isFetching: calculating, error } = useQuery({
    queryKey: ['parametric-calc', values.project_id, values.middleware_inputs, values.application, values.system_configuration, values.data_and_control_flow, values.use_case, values.team_efficiency],
    queryFn: () => parametricEstimationsApi.calculate({
      project_id: values.project_id || undefined,
      middleware_inputs: values.middleware_inputs as ParametricSize,
      application: values.application as ParametricSize,
      system_configuration: values.system_configuration as ParametricSize,
      data_and_control_flow: values.data_and_control_flow as ParametricSize,
      use_case: values.use_case as ParametricSize,
      team_efficiency: Number(values.team_efficiency),
    }),
    enabled: canCalculate,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (data: FormData) => parametricEstimationsApi.create({
      task_title: data.task_title,
      project_id: data.project_id || undefined,
      description: data.description || undefined,
      work_group: data.work_group || undefined,
      middleware_inputs: data.middleware_inputs as ParametricSize,
      application: data.application as ParametricSize,
      system_configuration: data.system_configuration as ParametricSize,
      data_and_control_flow: data.data_and_control_flow as ParametricSize,
      use_case: data.use_case as ParametricSize,
      team_efficiency: Number(data.team_efficiency),
    }),
    onSuccess: (row) => {
      addToast({ type: 'success', title: 'Parametric estimation saved', message: `${row.task_title} — ${Number(row.final_estimation).toFixed(2)} PersonDays` });
      qc.invalidateQueries({ queryKey: ['parametric-estimations'] });
      reset({
        task_title: '', project_id: values.project_id, description: '', work_group: values.work_group,
        middleware_inputs: '', application: '', system_configuration: '', data_and_control_flow: '', use_case: '',
        team_efficiency: '1',
      });
      navigate('/parametric-history');
    },
    onError: (e: Error) => addToast({ type: 'error', title: 'Failed to save', message: e.message }),
  });

  const onSubmit = (data: FormData) => {
    if (!canCalculate) return;
    saveMutation.mutate(data);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2">
            <Sigma size={22} /> Parametric Estimation
          </h1>
          <p className="text-sm text-coolslate mt-0.5">Estimate effort using configurable Expert Judgement and Average master data.</p>
        </div>
        <div className="flex gap-1 bg-lgrayblue/30 dark:bg-slate-700/40 rounded-lg p-1">
          {([
            { key: 'estimate', label: 'New Estimation' },
            { key: 'upload', label: 'Excel Upload' },
          ] as { key: TabKey; label: string }[]).map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={cn('px-4 py-1.5 rounded-md text-xs font-medium transition-all',
                tab === t.key ? 'bg-white dark:bg-carbon-700 text-carbon dark:text-white shadow-sm' : 'text-coolslate hover:text-carbon dark:hover:text-white')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'estimate' && (
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5 min-w-0">
              {/* Task details */}
              <Card padding="p-5">
                <h2 className="font-display font-semibold text-carbon dark:text-white mb-4">Task Details</h2>
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Task Title *</label>
                    <input {...register('task_title', { required: 'Task title is required' })}
                      placeholder="e.g. Customer Onboarding API Integration" className={inputClass} />
                    {errors.task_title && <p className="text-xs text-vibrant mt-1">{errors.task_title.message}</p>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Project</label>
                      <select {...register('project_id')} className={inputClass}>
                        <option value="">No project (use default master data)</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Work Group</label>
                      <input {...register('work_group')} placeholder="e.g. DEVELOPMENT" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Description</label>
                    <textarea {...register('description')} rows={2} placeholder="Brief description of the task…" className={cn(inputClass, 'resize-none')} />
                  </div>
                </div>
              </Card>

              {/* Complexity inputs */}
              <Card padding="p-5">
                <h2 className="font-display font-semibold text-carbon dark:text-white mb-1">Complexity Inputs</h2>
                <p className="text-xs text-coolslate mb-4">Select the size for each parameter, or NA if it does not apply to this task.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {FIELD_DEFS.map((f) => (
                    <div key={f.key}>
                      <label className={labelClass}>
                        {f.label} *
                        <Tooltip content={f.hint}><Info size={12} className="text-coolslate cursor-help" /></Tooltip>
                      </label>
                      <select {...register(f.key, { required: true })} className={inputClass}>
                        <option value="">Select…</option>
                        {SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  ))}
                  <div>
                    <label className={labelClass}>Team Efficiency *</label>
                    <select {...register('team_efficiency', { required: true })} className={inputClass}>
                      {TEAM_EFFICIENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              </Card>

              {/* Calculation breakdown */}
              {canCalculate && calc && (
                <Card padding="p-5">
                  <h2 className="font-display font-semibold text-carbon dark:text-white mb-4">Calculation Breakdown</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-lgrayblue/30 dark:border-slate-700">
                          {['Field', 'Selected Size', 'Detailed Value', 'Average Value'].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-coolslate uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {calc.breakdown.map((b) => (
                          <tr key={b.field} className="border-b border-lgrayblue/10 dark:border-slate-700/30 last:border-0">
                            <td className="px-3 py-2 font-medium text-carbon dark:text-white">{b.label}</td>
                            <td className="px-3 py-2">
                              <Badge variant={b.size === 'NA' ? 'neutral' : 'default'}>{b.size}</Badge>
                            </td>
                            <td className="px-3 py-2 text-carbon dark:text-white">{b.detailed_value}</td>
                            <td className="px-3 py-2 text-carbon dark:text-white">{b.average_value}</td>
                          </tr>
                        ))}
                        <tr className="bg-lgrayblue/10 dark:bg-carbon-800/40 font-semibold">
                          <td className="px-3 py-2 text-carbon dark:text-white" colSpan={2}>Sum × Multiplier ({calc.multiplier})</td>
                          <td className="px-3 py-2 text-carbon dark:text-white">{calc.detailed_estimation.toFixed(2)}</td>
                          <td className="px-3 py-2 text-carbon dark:text-white">{calc.average_estimation.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              <div className="flex justify-end">
                <Button type="submit" variant="success" loading={saveMutation.isPending} disabled={!canCalculate}>
                  <Save size={15} /> Save Estimation
                </Button>
              </div>
            </div>

            {/* Results sidebar */}
            <div className="space-y-4 min-w-0">
              <ResultsPanel calculating={calculating} canCalculate={canCalculate} calc={calc} error={error as Error | null} />
            </div>
          </div>
        </form>
      )}

      {tab === 'upload' && (
        <ParametricExcelUpload onSuccess={() => qc.invalidateQueries({ queryKey: ['parametric-estimations'] })} />
      )}
    </div>
  );
}
