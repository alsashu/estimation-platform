import { useState, useRef } from 'react';
import { Download, UploadCloud, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Modal, Button } from '../../components/ui';
import { estimationsApi } from '../../services/api';
import { useConnectionStore } from '../../store';
import { useProjectStore } from '../../store/projectStore';
import { cn } from '../../utils/formatters';

const COMPLEXITY_OPTIONS = ['Low', 'Medium', 'High', 'Very High', 'Unmanageable'] as const;
const RISK_OPTIONS       = ['Low', 'Medium', 'High', 'Very High', 'Unknown']       as const;
const COMPETENCY_OPTIONS = ['Emerging', 'Competent', 'Expert']                      as const;
const WORK_GROUP_OPTIONS = ['DEVELOPMENT', 'VALIDATION', 'SPECIFICATION']          as const;

function normalizeEnum<T extends readonly string[]>(val: string, opts: T): T[number] | null {
  const t = val.trim();
  return (opts.find(o => o.toLowerCase() === t.toLowerCase()) ?? null) as T[number] | null;
}

interface ParsedRow {
  rowNum: number;
  title: string;
  project_name: string;
  description: string;
  complexity: string;
  risk: string;
  competency: string;
  work_group: string;
  notes: string;
  errors: string[];
  valid: boolean;
}

interface ImportResult {
  created: number;
  errors: { row: number; error: string }[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId?: string | null;
}

type Phase = 'upload' | 'preview' | 'importing' | 'done';

export function ImportModal({ isOpen, onClose, onSuccess, projectId }: Props) {
  const [phase, setPhase]       = useState<Phase>('upload');
  const [rows, setRows]         = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult]     = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { projects } = useProjectStore();
  const activeProject = projectId ? projects.find(p => p.id === projectId) : null;

  const reset = () => { setPhase('upload'); setRows([]); setFileName(''); setResult(null); };
  const handleClose = () => { reset(); onClose(); };

  // ── Template download ──────────────────────────────────────────────────────
  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const headers = ['Title *', 'Project Name', 'Description', 'Complexity *', 'Risk *', 'Competency *', 'Work Group *', 'Notes'];
    const example = ['Fix login redirect bug', 'Auth Module', 'OAuth callback mismatch', 'Medium', 'Low', 'Competent', 'DEVELOPMENT', 'JIRA-123'];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws['!cols'] = [
      { wch: 35 }, { wch: 22 }, { wch: 30 },
      { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 28 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Import Template');

    const refWs = XLSX.utils.aoa_to_sheet([
      ['Field',        'Valid Values'],
      ['Complexity *', COMPLEXITY_OPTIONS.join(', ')],
      ['Risk *',       RISK_OPTIONS.join(', ')],
      ['Competency *', COMPETENCY_OPTIONS.join(', ')],
      ['Work Group *', WORK_GROUP_OPTIONS.join(', ')],
      ['', ''],
      ['Note', 'Row 2 in the Import Template is an example — delete it before importing your data.'],
      ['Note', 'Fields marked * are required. Estimated Hours and Actual Hours are entered manually after import.'],
    ]);
    refWs['!cols'] = [{ wch: 15 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, refWs, 'Valid Values');

    XLSX.writeFile(wb, 'estimation_import_template.xlsx');
  };

  // ── File parsing & validation ──────────────────────────────────────────────
  const parseFile = async (file: File) => {
    const XLSX = await import('xlsx');
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const wb   = XLSX.read(data, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];

      const parsed: ParsedRow[] = [];
      for (let i = 1; i < raw.length; i++) {
        const row = raw[i] as unknown[];
        if (!row || row.every(c => !String(c ?? '').trim())) continue;

        const s = (n: number) => String(row[n] ?? '').trim();
        const rawTitle      = s(0);
        const rawComplexity = s(3);
        const rawRisk       = s(4);
        const rawCompetency = s(5);
        const rawWorkGroup  = s(6);

        const errors: string[] = [];
        if (!rawTitle)              errors.push('Title is required');
        else if (rawTitle.length > 255) errors.push('Title exceeds 255 characters');

        const complexity = normalizeEnum(rawComplexity, COMPLEXITY_OPTIONS);
        if (!rawComplexity)  errors.push('Complexity is required');
        else if (!complexity) errors.push(`Invalid Complexity "${rawComplexity}" — valid: ${COMPLEXITY_OPTIONS.join(', ')}`);

        const risk = normalizeEnum(rawRisk, RISK_OPTIONS);
        if (!rawRisk)  errors.push('Risk is required');
        else if (!risk) errors.push(`Invalid Risk "${rawRisk}" — valid: ${RISK_OPTIONS.join(', ')}`);

        const competency = normalizeEnum(rawCompetency, COMPETENCY_OPTIONS);
        if (!rawCompetency)  errors.push('Competency is required');
        else if (!competency) errors.push(`Invalid Competency "${rawCompetency}" — valid: ${COMPETENCY_OPTIONS.join(', ')}`);

        const workGroup = normalizeEnum(rawWorkGroup, WORK_GROUP_OPTIONS);
        if (!rawWorkGroup)  errors.push('Work Group is required');
        else if (!workGroup) errors.push(`Invalid Work Group "${rawWorkGroup}" — valid: ${WORK_GROUP_OPTIONS.join(', ')}`);

        parsed.push({
          rowNum:       i + 1,
          title:        rawTitle,
          project_name: s(1),
          description:  s(2),
          complexity:   complexity   || rawComplexity,
          risk:         risk         || rawRisk,
          competency:   competency   || rawCompetency,
          work_group:   workGroup    || rawWorkGroup,
          notes:        s(7),
          errors,
          valid: errors.length === 0,
        });
      }

      if (parsed.length === 0) {
        alert('No data rows found. Make sure data starts from row 2 (row 1 is the header).');
        return;
      }

      setRows(parsed);
      setFileName(file.name);
      setPhase('preview');
    } catch {
      alert('Could not read the file. Please make sure it is a valid .xlsx or .xls file.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    const valid = rows.filter(r => r.valid);
    if (!valid.length) return;

    if (!useConnectionStore.getState().isOnline) {
      setResult({ created: 0, errors: [{ row: 0, error: 'Import is not available in offline mode. Go to Settings → Connection and switch back to Online, then try again.' }] });
      setPhase('done');
      return;
    }

    setPhase('importing');
    try {
      const res = await estimationsApi.batchImport(
        valid.map(r => ({
          title:        r.title,
          project_name: r.project_name  || undefined,
          project_id:   projectId       || undefined,
          description:  r.description   || undefined,
          complexity:   r.complexity,
          risk:         r.risk,
          competency:   r.competency,
          work_group:   r.work_group,
          notes:        r.notes         || undefined,
        }))
      );
      setResult({ created: res.created ?? 0, errors: res.errors ?? [] });
      setPhase('done');
      if (res.created > 0) onSuccess();
    } catch (e) {
      setResult({ created: 0, errors: [{ row: 0, error: e instanceof Error ? e.message : 'Import failed' }] });
      setPhase('done');
    }
  };

  const validCount = rows.filter(r => r.valid).length;
  const errorCount = rows.filter(r => !r.valid).length;

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer =
    phase === 'upload' ? (
      <Button variant="outline" onClick={handleClose}>Cancel</Button>
    ) : phase === 'preview' ? (
      <>
        <Button variant="outline" onClick={reset}>← Back</Button>
        <Button onClick={handleImport} disabled={validCount === 0}>
          Import {validCount} record{validCount !== 1 ? 's' : ''}
          {errorCount > 0 ? ` (skip ${errorCount} invalid)` : ''}
        </Button>
      </>
    ) : phase === 'done' ? (
      <Button onClick={handleClose}>Close</Button>
    ) : null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Estimations from Excel" size="xl" footer={footer}>

      {/* ── Upload ──────────────────────────────────────────────────────── */}
      {phase === 'upload' && (
        <div className="space-y-4">
          {/* Template download banner */}
          <div className="flex items-center justify-between gap-4 p-4 bg-lgrayblue/15 dark:bg-carbon-800/50 rounded-xl border border-lgrayblue/30 dark:border-slate-700">
            <div>
              <p className="text-sm font-semibold text-carbon dark:text-white">Step 1 — Download the Template</p>
              <p className="text-xs text-coolslate mt-0.5">Fill it in, then upload below. Estimated & Actual Hours are entered manually after import.</p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="flex-shrink-0">
              <Download size={13} /> Download Template
            </Button>
          </div>

          {/* Project context */}
          <div className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs',
            activeProject
              ? 'bg-carbon/5 dark:bg-slate-800/40 border-carbon/15 dark:border-slate-600 text-carbon dark:text-white'
              : 'bg-lgrayblue/10 dark:bg-slate-800/20 border-lgrayblue/20 dark:border-slate-700 text-coolslate'
          )}>
            <FileSpreadsheet size={13} className="flex-shrink-0" />
            {activeProject
              ? <span>Records will be imported into <span className="font-semibold">{activeProject.name}</span></span>
              : <span>No project selected — records will not be associated with any project. Select a project from the top navigation before importing.</span>
            }
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl py-12 flex flex-col items-center gap-3 cursor-pointer transition-all select-none',
              dragOver
                ? 'border-carbon dark:border-lgrayblue bg-carbon/5 dark:bg-lgrayblue/5'
                : 'border-lgrayblue/40 dark:border-slate-600 hover:border-carbon/50 dark:hover:border-slate-400 hover:bg-lgrayblue/5 dark:hover:bg-slate-800/30'
            )}
          >
            <UploadCloud size={36} className={cn('transition-colors', dragOver ? 'text-carbon dark:text-white' : 'text-coolslate')} />
            <div className="text-center">
              <p className="text-sm font-medium text-carbon dark:text-white">Drag & drop your Excel file here</p>
              <p className="text-xs text-coolslate mt-0.5">
                or <span className="text-carbon dark:text-lgrayblue underline underline-offset-2">click to browse</span>
              </p>
            </div>
            <p className="text-xs text-coolslate/60">Supports .xlsx and .xls</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = ''; }}
            />
          </div>
        </div>
      )}

      {/* ── Preview ─────────────────────────────────────────────────────── */}
      {phase === 'preview' && (
        <div className="space-y-3">
          {/* Summary row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-coolslate">
              <FileSpreadsheet size={13} />
              <span className="font-medium text-carbon dark:text-white truncate max-w-[200px]">{fileName}</span>
              <span>·</span>
              <span>{rows.length} row{rows.length !== 1 ? 's' : ''} found</span>
            </div>
            <div className="flex gap-2 ml-auto">
              <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-greenline/10 text-greenline border border-greenline/20">
                <CheckCircle size={11} /> {validCount} valid
              </span>
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-vibrant/10 text-vibrant border border-vibrant/20">
                  <AlertCircle size={11} /> {errorCount} invalid
                </span>
              )}
            </div>
          </div>

          {/* Rows table */}
          <div className="rounded-xl border border-lgrayblue/30 dark:border-slate-700 overflow-hidden">
            <div className="overflow-y-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-lgrayblue/20 dark:bg-carbon-800/90">
                  <tr>
                    {['Row', 'Title', 'Project', 'Complexity', 'Risk', 'Competency', 'Work Group', 'Validation'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left font-semibold text-coolslate uppercase tracking-wide whitespace-nowrap first:pl-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.rowNum} className={cn(
                      'border-t border-lgrayblue/20 dark:border-slate-700/50 align-top',
                      !row.valid && 'bg-vibrant/5 dark:bg-vibrant/5'
                    )}>
                      <td className="px-4 py-2.5 text-coolslate font-mono whitespace-nowrap">{row.rowNum}</td>
                      <td className="px-3 py-2.5 font-medium text-carbon dark:text-white max-w-[140px]">
                        <span className="block truncate" title={row.title}>
                          {row.title || <span className="text-vibrant italic font-normal">empty</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-coolslate max-w-[90px]">
                        <span className="block truncate">{row.project_name || '—'}</span>
                      </td>
                      <td className={cn('px-3 py-2.5 whitespace-nowrap',
                        row.complexity && !COMPLEXITY_OPTIONS.includes(row.complexity as typeof COMPLEXITY_OPTIONS[number]) && 'text-vibrant font-semibold'
                      )}>
                        {row.complexity || <span className="text-vibrant italic font-normal">missing</span>}
                      </td>
                      <td className={cn('px-3 py-2.5 whitespace-nowrap',
                        row.risk && !RISK_OPTIONS.includes(row.risk as typeof RISK_OPTIONS[number]) && 'text-vibrant font-semibold'
                      )}>
                        {row.risk || <span className="text-vibrant italic font-normal">missing</span>}
                      </td>
                      <td className={cn('px-3 py-2.5 whitespace-nowrap',
                        row.competency && !COMPETENCY_OPTIONS.includes(row.competency as typeof COMPETENCY_OPTIONS[number]) && 'text-vibrant font-semibold'
                      )}>
                        {row.competency || <span className="text-vibrant italic font-normal">missing</span>}
                      </td>
                      <td className={cn('px-3 py-2.5 whitespace-nowrap',
                        row.work_group && !WORK_GROUP_OPTIONS.includes(row.work_group as typeof WORK_GROUP_OPTIONS[number]) && 'text-vibrant font-semibold'
                      )}>
                        {row.work_group || <span className="text-vibrant italic font-normal">missing</span>}
                      </td>
                      <td className="px-3 py-2.5 min-w-[160px]">
                        {row.valid ? (
                          <span className="flex items-center gap-1 text-greenline font-semibold">
                            <CheckCircle size={11} /> Valid
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            {row.errors.map((err, j) => (
                              <p key={j} className="flex items-start gap-1 text-vibrant leading-snug">
                                <AlertCircle size={10} className="mt-0.5 flex-shrink-0" />
                                <span>{err}</span>
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {errorCount > 0 && validCount > 0 && (
            <p className="text-xs text-coolslate">Rows with errors will be skipped. Only the {validCount} valid record{validCount !== 1 ? 's' : ''} will be imported.</p>
          )}
          {validCount === 0 && (
            <div className="flex items-center gap-2 text-xs text-vibrant font-medium">
              <AlertCircle size={13} />
              All rows have errors. Fix them in the file and upload again.
            </div>
          )}
        </div>
      )}

      {/* ── Importing ───────────────────────────────────────────────────── */}
      {phase === 'importing' && (
        <div className="flex flex-col items-center py-14 gap-3">
          <Loader2 size={28} className="animate-spin text-carbon dark:text-lgrayblue" />
          <p className="text-sm text-coolslate">Importing {validCount} record{validCount !== 1 ? 's' : ''}…</p>
        </div>
      )}

      {/* ── Done ────────────────────────────────────────────────────────── */}
      {phase === 'done' && result && (
        <div className="space-y-3 py-1">
          {result.created > 0 && (
            <div className="flex items-center gap-3 p-4 bg-greenline/10 border border-greenline/20 rounded-xl">
              <CheckCircle size={18} className="text-greenline flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-carbon dark:text-white">
                  {result.created} estimation{result.created !== 1 ? 's' : ''} imported successfully
                </p>
                <p className="text-xs text-coolslate mt-0.5">
                  Open each record to enter Estimated Hours and Actual Hours when ready.
                </p>
              </div>
            </div>
          )}
          {(result.errors ?? []).length > 0 && (
            <div className="border border-vibrant/20 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-vibrant/5 border-b border-vibrant/10">
                <AlertCircle size={13} className="text-vibrant" />
                <p className="text-xs font-semibold text-vibrant">
                  {result.errors.length} row{result.errors.length !== 1 ? 's' : ''} failed
                </p>
              </div>
              <div className="max-h-36 overflow-y-auto divide-y divide-vibrant/10">
                {(result.errors ?? []).map(({ row, error }) => (
                  <div key={`${row}-${error}`} className="px-4 py-2 text-xs text-coolslate">
                    {row > 0 && (
                      <span className="font-semibold text-carbon dark:text-white mr-1">Row {row}:</span>
                    )}
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.created === 0 && (result.errors ?? []).length === 0 && (
            <p className="text-sm text-coolslate text-center py-6">No records were imported.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
