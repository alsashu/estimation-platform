import { useState } from 'react';
import { Sigma } from 'lucide-react';
import { cn } from '../../utils/formatters';
import { AverageConfigsSection } from './AverageConfigsSection';
import { ExpertConfigsSection } from './ExpertConfigsSection';
import { ProjectMappingSection } from './ProjectMappingSection';

type Tab = 'average' | 'expert' | 'mapping';

export default function ParametricMasterPage() {
  const [tab, setTab] = useState<Tab>('average');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2">
            <Sigma size={22} /> Parametric Master Data
          </h1>
          <p className="text-sm text-coolslate mt-0.5">Manage Average Estimation and Expert Judgement configurations, and map them to projects.</p>
        </div>
        <div className="flex gap-1 bg-lgrayblue/30 dark:bg-slate-700/40 rounded-lg p-1">
          {([
            { key: 'average', label: 'Average Estimation' },
            { key: 'expert', label: 'Expert Judgement' },
            { key: 'mapping', label: 'Project Mapping' },
          ] as { key: Tab; label: string }[]).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('px-4 py-1.5 rounded-md text-xs font-medium transition-all',
                tab === t.key ? 'bg-white dark:bg-carbon-700 text-carbon dark:text-white shadow-sm' : 'text-coolslate hover:text-carbon dark:hover:text-white')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'average' && <AverageConfigsSection />}
      {tab === 'expert' && <ExpertConfigsSection />}
      {tab === 'mapping' && <ProjectMappingSection />}
    </div>
  );
}
