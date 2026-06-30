import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, FolderOpen, Layers } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { useAuthStore } from '../../store/authStore';
import { cn } from '../../utils/formatters';

export function ProjectSelector() {
  const { selectedProjectId, projects, setSelectedProject } = useProjectStore();
  const { isGlobalSuperAdmin } = useAuthStore();
  const isGSA = isGlobalSuperAdmin();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Single project non-GSA: show badge only, no dropdown
  if (!isGSA && projects.length <= 1) {
    const project = projects[0];
    if (!project) return null;
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-lgrayblue/30 dark:bg-slate-700/50 rounded-lg border border-lgrayblue/40 dark:border-slate-600">
        <FolderOpen size={13} className="text-coolslate flex-shrink-0" />
        <span className="text-xs font-semibold text-carbon dark:text-white">{project.name}</span>
        {project.code && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-lgrayblue/50 dark:bg-slate-600 rounded text-coolslate">{project.code}</span>
        )}
      </div>
    );
  }

  const selectedProject = selectedProjectId ? projects.find(p => p.id === selectedProjectId) : null;
  const label = selectedProject ? selectedProject.name : 'All Projects';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all',
          'bg-lgrayblue/30 dark:bg-slate-700/50 border-lgrayblue/40 dark:border-slate-600',
          'hover:bg-lgrayblue/50 dark:hover:bg-slate-700 text-carbon dark:text-white',
          open && 'ring-1 ring-carbon/20 dark:ring-slate-500'
        )}
      >
        {selectedProject ? (
          <FolderOpen size={13} className="text-coolslate flex-shrink-0" />
        ) : (
          <Layers size={13} className="text-coolslate flex-shrink-0" />
        )}
        <span className="max-w-[140px] truncate">{label}</span>
        {selectedProject?.code && (
          <span className="text-[10px] font-mono px-1 py-0.5 bg-lgrayblue/50 dark:bg-slate-600 rounded text-coolslate">{selectedProject.code}</span>
        )}
        <ChevronDown size={12} className={cn('text-coolslate flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 top-10 w-60 bg-white dark:bg-carbon-700 rounded-xl shadow-modal border border-lgrayblue/30 dark:border-slate-600 overflow-hidden z-50"
          >
            <div className="px-3 py-2 border-b border-lgrayblue/20 dark:border-slate-700">
              <p className="text-[10px] font-semibold text-coolslate uppercase tracking-wider">Select Project</p>
            </div>

            {isGSA && (
              <button
                onClick={() => { setSelectedProject(null); setOpen(false); }}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2.5 text-sm transition-colors text-left',
                  selectedProjectId === null
                    ? 'bg-carbon/5 dark:bg-slate-600/40 text-carbon dark:text-white font-semibold'
                    : 'text-carbon dark:text-lgrayblue hover:bg-lgrayblue/30 dark:hover:bg-slate-700/50'
                )}
              >
                <Layers size={14} className="text-coolslate flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">All Projects</p>
                  <p className="text-[10px] text-coolslate">{projects.length} projects</p>
                </div>
                {selectedProjectId === null && <span className="w-1.5 h-1.5 rounded-full bg-greenline flex-shrink-0" />}
              </button>
            )}

            <div className="max-h-60 overflow-y-auto">
              {projects.map(project => (
                <button
                  key={project.id}
                  onClick={() => { setSelectedProject(project.id); setOpen(false); }}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2.5 text-sm transition-colors text-left',
                    selectedProjectId === project.id
                      ? 'bg-carbon/5 dark:bg-slate-600/40 text-carbon dark:text-white'
                      : 'text-carbon dark:text-lgrayblue hover:bg-lgrayblue/30 dark:hover:bg-slate-700/50'
                  )}
                >
                  <FolderOpen size={14} className="text-coolslate flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{project.name}</p>
                    {project.code && (
                      <p className="text-[10px] font-mono text-coolslate">{project.code}</p>
                    )}
                  </div>
                  {selectedProjectId === project.id && <span className="w-1.5 h-1.5 rounded-full bg-greenline flex-shrink-0" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
