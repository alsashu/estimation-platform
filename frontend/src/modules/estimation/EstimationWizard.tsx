import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Calculator, ChevronRight, ChevronLeft, Zap, Info } from 'lucide-react';
import { estimationsApi, masterApi } from '../../services/api';
import { useProjectStore } from '../../store/projectStore';
import { Button, Card, StepIndicator, Modal, SPDot } from '../../components/ui';
import { useToastStore } from '../../store';
import { fmt, cn } from '../../utils/formatters';
import { SP_COLORS, COMPLEXITY_COLORS, RISK_COLORS, COMPETENCY_COLORS } from '../../config/theme';
import type { ComplexityLevel, RiskLevel, CompetencyLevel, WorkGroup, CalculationResult } from '../../types';

const COMPLEXITIES: ComplexityLevel[] = ['Low', 'Medium', 'High', 'Very High', 'Unmanageable'];
const RISKS: RiskLevel[] = ['Low', 'Medium', 'High', 'Very High', 'Unknown'];
const COMPETENCIES: CompetencyLevel[] = ['Emerging', 'Competent', 'Expert'];
const WORK_GROUPS: WorkGroup[] = ['DEVELOPMENT', 'VALIDATION', 'SPECIFICATION'];

const COMPLEXITY_DESC: Record<ComplexityLevel, string> = {
  'Low': 'Single feature within a module. Clear, unambiguous requirements.',
  'Medium': 'Multiple related features within a module. Mostly clear requirements.',
  'High': 'Multiple features across modules. Complex, may require workshops.',
  'Very High': 'Spans multiple systems or domains. Highly ambiguous requirements.',
  'Unmanageable': 'Spans platforms, possibly involves external vendors or legacy systems.',
};

const RISK_DESC: Record<RiskLevel, string> = {
  'Low': 'Affects a small isolated feature. Fully documented and agreed.',
  'Medium': 'Impacts a specific module. Mostly clear requirements.',
  'High': 'Affects multiple modules. Ambiguous, evolving requirements.',
  'Very High': 'Impacts core platform. High probability of critical failures.',
  'Unknown': 'Insufficient information to determine scope or impact.',
};

const COMPETENCY_DESC: Record<CompetencyLevel, string> = {
  'Emerging': 'Basic knowledge, needs guidance, less than 3 years of experience.',
  'Competent': 'Works independently, good knowledge, 3–6 years of experience.',
  'Expert': 'Leads solutions, deep expertise, more than 6 years of experience.',
};

interface FormData {
  title: string;
  project_name: string;
  description: string;
  notes: string;
  complexity: ComplexityLevel | '';
  risk: RiskLevel | '';
  competency: CompetencyLevel | '';
  work_group: WorkGroup | '';
}

function LivePreview({ calc, complexity, risk, competency }: { calc?: CalculationResult; complexity: string; risk: string; competency: string }) {
  if (!complexity || !risk) {
    return (
      <Card className="bg-carbon/3 dark:bg-carbon-800/50 border-dashed border-lgrayblue/40" padding="p-4">
        <p className="text-xs text-coolslate text-center">Select Complexity and Risk to see the preview</p>
      </Card>
    );
  }
  return (
    <Card padding="p-4" className="bg-gradient-to-br from-carbon/3 to-transparent dark:from-carbon-800/50 border-carbon/10 overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={14} className="text-gold" />
        <span className="text-xs font-semibold text-carbon dark:text-white uppercase tracking-wide">Live Preview</span>
      </div>
      {calc ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SPDot color={SP_COLORS[calc.story_points] || '#788291'} size={10} />
            <span className="text-xl font-display font-bold text-carbon dark:text-white">{calc.story_points} SP</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: 'Initial Min', value: fmt.range(calc.initial_min_days, calc.initial_max_days, 'days') },
              { label: 'Initial Hrs', value: fmt.range(calc.initial_min_hours, calc.initial_max_hours, 'hrs') },
              { label: 'Overhead', value: fmt.pct(calc.overhead_percent) },
              { label: '', value: '' },
            ].map(({ label, value }) => label ? (
              <div key={label} className="bg-white/60 dark:bg-carbon-700/50 rounded-lg p-2 min-w-0">
                <p className="text-coolslate truncate">{label}</p>
                <p className="font-semibold text-carbon dark:text-white truncate">{value}</p>
              </div>
            ) : null)}
          </div>
          {competency && (
            <div className="bg-greenline/10 border border-greenline/20 rounded-lg p-3 mt-1">
              <p className="text-xs text-coolslate mb-1">Revised Estimate</p>
              <p className="text-sm font-bold text-greenline">{fmt.range(calc.revised_min_hours, calc.revised_max_hours, 'hrs')}</p>
              <p className="text-xs text-greenline/80">{fmt.range(calc.revised_min_days, calc.revised_max_days, 'days')}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="animate-pulse space-y-2">
          <div className="h-6 bg-lgrayblue/40 rounded w-20" />
          <div className="h-4 bg-lgrayblue/40 rounded w-32" />
        </div>
      )}
    </Card>
  );
}

export default function EstimationWizard() {
  const navigate = useNavigate();
  const { addToast } = useToastStore();
  const { selectedProjectId, projects } = useProjectStore();
  const [step, setStep] = useState(0);
  const [showDocModal, setShowDocModal] = useState(false);
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    defaultValues: { title: '', project_name: '', description: '', notes: '', complexity: '', risk: '', competency: '', work_group: '' },
  });

  // Auto-populate project name from selected project
  useEffect(() => {
    if (selectedProjectId) {
      const proj = projects.find(p => p.id === selectedProjectId);
      if (proj) setValue('project_name', proj.name);
    }
  }, [selectedProjectId, projects, setValue]);

  const complexity = watch('complexity');
  const risk = watch('risk');
  const competency = watch('competency');
  const workGroup = watch('work_group');

  // Live calculation
  const { data: calc } = useQuery({
    queryKey: ['calc', complexity, risk, competency],
    queryFn: () => estimationsApi.calculate({ complexity, risk, competency: competency || 'Competent' }),
    enabled: !!complexity && !!risk,
    retry: false,
  });

  const { data: competencyDefs } = useQuery({ queryKey: ['competency-defs'], queryFn: masterApi.getCompetencyDefs, retry: false });

  const mutation = useMutation({
    mutationFn: estimationsApi.create,
    onSuccess: (data) => {
      addToast({ type: 'success', title: 'Estimation saved!', message: `"${data.title}" — ${data.story_points} SP` });
      navigate('/history');
    },
    onError: (err: Error) => addToast({ type: 'error', title: 'Failed to save', message: err.message }),
  });

  const onSubmit = (data: FormData) => {
    if (!data.complexity || !data.risk || !data.competency || !data.work_group) return;
    mutation.mutate({
      ...data,
      complexity: data.complexity,
      risk: data.risk,
      competency: data.competency,
      work_group: data.work_group,
      project_id: selectedProjectId ?? undefined,
    });
  };

  const canNext0 = !!complexity && !!risk && !!workGroup;
  const canNext1 = !!competency;

  function RadioGroup<T extends string>({ options, value, onChange, colors, descriptions }: {
    options: T[]; value: string; onChange: (v: T) => void;
    colors: Record<string, string>; descriptions: Record<string, string>;
  }) {
    return (
      <div className="space-y-2">
        {options.map((opt) => (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className={cn(
              'w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all duration-150',
              value === opt
                ? 'border-carbon dark:border-lgrayblue bg-carbon/5 dark:bg-white/5'
                : 'border-lgrayblue/30 dark:border-slate-700 hover:border-carbon/30 dark:hover:border-slate-500 hover:bg-lgrayblue/10'
            )}
          >
            <span className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all"
              style={{ borderColor: colors[opt], background: value === opt ? colors[opt] : 'transparent' }}>
              {value === opt && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-carbon dark:text-white block">{opt}</span>
              <p className="text-xs text-coolslate mt-0.5 break-words line-clamp-2">{descriptions[opt]}</p>
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2">
            <Calculator size={22} /> Storypoint Estimation
          </h1>
          <p className="text-sm text-coolslate mt-0.5">Follow the steps to calculate revised effort estimates</p>
        </div>
        <Button variant="ghost" size="sm" icon={<Info size={15} />} onClick={() => setShowDocModal(true)}>How it works</Button>
      </div>

      <div className="flex justify-center mb-8">
        <StepIndicator steps={['Classify Task', 'Assign Competency', 'Review & Save']} current={step} />
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main content */}
          <div className="lg:col-span-2 min-w-0 overflow-hidden">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div key="step0" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="space-y-5 w-full min-w-0">
                  <Card padding="p-5" className="overflow-hidden">
                    <h2 className="font-display font-semibold text-carbon dark:text-white mb-4">Task Details</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Task Title *</label>
                        <input {...register('title', { required: 'Title is required' })}
                          placeholder="e.g. Login Feature Redesign"
                          className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20 focus:border-carbon transition-colors"
                        />
                        {errors.title && <p className="text-xs text-vibrant mt-1">{errors.title.message}</p>}
                      </div>
                      <div>
                        <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Project</label>
                        <input {...register('project_name')} placeholder="e.g. Portal v3"
                          className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20 focus:border-carbon transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Description</label>
                        <textarea {...register('description')} rows={2} placeholder="Brief description of the task…"
                          className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20 focus:border-carbon transition-colors resize-none"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Work Group *</label>
                        <select {...register('work_group', { required: true })}
                          className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20 focus:border-carbon transition-colors"
                        >
                          <option value="">Select work group…</option>
                          {WORK_GROUPS.map((wg) => <option key={wg} value={wg}>{wg}</option>)}
                        </select>
                      </div>
                    </div>
                  </Card>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Card padding="p-5" className="min-w-0 overflow-hidden">
                      <h3 className="font-semibold text-carbon dark:text-white mb-3 text-sm">Complexity Level *</h3>
                      <RadioGroup options={COMPLEXITIES} value={complexity} onChange={(v) => setValue('complexity', v)} colors={COMPLEXITY_COLORS} descriptions={COMPLEXITY_DESC} />
                    </Card>
                    <Card padding="p-5" className="min-w-0 overflow-hidden">
                      <h3 className="font-semibold text-carbon dark:text-white mb-3 text-sm">Risk Level *</h3>
                      <RadioGroup options={RISKS} value={risk} onChange={(v) => setValue('risk', v)} colors={RISK_COLORS} descriptions={RISK_DESC} />
                    </Card>
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" onClick={() => canNext0 && setStep(1)} disabled={!canNext0}
                      icon={<ChevronRight size={16} />} iconRight>
                      Next: Competency
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="space-y-5 w-full min-w-0">
                  <Card padding="p-5" className="overflow-hidden">
                    <h2 className="font-display font-semibold text-carbon dark:text-white mb-1">Assign Competency Level</h2>
                    <p className="text-xs text-coolslate mb-4">Select the competency level of the engineer(s) who will perform this task.</p>
                    <RadioGroup options={COMPETENCIES} value={competency} onChange={(v) => setValue('competency', v)} colors={COMPETENCY_COLORS} descriptions={COMPETENCY_DESC} />
                  </Card>
                  {calc && competency && (
                    <Card padding="p-4" className="bg-carbon/3 dark:bg-carbon-800/40">
                      <p className="text-xs text-coolslate mb-2">Overhead calculation</p>
                      <p className="text-sm text-carbon dark:text-white">
                        <span className="font-semibold">{competency}</span> × <span className="font-semibold">{complexity}</span> = <span className="font-bold text-gold">{fmt.pct(calc.overhead_percent)}</span> overhead
                      </p>
                      <p className="text-xs text-coolslate mt-1">Revised = Initial × (1 + {fmt.pct(calc.overhead_percent)})</p>
                    </Card>
                  )}
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" icon={<ChevronLeft size={16} />} onClick={() => setStep(0)}>Back</Button>
                    <Button type="button" onClick={() => canNext1 && setStep(2)} disabled={!canNext1} iconRight icon={<ChevronRight size={16} />}>
                      Review & Save
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="space-y-5 w-full min-w-0">
                  <Card padding="p-5" className="overflow-hidden">
                    <h2 className="font-display font-semibold text-carbon dark:text-white mb-4">Estimation Summary</h2>
                    <div className="space-y-3">
                      {[
                        ['Task', watch('title')], ['Project', watch('project_name') || '—'],
                        ['Complexity', complexity], ['Risk', risk], ['Competency', competency],
                        ['Work Group', workGroup],
                      ].map(([l, v]) => (
                        <div key={l} className="flex justify-between gap-4 text-sm border-b border-lgrayblue/20 dark:border-slate-700/50 pb-2 last:border-0">
                          <span className="text-coolslate flex-shrink-0">{l}</span>
                          <span className="font-medium text-carbon dark:text-white text-right truncate">{v}</span>
                        </div>
                      ))}
                    </div>
                    {calc && (
                      <div className="mt-4 space-y-2">
                        <div className="bg-lgrayblue/20 dark:bg-carbon-800/50 rounded-lg p-3 space-y-1.5 text-xs">
                          <p className="font-semibold text-carbon dark:text-white text-sm mb-2">Calculation Chain</p>
                          {[
                            [`${complexity} + ${risk}`, `Story Points: ${calc.story_points}`],
                            [`SP ${calc.story_points}`, `${fmt.range(calc.initial_min_days, calc.initial_max_days, 'days')} initial`],
                            [`${competency} × ${complexity}`, `${fmt.pct(calc.overhead_percent)} overhead`],
                            [`Initial × (1 + ${fmt.pct(calc.overhead_percent)})`, `${fmt.range(calc.revised_min_days, calc.revised_max_days, 'days')} revised`],
                            [`Days × 8`, `${fmt.range(calc.revised_min_hours, calc.revised_max_hours, 'hrs')} revised`],
                          ].map(([input, output], i) => (
                            <div key={i} className="flex items-start justify-between gap-2 min-w-0">
                              <span className="text-coolslate min-w-0 break-words">{input}</span>
                              <span className="text-carbon dark:text-white font-medium flex-shrink-0">→ {output}</span>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          {[
                            { label: 'Revised Min', days: calc.revised_min_days, hours: calc.revised_min_hours },
                            { label: 'Revised Max', days: calc.revised_max_days, hours: calc.revised_max_hours },
                          ].map((col) => (
                            <div key={col.label} className="bg-carbon dark:bg-carbon-800 rounded-xl p-3 text-center min-w-0">
                              <p className="text-white/60 text-xs">{col.label}</p>
                              <p className="text-white text-lg font-display font-bold">{Number(col.hours).toFixed(1)} hrs</p>
                              <p className="text-white/50 text-xs">{Number(col.days).toFixed(2)} days</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-4">
                      <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Notes</label>
                      <textarea {...register('notes')} rows={2} placeholder="Additional notes or assumptions…"
                        className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20 focus:border-carbon transition-colors resize-none"
                      />
                    </div>
                  </Card>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" icon={<ChevronLeft size={16} />} onClick={() => setStep(1)}>Back</Button>
                    <Button type="submit" variant="success" loading={mutation.isPending}>Save Estimation</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sidebar preview */}
          <div className="space-y-4 min-w-0">
            <LivePreview calc={calc} complexity={complexity} risk={risk} competency={competency} />
          </div>
        </div>
      </form>

      <Modal isOpen={showDocModal} onClose={() => setShowDocModal(false)} title="How Estimation Works" size="lg">
        <div className="space-y-3 text-sm text-coolslate">
          {[
            ['Step 1', 'Complexity + Risk → Story Points (lookup from master data)'],
            ['Step 2', 'Story Points → Initial Effort (Days and Hours)'],
            ['Step 3', 'Competency × Complexity → Overhead %'],
            ['Step 4', 'Revised Days = Initial Days × (1 + Overhead%)'],
            ['Step 5', 'Revised Hours = Revised Days × 8'],
          ].map(([s, d]) => (
            <div key={s} className="flex gap-3">
              <span className="font-semibold text-carbon dark:text-white w-14 flex-shrink-0">{s}</span>
              <span>{d}</span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
