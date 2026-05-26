import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen, ChevronDown, ChevronRight, LayoutDashboard, Calculator,
  History, BarChart3, Database, Wifi, RefreshCw, Activity, HeartPulse,
  Settings, Cpu, HelpCircle, CheckCircle2, AlertTriangle, Info,
  ArrowRight, Server, MemoryStick, HardDrive, FileText,
} from 'lucide-react';
import { masterApi } from '../../services/api';
import { Card, Skeleton } from '../../components/ui';
import { COMPLEXITY_COLORS, RISK_COLORS, COMPETENCY_COLORS } from '../../config/theme';
import type { ComplexityDefinition, RiskDefinition } from '../../types';
import { cn } from '../../utils/formatters';

// ─── Criteria (DefinitionTable) ───────────────────────────────────────────────
const CRITERIA = ['scope', 'requirement_clarity', 'business_logic', 'dependencies', 'implementation_effort', 'testing_effort', 'risk_label', 'rollback_complexity'] as const;
const CRITERIA_LABELS: Record<string, string> = {
  scope: 'Scope', requirement_clarity: 'Requirement Clarity', business_logic: 'Business Logic',
  dependencies: 'Dependencies', implementation_effort: 'Implementation Effort',
  testing_effort: 'Testing Effort', risk_label: 'Risk Level', rollback_complexity: 'Rollback Complexity',
};

// ─── Table of Contents ────────────────────────────────────────────────────────
const TOC_ITEMS = [
  { id: 'sec-overview',     label: 'Overview',               icon: BookOpen,       indent: false },
  { id: 'sec-workflow',     label: 'End-to-End Workflow',    icon: ArrowRight,     indent: false },
  { id: 'sec-dashboard',    label: 'Dashboard',              icon: LayoutDashboard,indent: false },
  { id: 'sec-wizard',       label: 'New Estimation Wizard',  icon: Calculator,     indent: false },
  { id: 'sec-history',      label: 'Historical Data',        icon: History,        indent: false },
  { id: 'sec-analytics',    label: 'Analytics',              icon: BarChart3,      indent: false },
  { id: 'sec-master',       label: 'Master Data',            icon: Database,       indent: false },
  { id: 'sec-offline',      label: 'Online / Offline Mode',  icon: Wifi,           indent: false },
  { id: 'sec-sync',         label: 'Sync Queue',             icon: RefreshCw,      indent: true  },
  { id: 'sec-logs',         label: 'Log Monitor',            icon: Activity,       indent: false },
  { id: 'sec-health',       label: 'Health Monitor',         icon: HeartPulse,     indent: false },
  { id: 'sec-settings',     label: 'Settings',               icon: Settings,       indent: false },
  { id: 'sec-engine',       label: 'Estimation Engine',      icon: Cpu,            indent: false },
  { id: 'sec-faq',          label: 'Troubleshooting & FAQ',  icon: HelpCircle,     indent: false },
];

// ─── Helper components ────────────────────────────────────────────────────────
function Callout({ type, children }: { type: 'info' | 'tip' | 'warning'; children: React.ReactNode }) {
  const styles = {
    info:    'border-l-4 border-carbon/40 bg-carbon/5 dark:border-lgrayblue/40 dark:bg-lgrayblue/10',
    tip:     'border-l-4 border-greenline bg-greenline/5 dark:bg-greenline/10',
    warning: 'border-l-4 border-gold bg-gold/5 dark:bg-gold/10',
  };
  const Icon = type === 'tip' ? CheckCircle2 : type === 'warning' ? AlertTriangle : Info;
  const iconCls = type === 'tip' ? 'text-greenline' : type === 'warning' ? 'text-gold' : 'text-carbon dark:text-lgrayblue';
  return (
    <div className={cn('rounded-r-lg p-3 flex gap-2.5', styles[type])}>
      <Icon size={14} className={cn('flex-shrink-0 mt-0.5', iconCls)} />
      <div className="text-sm text-carbon dark:text-lgrayblue leading-relaxed">{children}</div>
    </div>
  );
}

function Steps({ items }: { items: { title: string; desc: string }[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span className="w-6 h-6 rounded-full bg-carbon dark:bg-lgrayblue/80 text-white dark:text-carbon text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
          <div>
            <p className="text-sm font-semibold text-carbon dark:text-white">{item.title}</p>
            <p className="text-sm text-coolslate mt-0.5 leading-relaxed">{item.desc}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="px-1.5 py-0.5 rounded bg-lgrayblue/30 dark:bg-slate-700/60 text-[11px] font-mono text-carbon dark:text-lgrayblue">{children}</code>;
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-carbon dark:text-white flex items-center gap-2">
        <span className="w-1 h-4 bg-carbon/25 dark:bg-lgrayblue/40 rounded-full flex-shrink-0" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function DocSection({ id, title, icon, children, defaultOpen = false }: {
  id: string; title: string; icon?: React.ReactNode;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={id} className="scroll-mt-3">
      <Card padding="p-0" className="overflow-hidden">
        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-lgrayblue/10 dark:hover:bg-slate-700/20 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            {icon && <span className="text-coolslate">{icon}</span>}
            <h2 className="font-display font-semibold text-carbon dark:text-white">{title}</h2>
          </div>
          {open ? <ChevronDown size={18} className="text-coolslate flex-shrink-0" /> : <ChevronRight size={18} className="text-coolslate flex-shrink-0" />}
        </button>
        {open && (
          <div className="px-5 pb-6 border-t border-lgrayblue/20 dark:border-slate-700 pt-5 space-y-5">{children}</div>
        )}
      </Card>
    </div>
  );
}

function FormulaBlock({ lines }: { lines: [string, string][] }) {
  return (
    <div className="bg-lgrayblue/20 dark:bg-carbon-800/40 rounded-xl p-4 font-mono text-xs space-y-1.5 overflow-x-auto">
      {lines.map(([lhs, rhs], i) => (
        <div key={i} className="flex gap-3 flex-wrap">
          <span className="text-coolslate min-w-[190px]">{lhs}</span>
          <span className="text-carbon dark:text-lgrayblue">=&nbsp;&nbsp;{rhs}</span>
        </div>
      ))}
    </div>
  );
}

function TableOfContents() {
  return (
    <aside className="hidden xl:block w-52 flex-shrink-0">
      <div className="sticky top-4">
        <p className="text-[10px] font-semibold text-coolslate uppercase tracking-widest mb-2 px-2">On This Page</p>
        <nav className="space-y-0.5">
          {TOC_ITEMS.map(({ id, label, icon: Icon, indent }) => (
            <button key={id}
              onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className={cn(
                'w-full flex items-center gap-2 py-1.5 rounded-lg text-left text-xs text-coolslate hover:text-carbon dark:hover:text-white hover:bg-lgrayblue/20 dark:hover:bg-slate-700/30 transition-colors',
                indent ? 'pl-5 pr-2' : 'px-2',
              )}
            >
              <Icon size={12} className="flex-shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}

// ─── Kept from original ───────────────────────────────────────────────────────
function FlowDiagram() {
  const steps = [
    { n: 1, title: 'Classify',     desc: 'Complexity + Risk',      color: '#1E3246' },
    { n: 2, title: 'Story Points', desc: 'Lookup from matrix',     color: '#4B5A69' },
    { n: 3, title: 'Initial Effort',desc: 'SP → Days & Hours',     color: '#9B875F' },
    { n: 4, title: 'Competency',   desc: 'Engineer level',         color: '#788291' },
    { n: 5, title: 'Overhead %',   desc: 'Competency × Complexity',color: '#AFA082' },
    { n: 6, title: 'Revised Days', desc: 'Initial × (1 + OH%)',    color: '#19AA6E' },
    { n: 7, title: 'Revised Hours',desc: 'Revised Days × 8',       color: '#19AA6E' },
  ];
  return (
    <div className="flex flex-wrap gap-2 items-start">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div className="flex flex-col items-center">
            <div className="w-9 h-9 rounded-xl text-white flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: s.color }}>{s.n}</div>
            <p className="text-xs font-semibold text-carbon dark:text-white mt-1 whitespace-nowrap">{s.title}</p>
            <p className="text-[10px] text-coolslate max-w-[90px] text-center leading-tight">{s.desc}</p>
          </div>
          {i < steps.length - 1 && <ChevronRight size={16} className="text-lgrayblue mt-[-20px] flex-shrink-0" />}
        </div>
      ))}
    </div>
  );
}

function DefinitionTable({ data, type }: { data: (ComplexityDefinition | RiskDefinition)[]; type: 'complexity' | 'risk' }) {
  const [active, setActive] = useState<string>('scope');
  const colors = type === 'complexity' ? COMPLEXITY_COLORS : RISK_COLORS;
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {CRITERIA.map(c => (
          <button key={c} onClick={() => setActive(c)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${active === c ? 'bg-carbon text-white dark:bg-lgrayblue dark:text-carbon' : 'bg-lgrayblue/30 dark:bg-slate-700/40 text-coolslate hover:text-carbon dark:hover:text-white'}`}
          >{CRITERIA_LABELS[c]}</button>
        ))}
      </div>
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.level} className="flex gap-3 p-3 rounded-lg bg-lgrayblue/10 dark:bg-carbon-800/30">
            <span className="inline-flex items-center justify-center w-20 flex-shrink-0 text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ background: colors[d.level] || '#788291' }}>{d.level}</span>
            <p className="text-sm text-carbon dark:text-lgrayblue">{(d as Record<string, unknown>)[active] as string || '—'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DocsPage() {
  const { data: complexityDefs, isLoading: cLoading } = useQuery({ queryKey: ['complexity-defs'], queryFn: masterApi.getComplexityDefs, retry: false });
  const { data: riskDefs, isLoading: rLoading } = useQuery({ queryKey: ['risk-defs'], queryFn: masterApi.getRiskDefs, retry: false });
  const { data: competencyDefs, isLoading: compLoading } = useQuery({ queryKey: ['competency-defs'], queryFn: masterApi.getCompetencyDefs, retry: false });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2">
          <BookOpen size={22} /> Help &amp; Documentation
        </h1>
        <p className="text-sm text-coolslate mt-0.5">Complete reference — feature walkthroughs, workflows, configuration, and troubleshooting</p>
      </div>

      <div className="flex gap-6 items-start">
        <TableOfContents />

        <div className="flex-1 min-w-0 space-y-3">

          {/* ── 1. Overview ── */}
          <DocSection id="sec-overview" title="Overview" icon={<BookOpen size={16} />} defaultOpen>
            <p className="text-sm text-coolslate leading-relaxed">
              The <strong className="text-carbon dark:text-white">Estimation Platform</strong> is a full-stack software effort estimation tool that helps engineering teams produce consistent, data-driven estimates. It eliminates guesswork by applying a structured formula-based model that accounts for task complexity, risk, and engineer competency.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { icon: <Calculator size={14} />, title: 'Estimate Tasks',        desc: 'Guided 3-step wizard to create structured effort estimates' },
                { icon: <History size={14} />,    title: 'Track History',         desc: 'Searchable table of all estimations with inline detail drawer' },
                { icon: <BarChart3 size={14} />,  title: 'Analyse Accuracy',      desc: 'Charts comparing estimated vs actual effort over time' },
                { icon: <Wifi size={14} />,       title: 'Offline Support',       desc: 'Continue working offline; mutations sync automatically on reconnect' },
                { icon: <Activity size={14} />,   title: 'Log Monitoring',        desc: 'Real-time log viewer with search, filters, and live mode' },
                { icon: <HeartPulse size={14} />, title: 'Health Checks',        desc: 'Live dashboard for DB, memory, system, and log storage health' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex gap-3 p-3 rounded-xl bg-lgrayblue/10 dark:bg-carbon-800/30">
                  <span className="text-carbon dark:text-lgrayblue mt-0.5 flex-shrink-0">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-carbon dark:text-white">{title}</p>
                    <p className="text-xs text-coolslate mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <SubSection title="Application Routes">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {([
                  ['/', 'Dashboard'],
                  ['/estimate', 'New Estimation Wizard'],
                  ['/history', 'Historical Data'],
                  ['/analysis', 'Analytics & Reports'],
                  ['/master/story-points', 'Story Points master data'],
                  ['/master/effort', 'Effort Estimates master data'],
                  ['/master/competency', 'Competency master data'],
                  ['/logs', 'Log Monitor'],
                  ['/monitoring', 'Health Monitor'],
                  ['/docs', 'This documentation page'],
                  ['/settings', 'Application settings'],
                ] as [string, string][]).map(([route, desc]) => (
                  <div key={route} className="flex items-center gap-2 text-sm">
                    <Mono>{route}</Mono>
                    <span className="text-coolslate text-xs">{desc}</span>
                  </div>
                ))}
              </div>
            </SubSection>

            <SubSection title="Tech Stack">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {[
                  ['Frontend', 'React 18 + TypeScript + Vite + Tailwind CSS'],
                  ['Backend', 'Node.js + Express + TypeScript'],
                  ['Database', 'PostgreSQL'],
                  ['State Management', 'Zustand with localStorage persistence'],
                  ['Data Fetching', 'TanStack React Query'],
                  ['Logging', 'Winston + DailyRotateFile + PostgreSQL sink'],
                  ['API Docs', 'Swagger UI (OpenAPI 3.0) at /api-docs'],
                  ['Charts', 'Recharts (Area, Bar, Pie, Scatter)'],
                ].map(([layer, tech]) => (
                  <div key={layer} className="flex gap-2 bg-lgrayblue/10 dark:bg-carbon-800/30 rounded-lg p-2.5">
                    <span className="text-coolslate w-32 flex-shrink-0">{layer}</span>
                    <span className="text-carbon dark:text-lgrayblue">{tech}</span>
                  </div>
                ))}
              </div>
            </SubSection>

            <SubSection title="Quick Start">
              <div className="bg-lgrayblue/20 dark:bg-carbon-800/40 rounded-xl p-4 font-mono text-xs space-y-1">
                <p className="text-coolslate"># Start the backend (runs on port 4000)</p>
                <p className="text-carbon dark:text-lgrayblue">cd backend &amp;&amp; npm run dev</p>
                <p className="text-coolslate mt-2"># Start the frontend (runs on port 3000)</p>
                <p className="text-carbon dark:text-lgrayblue">cd frontend &amp;&amp; npm run dev</p>
                <p className="text-coolslate mt-2"># API docs (Swagger UI)</p>
                <p className="text-carbon dark:text-lgrayblue">http://localhost:4000/api-docs</p>
              </div>
            </SubSection>
          </DocSection>

          {/* ── 2. End-to-End Workflow ── */}
          <DocSection id="sec-workflow" title="End-to-End Workflow" icon={<ArrowRight size={16} />} defaultOpen>
            <p className="text-sm text-coolslate leading-relaxed">
              The complete lifecycle of an estimation — from creation through to accuracy reporting — follows this sequence:
            </p>
            <Steps items={[
              { title: 'Create an Estimation', desc: 'Go to New Estimate (/estimate). Enter the task title and optional project/description, then select Complexity and Risk levels. The Live Preview panel on the right updates in real time.' },
              { title: 'Assign Competency', desc: 'Step 2 asks for the engineer competency level (Emerging / Competent / Expert). This determines the overhead percentage applied on top of the initial effort.' },
              { title: 'Review & Save', desc: 'Step 3 shows the full calculation chain (Complexity + Risk → SP → Initial Effort → Overhead → Revised Effort). Add notes if needed, then click Save Estimation.' },
              { title: 'Track in Dashboard & History', desc: 'The saved estimation appears in Recent Estimations (Dashboard) and the Historical Data table with status "open".' },
              { title: 'Submit Your Estimate', desc: 'After the task is done, open the estimation via the eye icon in Historical Data. Enter Your Estimated Hours in the drawer — the system instantly calculates Actual Days and Accuracy %.' },
              { title: 'Analyse Performance', desc: 'Visit Analytics (/analysis) to see accuracy by complexity level, variance trends, scatter charts, and story point band comparisons across any time window.' },
            ]} />
            <Callout type="tip">
              Use the <strong>Live Preview</strong> in the Estimation Wizard to experiment with different Complexity, Risk, and Competency combinations before committing — no need to save.
            </Callout>
          </DocSection>

          {/* ── 3. Dashboard ── */}
          <DocSection id="sec-dashboard" title="Dashboard" icon={<LayoutDashboard size={16} />}>
            <p className="text-sm text-coolslate leading-relaxed">
              The Dashboard (<Mono>/</Mono>) provides an at-a-glance view of all estimation activity, key performance metrics, and recent records.
            </p>

            <SubSection title="KPI Cards">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Total Estimations', desc: 'Total number of estimations ever created in the system.' },
                  { label: 'Completed', desc: 'Estimations with a submitted estimate (status = completed).' },
                  { label: 'Avg Accuracy', desc: 'Mean accuracy % across all completed estimations. 100% = your hours exactly matched the system revised minimum.' },
                  { label: 'Avg Variance', desc: 'Average deviation (hrs) between your estimate and system revised minimum. Negative = under-estimated.' },
                ].map(({ label, desc }) => (
                  <div key={label} className="p-3 rounded-xl bg-lgrayblue/10 dark:bg-carbon-800/30">
                    <p className="text-xs font-semibold text-carbon dark:text-white">{label}</p>
                    <p className="text-xs text-coolslate mt-1 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </SubSection>

            <SubSection title="Estimation Activity Chart">
              <p className="text-sm text-coolslate leading-relaxed">
                Area chart showing daily estimation counts over the last 30 days. The dark line = total created; green line = completed. The <strong className="text-carbon dark:text-white">Bias badge</strong> (top-right) shows whether the team is Under-estimating, Over-estimating, or Accurate based on average variance across all completed records.
              </p>
            </SubSection>

            <SubSection title="Complexity Split">
              <p className="text-sm text-coolslate leading-relaxed">
                Donut chart showing the distribution of estimations by complexity level. Hover segments to see counts. Useful for understanding the proportion of high-complexity work the team is taking on.
              </p>
            </SubSection>

            <SubSection title="Recent Estimations List">
              <p className="text-sm text-coolslate leading-relaxed">
                The last 8 created estimations. Each row shows title, project, revised effort range, story points, status, and accuracy badge (when available). Click any row to navigate directly to that record in Historical Data.
              </p>
            </SubSection>
          </DocSection>

          {/* ── 4. New Estimation Wizard ── */}
          <DocSection id="sec-wizard" title="New Estimation Wizard" icon={<Calculator size={16} />}>
            <p className="text-sm text-coolslate leading-relaxed">
              The Estimation Wizard (<Mono>/estimate</Mono>) is a 3-step guided form that collects task information and produces a revised effort estimate using the platform's calculation engine.
            </p>

            <SubSection title="Step 1 — Classify the Task">
              <Steps items={[
                { title: 'Task Title (required)', desc: 'A clear name for the task — e.g. "Login Feature Redesign". Used throughout the history table and notifications.' },
                { title: 'Project (optional)', desc: 'The project or codebase context — e.g. "Portal v3". Used for grouping and searching.' },
                { title: 'Description (optional)', desc: 'A brief summary of the work involved. Stored for reference but does not affect the calculation.' },
                { title: 'Complexity Level (required)', desc: 'How technically complex the task is. Ranges from Low (single clear feature) to Unmanageable (multi-platform, external vendors). Each option shows a short guide description to help you choose.' },
                { title: 'Risk Level (required)', desc: 'The risk profile of the task. Ranges from Low (small isolated feature, fully documented) to Unknown (insufficient information to scope). Higher risk → higher story points.' },
              ]} />
              <Callout type="info">
                As soon as Complexity and Risk are both selected, the <strong>Live Preview</strong> panel on the right side activates and shows Story Points, initial effort range, and (once Competency is set in Step 2) the final revised estimate.
              </Callout>
            </SubSection>

            <SubSection title="Step 2 — Assign Competency">
              <p className="text-sm text-coolslate leading-relaxed mb-2">Select the competency level of the engineer(s) who will perform the task. This determines the overhead % applied to the initial effort.</p>
              <div className="space-y-2">
                {[
                  { level: 'Emerging',  color: '#E15A50', desc: 'Basic knowledge, needs guidance. Under 3 years experience. Overhead: 2–20% (increases with complexity).' },
                  { level: 'Competent', color: '#9B875F', desc: 'Works independently with solid knowledge. 3–6 years experience. Overhead: 1–10%.' },
                  { level: 'Expert',    color: '#19AA6E', desc: 'Leads solutions, deep expertise. Over 6 years experience. Overhead: 0–7%.' },
                ].map(({ level, color, desc }) => (
                  <div key={level} className="flex gap-3 p-3 rounded-lg bg-lgrayblue/10 dark:bg-carbon-800/30">
                    <span className="text-xs font-bold px-2 py-1 rounded-lg text-white flex-shrink-0 self-start" style={{ background: color }}>{level}</span>
                    <p className="text-sm text-coolslate">{desc}</p>
                  </div>
                ))}
              </div>
            </SubSection>

            <SubSection title="Step 3 — Review & Save">
              <p className="text-sm text-coolslate leading-relaxed">
                Displays the full calculation chain with all intermediate values — Complexity + Risk → Story Points → Initial Min/Max Days → Overhead % → Revised Min/Max Days → Revised Hours. Two summary cards show <strong className="text-carbon dark:text-white">Revised Min</strong> and <strong className="text-carbon dark:text-white">Revised Max</strong> prominently in hours and days. Add any final notes or assumptions, then click <strong className="text-carbon dark:text-white">Save Estimation</strong>.
              </p>
            </SubSection>

            <SubSection title="Live Preview Panel">
              <p className="text-sm text-coolslate leading-relaxed">The panel on the right side updates as you type and select values. It shows:</p>
              <ul className="mt-1.5 space-y-1 text-sm text-coolslate list-disc list-inside">
                <li>Story Points assigned to the selected Complexity + Risk combination</li>
                <li>Initial effort range (min and max days)</li>
                <li>Overhead % once Competency is selected</li>
                <li>Final revised effort range in hours and days (highlighted green)</li>
              </ul>
            </SubSection>

            <Callout type="tip">
              Click <strong>"How it works"</strong> (top-right of the wizard) for a quick-reference modal that explains all 5 calculation steps at any time during the wizard.
            </Callout>
          </DocSection>

          {/* ── 5. Historical Data ── */}
          <DocSection id="sec-history" title="Historical Data" icon={<History size={16} />}>
            <p className="text-sm text-coolslate leading-relaxed">
              Historical Data (<Mono>/history</Mono>) is the central record store. It provides a searchable, filterable paginated table with a detail drawer for each estimation.
            </p>

            <SubSection title="Table Columns">
              <div className="space-y-2">
                {[
                  ['Task',           'Title and project name.'],
                  ['Complexity',     'Colour-coded complexity badge.'],
                  ['SP',             'Story Points assigned to this estimation.'],
                  ['Revised Effort', 'System revised min–max in hours (and days on wider screens).'],
                  ['Your Est.',      'Hours you submitted as your estimate — shown alongside derived actual days.'],
                  ['Accuracy',       'Colour-coded accuracy % compared to the revised minimum.'],
                  ['Status',         '"open" until an estimate is submitted, then "completed".'],
                  ['Date',           'Date the estimation was created.'],
                ].map(([col, desc]) => (
                  <div key={col} className="flex gap-3 items-start text-sm">
                    <span className="font-semibold text-carbon dark:text-white w-28 flex-shrink-0">{col}</span>
                    <span className="text-coolslate">{desc}</span>
                  </div>
                ))}
              </div>
            </SubSection>

            <SubSection title="Filters">
              <ul className="space-y-1 text-sm text-coolslate list-disc list-inside">
                <li><strong className="text-carbon dark:text-white">Search</strong> — matches title or project name (partial, case-insensitive)</li>
                <li><strong className="text-carbon dark:text-white">Complexity / Risk / Status</strong> — dropdown filters, all combinable</li>
                <li>Results are paginated at 15 per page — use Previous/Next at the bottom of the table</li>
                <li>Click <strong className="text-carbon dark:text-white">Clear</strong> to reset all active filters</li>
              </ul>
            </SubSection>

            <SubSection title="Detail Drawer">
              <p className="text-sm text-coolslate leading-relaxed">
                Click the eye icon on any row to open the slide-over drawer. It shows:
              </p>
              <ul className="mt-1.5 space-y-1 text-sm text-coolslate list-disc list-inside">
                <li>Attribute grid: Complexity, Risk, Competency, Story Points, Overhead %, Status</li>
                <li>Initial effort section (before overhead was applied)</li>
                <li>Revised effort cards (min / max hours and days)</li>
                <li><strong className="text-greenline">Estimate Submitted</strong> panel — shown after submission, displaying your estimated hours, variance, and accuracy badge</li>
                <li>Notes field and creation timestamp</li>
              </ul>
            </SubSection>

            <SubSection title="Submitting Your Estimate">
              <Steps items={[
                { title: 'Open an open estimation', desc: 'Click the eye icon on any row with status "open" to open the drawer.' },
                { title: 'Find the submission form', desc: 'Scroll to "Submit Your Estimate" at the bottom of the drawer (not shown for completed estimations).' },
                { title: 'Enter Your Estimated Hours', desc: 'Type the number of hours you estimate the task took. Supports 0.5 increments (e.g. 40, 72.5).' },
                { title: 'Review the auto-calculated preview', desc: 'An "Auto-calculated" panel appears live showing: Actual Days (= hours ÷ 8) and Accuracy % (colour-coded green ≥85%, amber ≥70%, red <70%).' },
                { title: 'Add optional notes', desc: 'Document any assumptions, blockers, or scope changes.' },
                { title: 'Click Submit Estimate', desc: 'The estimation status changes to "completed". The accuracy badge appears in the table row and the Analytics charts update.' },
              ]} />
              <Callout type="info">
                Accuracy formula: <Mono>max(0, (1 − |your_hours − revised_min_hours| ÷ revised_min_hours) × 100)</Mono>.
                A score of 100% means a perfect match. Scores above 85% are considered good.
              </Callout>
            </SubSection>
          </DocSection>

          {/* ── 6. Analytics ── */}
          <DocSection id="sec-analytics" title="Analytics & Reports" icon={<BarChart3 size={16} />}>
            <p className="text-sm text-coolslate leading-relaxed">
              The Analytics page (<Mono>/analysis</Mono>) provides performance insights derived from completed estimations. All charts and KPIs respond to the time period selector.
            </p>

            <SubSection title="Time Period Filter">
              <p className="text-sm text-coolslate leading-relaxed">
                Choose <strong className="text-carbon dark:text-white">30 days</strong>, <strong className="text-carbon dark:text-white">90 days</strong>, <strong className="text-carbon dark:text-white">1 year</strong>, or <strong className="text-carbon dark:text-white">All time</strong>. The filter applies simultaneously to all four KPI cards, both charts, and the SP Band table.
              </p>
            </SubSection>

            <SubSection title="KPI Cards">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Completed w/ Actuals', desc: 'Count of estimations with a submitted estimate in the selected period.' },
                  { label: 'Avg Accuracy',          desc: 'Mean accuracy % across all completed estimations in the period.' },
                  { label: 'Avg Variance',           desc: 'Average hours difference between your estimate and revised minimum. Positive = over-estimated; negative = under-estimated.' },
                  { label: 'Std Deviation',          desc: 'Spread of accuracy values. A smaller number means more consistent estimation.' },
                ].map(({ label, desc }) => (
                  <div key={label} className="p-3 rounded-xl bg-lgrayblue/10 dark:bg-carbon-800/30">
                    <p className="text-xs font-semibold text-carbon dark:text-white">{label}</p>
                    <p className="text-xs text-coolslate mt-1 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </SubSection>

            <SubSection title="Accuracy by Complexity Chart">
              <p className="text-sm text-coolslate leading-relaxed">
                Bar chart showing average accuracy per complexity level, colour-coded to match the complexity system. The <strong className="text-carbon dark:text-white">Estimation Bias badge</strong> summarises the overall team tendency:
              </p>
              <ul className="mt-1.5 space-y-1 text-sm list-disc list-inside">
                <li><span className="text-greenline font-semibold">Accurate</span> — average variance is near zero</li>
                <li><span className="text-gold font-semibold">Under-estimating</span> — tasks consistently took more hours than estimated</li>
                <li><span className="text-vibrant font-semibold">Over-estimating</span> — tasks consistently took fewer hours than estimated</li>
              </ul>
            </SubSection>

            <SubSection title="Estimated vs Actual Scatter Chart">
              <p className="text-sm text-coolslate leading-relaxed">
                Each dot is one completed estimation. X-axis = system revised minimum hours; Y-axis = your submitted estimate hours. Dots on the dashed green diagonal = perfect accuracy. Dots above the line = you estimated more hours than the system. Hover any dot to see the task title, estimated hours, actual hours, and accuracy.
              </p>
            </SubSection>

            <SubSection title="Story Point Band Table">
              <p className="text-sm text-coolslate leading-relaxed">
                Groups completed estimations by Story Points showing: average revised minimum hours, average actual hours, average variance, and count per band. Useful for calibrating whether specific SP bands are systematically over- or under-estimated.
              </p>
            </SubSection>
          </DocSection>

          {/* ── 7. Master Data ── */}
          <DocSection id="sec-master" title="Master Data" icon={<Database size={16} />}>
            <p className="text-sm text-coolslate leading-relaxed">
              Master Data pages let administrators view and manage the lookup tables that power the estimation engine. All three are under <Mono>/master</Mono>.
            </p>

            <SubSection title="Story Points (/master/story-points)">
              <p className="text-sm text-coolslate leading-relaxed">
                A matrix mapping each Complexity + Risk combination to a Story Points value. When an estimation is created, the engine calls <Mono>lookup(complexity, risk)</Mono> against this table to determine the SP value. If a combination has no entry, the estimation cannot be calculated.
              </p>
            </SubSection>

            <SubSection title="Effort Estimates (/master/effort)">
              <p className="text-sm text-coolslate leading-relaxed">
                Maps each Story Point value to an effort range: minimum days and maximum days. For example, 5 SP → 3–5 days. These ranges are the base before overhead is applied. Edit these values to calibrate the model to your team's historical pace.
              </p>
            </SubSection>

            <SubSection title="Competency (/master/competency)">
              <p className="text-sm text-coolslate leading-relaxed">
                Defines the three competency levels (Emerging, Competent, Expert) with qualitative descriptions across five dimensions: Knowledge Depth, Independence, Problem Solving, Communication, and Mentorship. The overhead percentage matrix (Competency × Complexity) is derived from these definitions.
              </p>
            </SubSection>

            <Callout type="warning">
              Changing master data affects all future estimations. Existing saved estimations retain the values calculated at the time of creation.
            </Callout>
          </DocSection>

          {/* ── 8. Online / Offline Mode ── */}
          <DocSection id="sec-offline" title="Online / Offline Mode" icon={<Wifi size={16} />}>
            <p className="text-sm text-coolslate leading-relaxed">
              The platform supports a manual Online/Offline toggle that controls whether mutations are sent to the server immediately or queued for later sync. This is independent of actual network availability — useful for demos, testing, or intentionally batching changes.
            </p>

            <SubSection title="Connection Status Indicator">
              <p className="text-sm text-coolslate leading-relaxed mb-1">The status is visible in two locations:</p>
              <ul className="space-y-1 text-sm text-coolslate list-disc list-inside">
                <li><strong className="text-carbon dark:text-white">Sidebar — bottom section.</strong> A pulsing green dot (online) or static red dot (offline). Expanded sidebar shows a label + toggle switch. Collapsed sidebar shows a dot-button with a tooltip on hover.</li>
                <li><strong className="text-carbon dark:text-white">Settings page (/settings).</strong> Full-width status banner with toggle switch and two mode selector cards.</li>
              </ul>
            </SubSection>

            <SubSection title="Online Mode (Default)">
              <ul className="space-y-1 text-sm text-coolslate list-disc list-inside">
                <li>All API requests are sent to the server in real time</li>
                <li>Data is fetched and cached by React Query</li>
                <li>Mutations (create, update, delete) execute immediately</li>
                <li>Sidebar shows pulsing green dot (<em>animate-ping</em> effect)</li>
              </ul>
            </SubSection>

            <SubSection title="Offline Mode">
              <ul className="space-y-1 text-sm text-coolslate list-disc list-inside">
                <li>GET (read) requests continue using React Query's cached data</li>
                <li>POST / PUT / PATCH / DELETE requests are intercepted by the axios request interceptor and added to the Sync Queue instead of being sent</li>
                <li>A fake 202 Accepted response is returned so the UI still shows success toasts and updates normally</li>
                <li>Sidebar shows a static red dot (no animation)</li>
              </ul>
              <Callout type="warning">
                Queued mutations are stored in <Mono>localStorage</Mono> under the key <Mono>ep-sync-queue</Mono>. They survive page refreshes. Clearing browser storage will permanently lose any unsynced changes.
              </Callout>
            </SubSection>

            <SubSection title="How to Switch Modes">
              <Steps items={[
                { title: 'Via Sidebar', desc: 'In expanded view — click the toggle switch at the bottom. In collapsed view — click the status dot button.' },
                { title: 'Via Settings', desc: 'Navigate to Settings (/settings) → Connection card → use the toggle switch, or click the Online / Offline mode cards.' },
              ]} />
            </SubSection>
          </DocSection>

          {/* ── 9. Sync Queue ── */}
          <DocSection id="sec-sync" title="Sync Queue" icon={<RefreshCw size={16} />}>
            <p className="text-sm text-coolslate leading-relaxed">
              The Sync Queue stores all mutations made while offline and replays them automatically when the app returns to Online mode.
            </p>

            <SubSection title="How the Sync Process Works">
              <Steps items={[
                { title: 'Mutation is intercepted', desc: 'The axios request interceptor detects: (a) the app is offline, and (b) the request method is POST/PUT/PATCH/DELETE. It enqueues the item — recording the method, URL, and request body — and returns a fake 202 response so the UI behaves normally.' },
                { title: 'Queue persists across refreshes', desc: 'The Sync Queue is a Zustand store persisted in localStorage (key: ep-sync-queue). Each item has a unique ID, method, URL, body, and timestamp. Page refreshes do not clear it.' },
                { title: 'App goes Online', desc: 'When you toggle back to Online mode, the useSyncQueue hook detects the offline→online transition and immediately starts processing the queue.' },
                { title: 'Serial replay', desc: 'Each queued request is executed one at a time in the order it was made (oldest first). Successfully synced items are removed from the queue.' },
                { title: 'Cache invalidation', desc: 'After all items are processed, React Query\'s entire cache is invalidated, causing all active queries to re-fetch fresh data from the server.' },
                { title: 'Toast notification', desc: '"X change(s) synced — Your offline changes have been saved to the server." is shown on success. If any items failed, a separate error toast shows the count of failures.' },
              ]} />
            </SubSection>

            <Callout type="tip">
              Serial processing preserves order. If you created a record offline and then updated it while still offline, the create is sent first — so the update targets a record that now exists on the server.
            </Callout>

            <Callout type="warning">
              Failed sync items (e.g. the server returns a 404 or 422) are counted in the error toast but are <em>not</em> automatically retried. Review the error message and re-submit those changes manually if needed.
            </Callout>
          </DocSection>

          {/* ── 10. Log Monitor ── */}
          <DocSection id="sec-logs" title="Log Monitor" icon={<Activity size={16} />}>
            <p className="text-sm text-coolslate leading-relaxed">
              The Log Monitor (<Mono>/logs</Mono>) is a real-time web interface for viewing, searching, and analysing all backend application logs stored in PostgreSQL.
            </p>

            <SubSection title="Log Levels">
              <div className="space-y-1.5">
                {[
                  { level: 'debug',  color: '#19AA6E', desc: 'Verbose diagnostic information. Only emitted in non-production environments (NODE_ENV ≠ production).' },
                  { level: 'http',   color: '#788291', desc: 'Every HTTP request and response — method, path, status code, response time, IP.' },
                  { level: 'info',   color: '#1E3246', desc: 'Key application events: server startup, DB connection established, important state transitions.' },
                  { level: 'warn',   color: '#9B875F', desc: 'Non-critical issues that may need attention — slow queries, approaching memory limits, expected errors.' },
                  { level: 'error',  color: '#DC3223', desc: 'Unhandled exceptions, database failures, and critical errors. Always written regardless of LOG_LEVEL.' },
                ].map(({ level, color, desc }) => (
                  <div key={level} className="flex gap-3 items-start p-2.5 rounded-lg bg-lgrayblue/10 dark:bg-carbon-800/30">
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded text-white flex-shrink-0" style={{ background: color }}>{level}</span>
                    <p className="text-sm text-coolslate">{desc}</p>
                  </div>
                ))}
              </div>
            </SubSection>

            <SubSection title="Log Categories">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {[
                  ['api',      'HTTP request/response logs from Express middleware'],
                  ['database', 'SQL queries, pool events, connection lifecycle'],
                  ['auth',     'Authentication and authorisation events'],
                  ['system',   'Server startup, shutdown, OS-level events'],
                  ['job',      'Background jobs and scheduled tasks'],
                  ['general',  'Catch-all for miscellaneous application logs'],
                ].map(([cat, desc]) => (
                  <div key={cat} className="p-2.5 rounded-lg bg-lgrayblue/10 dark:bg-carbon-800/30">
                    <p className="font-mono font-semibold text-carbon dark:text-white mb-0.5">{cat}</p>
                    <p className="text-coolslate">{desc}</p>
                  </div>
                ))}
              </div>
            </SubSection>

            <SubSection title="Filters & Search">
              <ul className="space-y-1 text-sm text-coolslate list-disc list-inside">
                <li><strong className="text-carbon dark:text-white">Level</strong> — filter by severity (debug, http, info, warn, error)</li>
                <li><strong className="text-carbon dark:text-white">Category</strong> — filter by source category</li>
                <li><strong className="text-carbon dark:text-white">Search</strong> — full-text search against the log message field</li>
                <li><strong className="text-carbon dark:text-white">Correlation ID</strong> — paste an ID (from the <Mono>X-Correlation-Id</Mono> response header) to see all logs from a single HTTP request</li>
                <li><strong className="text-carbon dark:text-white">Date range</strong> — from/to timestamps to narrow the window</li>
                <li><strong className="text-carbon dark:text-white">Live mode</strong> — toggle on to auto-refresh every 5 seconds; a pulsing indicator shows when active</li>
              </ul>
            </SubSection>

            <SubSection title="Log Entry Details">
              <p className="text-sm text-coolslate leading-relaxed">Click any row to expand it and see:</p>
              <ul className="mt-1.5 space-y-1 text-sm text-coolslate list-disc list-inside">
                <li>Full message, precise timestamp, level and category badges</li>
                <li>HTTP fields (method, URL, status code, response time ms, IP, user agent)</li>
                <li>Correlation ID for request tracing across all log lines</li>
                <li>Stack trace (error-level logs only)</li>
                <li>Extra metadata as formatted JSON (any custom fields logged by the application)</li>
              </ul>
            </SubSection>

            <SubSection title="Stats Strip">
              <p className="text-sm text-coolslate leading-relaxed">
                The strip above the log table shows 24-hour counts by level (errors, warnings, info, http, debug) and a "last hour" count. This provides a fast health signal before diving into individual entries.
              </p>
            </SubSection>

            <SubSection title="Log Storage & Retention">
              <ul className="space-y-1 text-sm text-coolslate list-disc list-inside">
                <li><strong className="text-carbon dark:text-white">File transport:</strong> <Mono>backend/logs/combined-YYYY-MM-DD.log</Mono> (7-day retention, gzipped) and <Mono>error-YYYY-MM-DD.log</Mono> (14-day retention)</li>
                <li><strong className="text-carbon dark:text-white">Database transport:</strong> PostgreSQL <Mono>app_logs</Mono> table — stored indefinitely unless purged via <Mono>DELETE /api/monitoring/logs?days=N</Mono></li>
                <li>Both transports run in parallel. The file logs are the durable backup; the database logs power the UI.</li>
              </ul>
            </SubSection>
          </DocSection>

          {/* ── 11. Health Monitor ── */}
          <DocSection id="sec-health" title="Health Monitor" icon={<HeartPulse size={16} />}>
            <p className="text-sm text-coolslate leading-relaxed">
              The Health Monitor (<Mono>/monitoring</Mono>) shows real-time system health across all backend services. The page auto-refreshes every 30 seconds and can be manually refreshed with the button in the page header.
            </p>

            <SubSection title="Overall Status Banner">
              <p className="text-sm text-coolslate leading-relaxed">
                The large banner at the top shows the aggregated status (<span className="text-greenline font-semibold">Healthy</span> / <span className="text-gold font-semibold">Degraded</span> / <span className="text-vibrant font-semibold">Unhealthy</span>), the environment, application version, process uptime, and the total time taken to run all health checks (check latency).
              </p>
            </SubSection>

            <SubSection title="Service Cards">
              <div className="space-y-2">
                {[
                  { icon: <Server size={13} />,      name: 'API Server',   desc: 'Always healthy if the page loads. Shows app version and environment.' },
                  { icon: <Database size={13} />,    name: 'Database',     desc: 'Runs SELECT NOW(). Shows PostgreSQL version, total pool size, idle connections, and any waiting connections (highlighted amber if > 0).' },
                  { icon: <MemoryStick size={13} />, name: 'Memory',       desc: 'Node.js heap usage rendered as a colour-coded progress bar (green < 65%, amber < 85%, red ≥ 85%). Also shows RSS and external memory.' },
                  { icon: <Cpu size={13} />,         name: 'System',       desc: 'OS-level info: platform/arch, Node.js version, CPU core count, 1-minute load average, free and total system memory.' },
                  { icon: <HardDrive size={13} />,   name: 'Log Storage',  desc: 'Checks the backend/logs/ directory for accessibility. Shows file count and total disk usage in MB.' },
                  { icon: <FileText size={13} />,    name: 'Log Database', desc: 'Queries app_logs table. Shows total log count, logs in the last hour, and errors in the last 24 hours.' },
                ].map(({ icon, name, desc }) => (
                  <div key={name} className="flex gap-3 p-3 rounded-lg bg-lgrayblue/10 dark:bg-carbon-800/30">
                    <span className="text-coolslate flex-shrink-0 mt-0.5">{icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-carbon dark:text-white">{name}</p>
                      <p className="text-sm text-coolslate mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SubSection>

            <SubSection title="Status Levels">
              <div className="space-y-1.5">
                {[
                  { s: 'Healthy',   c: 'text-greenline', d: 'Service is operating normally within all expected parameters.' },
                  { s: 'Degraded',  c: 'text-gold',      d: 'Service is running but with reduced performance (e.g. heap usage above 65%, slow DB response).' },
                  { s: 'Unhealthy', c: 'text-vibrant',   d: 'Service is failing or unreachable. The overall system status becomes Unhealthy and the /api/monitoring/health endpoint returns HTTP 503.' },
                ].map(({ s, c, d }) => (
                  <div key={s} className="flex gap-3 items-start p-2.5 rounded-lg bg-lgrayblue/10 dark:bg-carbon-800/30">
                    <span className={cn('text-xs font-bold w-16 flex-shrink-0 mt-0.5', c)}>{s}</span>
                    <p className="text-sm text-coolslate">{d}</p>
                  </div>
                ))}
              </div>
            </SubSection>

            <SubSection title="Health API Endpoints">
              <div className="space-y-1.5">
                {[
                  ['GET /health',                         'Simple liveness — always 200 if the process is running'],
                  ['GET /api/monitoring/health',          'Full health report with all service checks. Returns 503 if any service is unhealthy'],
                  ['GET /api/monitoring/health/live',     'Liveness probe for container orchestrators (Kubernetes, Docker)'],
                  ['GET /api/monitoring/health/ready',    'Readiness probe — returns 503 if the database is unreachable'],
                ].map(([endpoint, desc]) => (
                  <div key={endpoint} className="flex flex-wrap gap-2 items-start p-2 rounded bg-lgrayblue/20 dark:bg-carbon-800/40">
                    <Mono>{endpoint}</Mono>
                    <span className="text-xs text-coolslate">{desc}</span>
                  </div>
                ))}
              </div>
            </SubSection>
          </DocSection>

          {/* ── 12. Settings ── */}
          <DocSection id="sec-settings" title="Settings" icon={<Settings size={16} />}>
            <p className="text-sm text-coolslate leading-relaxed">
              The Settings page (<Mono>/settings</Mono>) manages application-level preferences across four cards.
            </p>

            <SubSection title="Appearance — Theme">
              <ul className="space-y-1 text-sm text-coolslate list-disc list-inside">
                <li><strong className="text-carbon dark:text-white">Light</strong> — soft off-white backgrounds with carbon-blue accents. Good for bright environments.</li>
                <li><strong className="text-carbon dark:text-white">Dark</strong> — deep navy and carbon backgrounds. Reduces eye strain in low-light environments.</li>
                <li><strong className="text-carbon dark:text-white">System</strong> — automatically follows your operating system's dark/light mode preference.</li>
              </ul>
              <p className="text-sm text-coolslate mt-1.5">Theme preference is saved to localStorage and persists across sessions.</p>
            </SubSection>

            <SubSection title="Connection Mode">
              <p className="text-sm text-coolslate leading-relaxed">
                The same Online/Offline toggle available in the sidebar. The status banner shows current mode with a pulsing green or static red dot, a descriptive label, and the main toggle switch. Below it, two mode cards (Online / Offline) let you click to switch — the active mode is highlighted with a coloured border.
              </p>
              <p className="text-sm text-coolslate mt-1">See the <strong className="text-carbon dark:text-white">Online / Offline Mode</strong> section above for the full explanation.</p>
            </SubSection>

            <SubSection title="About">
              <p className="text-sm text-coolslate">Shows: Application name, version (1.0.0), build stack (React + Node.js + PostgreSQL), and PWA status.</p>
            </SubSection>

            <SubSection title="Colour Palette">
              <p className="text-sm text-coolslate leading-relaxed mb-2">Reference swatches for all 8 application colours with hex codes:</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { name: 'Carbon Blue', hex: '#1E3246' }, { name: 'Vibrant Red', hex: '#DC3223' },
                  { name: 'Gold',        hex: '#9B875F' }, { name: 'Green Line', hex: '#19AA6E' },
                  { name: 'Steel Slate', hex: '#4B5A69' }, { name: 'Soft Red',   hex: '#E15A50' },
                  { name: 'Muted Gold',  hex: '#AFA082' }, { name: 'Mint Green', hex: '#73CDAA' },
                ].map(({ name, hex }) => (
                  <div key={name} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex-shrink-0" style={{ background: hex }} />
                    <div>
                      <p className="text-[11px] font-medium text-carbon dark:text-white leading-tight">{name}</p>
                      <p className="text-[10px] font-mono text-coolslate">{hex}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SubSection>
          </DocSection>

          {/* ── 13. Estimation Engine Reference ── */}
          <DocSection id="sec-engine" title="Estimation Engine Reference" icon={<Cpu size={16} />}>
            <p className="text-sm text-coolslate leading-relaxed">
              The estimation engine is a deterministic pipeline that converts task classification inputs into effort estimates. All values are sourced from master data tables in PostgreSQL.
            </p>

            <SubSection title="Calculation Pipeline">
              <FlowDiagram />
            </SubSection>

            <SubSection title="Complete Formula Set">
              <FormulaBlock lines={[
                ['Story Points',         'lookup(Complexity, Risk)    ← story_points table'],
                ['Initial Min Days',     'lookup(StoryPoints).min_days  ← effort_estimates table'],
                ['Initial Max Days',     'lookup(StoryPoints).max_days'],
                ['Initial Min Hours',    'Initial Min Days × 8'],
                ['Initial Max Hours',    'Initial Max Days × 8'],
                ['Overhead %',           'matrix[Competency][Complexity]  ← competency_matrix table'],
                ['Revised Min Days',     'Initial Min Days × (1 + Overhead%)'],
                ['Revised Max Days',     'Initial Max Days × (1 + Overhead%)'],
                ['Revised Min Hours',    'Revised Min Days × 8'],
                ['Revised Max Hours',    'Revised Max Days × 8'],
                ['Actual Days',          'Your Estimated Hours ÷ 8'],
                ['Variance Hours',       'Your Estimated Hours − Revised Min Hours'],
                ['Accuracy %',           'max(0,  (1 − |Variance| ÷ Revised Min Hours) × 100)'],
              ]} />
            </SubSection>

            <SubSection title="Overhead % Matrix (Competency × Complexity)">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-lgrayblue/30 dark:border-slate-700">
                      <th className="pb-2 pr-4 text-left text-xs font-semibold text-coolslate uppercase">Competency</th>
                      {['Low', 'Medium', 'High', 'Very High', 'Unmanageable'].map(c => (
                        <th key={c} className="pb-2 px-3 text-center text-xs font-semibold text-coolslate uppercase">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { comp: 'Emerging',  vals: ['2%', '5%', '10%', '15%', '20%'], color: '#E15A50' },
                      { comp: 'Competent', vals: ['1%', '2%', '5%',  '7%',  '10%'], color: '#9B875F' },
                      { comp: 'Expert',    vals: ['0%', '1%', '2%',  '5%',  '7%'],  color: '#19AA6E' },
                    ].map(({ comp, vals, color }) => (
                      <tr key={comp} className="border-b border-lgrayblue/10 dark:border-slate-700/30 last:border-0">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                            <span className="font-medium" style={{ color }}>{comp}</span>
                          </div>
                        </td>
                        {vals.map((v, i) => (
                          <td key={i} className="py-2.5 px-3 text-center font-semibold text-carbon dark:text-white">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SubSection>

            <SubSection title="Complexity Level Definitions">
              <p className="text-sm text-coolslate mb-3">Click a criterion pill to see its definition across all complexity levels.</p>
              {cLoading ? <Skeleton className="h-48" /> : complexityDefs && <DefinitionTable data={complexityDefs} type="complexity" />}
            </SubSection>

            <SubSection title="Risk Level Definitions">
              <p className="text-sm text-coolslate mb-3">Click a criterion pill to see its definition across all risk levels.</p>
              {rLoading ? <Skeleton className="h-48" /> : riskDefs && <DefinitionTable data={riskDefs} type="risk" />}
            </SubSection>

            <SubSection title="Competency Level Definitions">
              {compLoading ? <Skeleton className="h-64" /> : (competencyDefs || []).map((def) => (
                <div key={def.id} className="mb-5 last:mb-0">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-lg text-white text-xs font-bold flex items-center justify-center flex-shrink-0" style={{ background: COMPETENCY_COLORS[def.level] }}>{def.level[0]}</div>
                    <h4 className="font-semibold text-carbon dark:text-white">{def.level}</h4>
                    <span className="text-xs text-coolslate">— {def.description}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-8">
                    {[
                      { label: 'Knowledge Depth', value: def.knowledge_depth },
                      { label: 'Independence',    value: def.independence },
                      { label: 'Problem Solving', value: def.problem_solving },
                      { label: 'Communication',   value: def.communication },
                      { label: 'Mentorship',      value: def.mentorship },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-lgrayblue/10 dark:bg-carbon-800/30 rounded-lg p-2.5">
                        <p className="text-xs font-semibold text-coolslate uppercase tracking-wide mb-1">{label}</p>
                        <p className="text-sm text-carbon dark:text-lgrayblue leading-relaxed">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </SubSection>
          </DocSection>

          {/* ── 14. Troubleshooting & FAQ ── */}
          <DocSection id="sec-faq" title="Troubleshooting & FAQ" icon={<HelpCircle size={16} />}>
            <div className="space-y-3">
              {([
                [
                  'The page shows "Unable to reach health endpoint" or all data appears empty.',
                  'The backend server is likely not running. Start it with: cd backend && npm run dev (port 4000). Check the terminal for any startup errors. The frontend proxies all /api calls to http://localhost:4000.',
                ],
                [
                  'I toggled to Offline mode, made changes, then switched back Online — but the sync didn\'t run.',
                  'Make sure you switched back using the sidebar toggle or Settings page toggle (not just closing and reopening the browser). The sync triggers on the offline→online state transition detected by the useSyncQueue hook. If you refreshed the page while online, the queue auto-syncs on mount. Check localStorage under ep-sync-queue to inspect queued items.',
                ],
                [
                  'Accuracy is showing 0% even though my estimate was close to the system range.',
                  'Accuracy is calculated against the Revised Minimum Hours specifically. If your submitted estimate is more than 100% away from the revised minimum, the formula clamps to 0%. Check the revised_min_hours value in the estimation drawer. Also confirm the estimation was saved with a non-zero revised_min_hours.',
                ],
                [
                  'The Estimation Wizard shows "no configuration found" and won\'t calculate.',
                  'The system could not find a Story Points value for the selected Complexity + Risk combination in the master data table. Go to /master/story-points and verify that the combination has an entry. All Complexity × Risk combinations must be populated for the engine to work.',
                ],
                [
                  'The Log Monitor shows no entries even though the backend is running.',
                  'The PostgreSQL log sink requires the app_logs table to exist. It is created automatically when the backend starts (db/init.ts). If you dropped the table manually, restart the backend. Also check the Level filter — if set to "error", only error-level logs are shown.',
                ],
                [
                  'Health Monitor shows Database as Unhealthy or Degraded.',
                  'Verify the DATABASE_URL in backend/.env is correct and the PostgreSQL server is running and accepting connections. "Degraded" usually means the query succeeded but pool waiting connections > 0. "Unhealthy" means the SELECT NOW() check failed entirely.',
                ],
                [
                  'The scatter chart in Analytics is empty.',
                  'The scatter chart only plots completed estimations — those with a submitted estimate (Your Estimated Hours). Open any "open" estimations in Historical Data, submit your hours, and the chart will populate.',
                ],
                [
                  'Dark mode isn\'t persisting after a page refresh.',
                  'Theme is persisted in localStorage under the key ep-theme. If your browser is set to clear localStorage on close, the preference won\'t persist. Check browser privacy settings or use the System option which follows your OS preference.',
                ],
                [
                  'How do I purge old log entries from the database?',
                  'Use the endpoint: DELETE /api/monitoring/logs?days=N — this deletes all log entries older than N days. For example, ?days=30 removes entries older than 30 days. This can be tested directly in the Swagger UI at /api-docs.',
                ],
                [
                  'Can I use the API directly without the frontend?',
                  'Yes — the full OpenAPI 3.0 spec is at http://localhost:4000/api-docs (interactive Swagger UI) and as raw JSON at http://localhost:4000/api-docs.json. Import the JSON into Postman or Insomnia for a complete collection. All endpoints are documented with request/response schemas.',
                ],
                [
                  'How do I change the log retention period for file logs?',
                  'Edit the maxFiles values in backend/src/logger/index.ts. Currently: "14d" for the error log transport and "7d" for the combined log transport. Restart the backend after changing these values.',
                ],
                [
                  'Queued offline changes synced but the data on screen didn\'t update.',
                  'After sync, React Query invalidates all cached queries, which triggers re-fetches. If the screen still looks stale, try manually refreshing the page. Ensure the backend returned a 2xx status for the synced mutations — check the browser network tab for the replay requests.',
                ],
              ] as [string, string][]).map(([q, a], i) => (
                <details key={i} className="group">
                  <summary className="flex items-start gap-2.5 cursor-pointer list-none p-3 rounded-xl bg-lgrayblue/10 dark:bg-carbon-800/30 hover:bg-lgrayblue/20 dark:hover:bg-carbon-800/50 transition-colors select-none">
                    <HelpCircle size={14} className="text-coolslate flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold text-carbon dark:text-white leading-snug">{q}</span>
                  </summary>
                  <div className="ml-6 mt-1 pl-3 border-l-2 border-lgrayblue/30 dark:border-slate-600/60">
                    <p className="text-sm text-coolslate leading-relaxed py-2">{a}</p>
                  </div>
                </details>
              ))}
            </div>
          </DocSection>

        </div>
      </div>
    </div>
  );
}
