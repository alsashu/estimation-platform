import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, UploadCloud, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { Card, Button } from '../../components/ui';
import { parametricEstimationsApi } from '../../services/api';
import { useProjectStore } from '../../store/projectStore';
import { cn } from '../../utils/formatters';
import type { ParametricSize } from '../../types';

const SIZE_OPTIONS: ParametricSize[] = ['Small', 'Medium', 'Large', 'NA'];
const TEAM_EFFICIENCY_OPTIONS = [1, 0.8, 0.5];

const HEADERS = [
  'Task Title *', 'Project', 'Description', 'Work Group',
  'Middleware Inputs *', 'Application *', 'System Configuration *', 'Data and Control Flow *', 'Use Case *',
  'Team Efficiency *',
];

const SAMPLE_ROWS = [
  ['Customer Onboarding API', 'Alpha Platform', 'Integrate new KYC provider', 'DEVELOPMENT', 'Small', 'Medium', 'NA', 'Small', 'Medium', 1],
  ['Payment Gateway Revamp', 'Beta Infrastructure', 'Replace legacy payment middleware', 'DEVELOPMENT', 'Large', 'Large', 'NA', 'Large', 'Large', 0.8],
  ['Reporting Dashboard v2', '', 'Internal analytics dashboard refresh', 'SPECIFICATION', 'NA', 'Medium', 'Small', 'NA', 'Medium', 0.5],
];

function normalizeSize(val: string): ParametricSize | null {
  const t = val.trim();
  return (SIZE_OPTIONS.find(o => o.toLowerCase() === t.toLowerCase()) ?? null);
}

function normalizeTeamEfficiency(val: string): number | null {
  const t = val.trim().replace('%', '');
  const asNum = parseFloat(t);
  if (isNaN(asNum)) return null;
  const normalized = asNum > 1 ? asNum / 100 : asNum;
  const match = TEAM_EFFICIENCY_OPTIONS.find(o => Math.abs(o - normalized) < 0.001);
  return match ?? null;
}

interface ParsedRow {
  rowNum: number;
  task_title: string;
  project_name: string;
  project_id?: string;
  description: string;
  work_group: string;
  middleware_inputs: string;
  application: string;
  system_configuration: string;
  data_and_control_flow: string;
  use_case: string;
  team_efficiency_raw: string;
  team_efficiency?: number;
  errors: string[];
  valid: boolean;
}

interface ImportResult {
  created: number;
  errors: { row: number; error: string }[];
}

type Phase = 'upload' | 'preview' | 'importing' | 'done';

export function ParametricExcelUpload({ onSuccess }: { onSuccess: () => void }) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { projects } = useProjectStore();

  const reset = () => { setPhase('upload'); setRows([]); setFileName(''); setFileError(''); setResult(null); };

  // ── Template download ──────────────────────────────────────────────────────
  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...SAMPLE_ROWS]);
    ws['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 32 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Parametric Estimation Input');

    const instructions = [
      ['Parametric Estimation — Excel Upload Instructions'],
      [''],
      ['Purpose'],
      ['Use this template to submit multiple Parametric Estimation records at once. Fill in the "Parametric Estimation Input" sheet and upload it from the Excel Upload tab.'],
      [''],
      ['Column Guide'],
      ['Column', 'Required', 'Description'],
      ['Task Title', 'Yes', 'Short name of the task being estimated (max 255 characters).'],
      ['Project', 'No', 'Exact name of an existing project. If it matches a project you have access to, that project’s master data configuration is used automatically. If left blank or unmatched, the default master data configuration is used.'],
      ['Description', 'No', 'Free-text description of the task.'],
      ['Work Group', 'No', 'Free-text work group / team label, e.g. DEVELOPMENT, VALIDATION, SPECIFICATION.'],
      ['Middleware Inputs', 'Yes', 'One of: Small, Medium, Large, NA'],
      ['Application', 'Yes', 'One of: Small, Medium, Large, NA'],
      ['System Configuration', 'Yes', 'One of: Small, Medium, Large, NA'],
      ['Data and Control Flow', 'Yes', 'One of: Small, Medium, Large, NA'],
      ['Use Case', 'Yes', 'One of: Small, Medium, Large, NA'],
      ['Team Efficiency', 'Yes', 'One of: 1 (Experienced / 100%), 0.8 (Intermediate / 80%), 0.5 (Beginner / 50%)'],
      [''],
      ['Calculation Behavior'],
      ['Multiplier, Detailed Estimation, Average Estimation and Final Estimation are calculated automatically by the system using the current master data configuration — do not enter them in the template.'],
      ['NA contributes 0 to both the Detailed and Average Estimation for that field.'],
      [''],
      ['Upload Rules'],
      ['• Row 1 must be the header row exactly as provided in this template — do not rename, reorder, or remove columns.'],
      ['• Data starts from row 2. Delete the 3 sample rows before uploading your own data, or leave them if they are valid examples you want imported.'],
      ['• Completely empty rows are skipped automatically.'],
      ['• Only .xlsx and .xls files are supported.'],
      [''],
      ['Validation Rules'],
      ['• Task Title, the five complexity fields, and Team Efficiency are required on every row.'],
      ['• Complexity fields only accept Small, Medium, Large or NA (case-insensitive).'],
      ['• Team Efficiency only accepts 1, 0.8 or 0.5 (100%, 80%, 50% are also accepted).'],
      ['• Rows that fail validation are listed with the row number, field, invalid value and required correction — they are skipped and not imported.'],
      ['• Only valid rows are imported; you will see a summary of how many rows succeeded and failed after upload.'],
      [''],
      ['Examples'],
      ['Valid:   Middleware Inputs = "Medium", Team Efficiency = 0.8'],
      ['Invalid: Middleware Inputs = "medium-large" (not a recognised size)'],
      ['Invalid: Team Efficiency = 0.9 (must be 1, 0.8 or 0.5)'],
    ];
    const refWs = XLSX.utils.aoa_to_sheet(instructions);
    refWs['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, refWs, 'Instructions');

    XLSX.writeFile(wb, 'parametric_estimation_import_template.xlsx');
  };

  // ── File parsing & validation ──────────────────────────────────────────────
  const parseFile = async (file: File) => {
    setFileError('');
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setFileError('Unsupported file format. Please upload a .xlsx or .xls file.');
      return;
    }

    const XLSX = await import('xlsx');
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(data, { type: 'array' });
      if (!wb.SheetNames.length) { setFileError('The workbook has no worksheets.'); return; }

      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
      if (raw.length === 0) { setFileError('Invalid worksheet structure — the first sheet appears to be empty.'); return; }

      const header = (raw[0] as unknown[]).map(h => String(h ?? '').trim());
      const expectedCore = HEADERS.map(h => h.replace(' *', ''));
      const actualCore = header.map(h => h.replace(' *', ''));
      const headerMatches = expectedCore.every((h, i) => actualCore[i]?.toLowerCase() === h.toLowerCase());
      if (!headerMatches) {
        setFileError(`Column headers don't match the template. Expected: ${HEADERS.join(', ')}. Please download the template and use it as-is.`);
        return;
      }

      const parsed: ParsedRow[] = [];
      const seen = new Set<string>();

      for (let i = 1; i < raw.length; i++) {
        const row = raw[i] as unknown[];
        if (!row || row.every(c => !String(c ?? '').trim())) continue; // skip empty rows

        const s = (n: number) => String(row[n] ?? '').trim();
        const task_title = s(0);
        const project_name = s(1);
        const description = s(2);
        const work_group = s(3);
        const mwRaw = s(4), appRaw = s(5), scRaw = s(6), dcRaw = s(7), ucRaw = s(8), teRaw = s(9);

        const errors: string[] = [];
        if (!task_title) errors.push('Task Title is required');
        else if (task_title.length > 255) errors.push('Task Title exceeds 255 characters');

        const mw = normalizeSize(mwRaw);
        if (!mwRaw) errors.push('Middleware Inputs is required');
        else if (!mw) errors.push(`Invalid Middleware Inputs "${mwRaw}" — valid values: Small, Medium, Large, NA`);

        const app = normalizeSize(appRaw);
        if (!appRaw) errors.push('Application is required');
        else if (!app) errors.push(`Invalid Application "${appRaw}" — valid values: Small, Medium, Large, NA`);

        const sc = normalizeSize(scRaw);
        if (!scRaw) errors.push('System Configuration is required');
        else if (!sc) errors.push(`Invalid System Configuration "${scRaw}" — valid values: Small, Medium, Large, NA`);

        const dc = normalizeSize(dcRaw);
        if (!dcRaw) errors.push('Data and Control Flow is required');
        else if (!dc) errors.push(`Invalid Data and Control Flow "${dcRaw}" — valid values: Small, Medium, Large, NA`);

        const uc = normalizeSize(ucRaw);
        if (!ucRaw) errors.push('Use Case is required');
        else if (!uc) errors.push(`Invalid Use Case "${ucRaw}" — valid values: Small, Medium, Large, NA`);

        const te = normalizeTeamEfficiency(teRaw);
        if (!teRaw) errors.push('Team Efficiency is required');
        else if (te == null) errors.push(`Invalid Team Efficiency "${teRaw}" — valid values: 1, 0.8, 0.5`);

        const matchedProject = project_name
          ? projects.find(p => p.name.toLowerCase() === project_name.toLowerCase())
          : undefined;

        const dedupeKey = [task_title, project_name, mwRaw, appRaw, scRaw, dcRaw, ucRaw, teRaw].join('|').toLowerCase();
        if (task_title && seen.has(dedupeKey)) {
          errors.push('Duplicate row — identical to an earlier row in this file');
        }
        seen.add(dedupeKey);

        parsed.push({
          rowNum: i + 1,
          task_title, project_name, project_id: matchedProject?.id,
          description, work_group,
          middleware_inputs: mw || mwRaw, application: app || appRaw, system_configuration: sc || scRaw,
          data_and_control_flow: dc || dcRaw, use_case: uc || ucRaw,
          team_efficiency_raw: teRaw, team_efficiency: te ?? undefined,
          errors, valid: errors.length === 0,
        });
      }

      if (parsed.length === 0) {
        setFileError('No data rows found. Make sure data starts from row 2 (row 1 is the header) and rows are not all empty.');
        return;
      }

      setRows(parsed);
      setFileName(file.name);
      setPhase('preview');
    } catch {
      setFileError('Could not read the file. Please make sure it is a valid, non-corrupted .xlsx or .xls file.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const valid = rows.filter(r => r.valid);
      return parametricEstimationsApi.batchImport(
        valid.map(r => ({
          task_title: r.task_title,
          project_id: r.project_id,
          project_name: r.project_name || undefined,
          description: r.description || undefined,
          work_group: r.work_group || undefined,
          middleware_inputs: r.middleware_inputs as ParametricSize,
          application: r.application as ParametricSize,
          system_configuration: r.system_configuration as ParametricSize,
          data_and_control_flow: r.data_and_control_flow as ParametricSize,
          use_case: r.use_case as ParametricSize,
          team_efficiency: r.team_efficiency!,
        }))
      );
    },
    onSuccess: (res) => {
      setResult({ created: res.created ?? 0, errors: res.errors ?? [] });
      setPhase('done');
      if (res.created > 0) onSuccess();
    },
    onError: (e: Error) => {
      setResult({ created: 0, errors: [{ row: 0, error: e.message }] });
      setPhase('done');
    },
  });

  const validCount = rows.filter(r => r.valid).length;
  const errorCount = rows.filter(r => !r.valid).length;

  return (
    <div className="space-y-5">
      {/* Template download */}
      <Card padding="p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-carbon dark:text-white">Step 1 — Download the Template</p>
            <p className="text-xs text-coolslate mt-0.5">Includes example records and a full Instructions sheet.</p>
          </div>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download size={13} /> Download Template
          </Button>
        </div>
      </Card>

      {phase === 'upload' && (
        <Card padding="p-5">
          <p className="text-sm font-semibold text-carbon dark:text-white mb-3">Step 2 — Upload Your File</p>
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
              ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = ''; }}
            />
          </div>
          {fileError && (
            <div className="mt-3 flex items-start gap-2 text-xs text-vibrant bg-vibrant/5 border border-vibrant/20 rounded-lg p-3">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{fileError}</span>
            </div>
          )}
        </Card>
      )}

      {phase === 'preview' && (
        <Card padding="p-5" className="space-y-4">
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

          <div className="rounded-xl border border-lgrayblue/30 dark:border-slate-700 overflow-hidden">
            <div className="overflow-y-auto max-h-80 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-lgrayblue/20 dark:bg-carbon-800/90">
                  <tr>
                    {['Row', 'Task Title', 'Project', 'MWI', 'App', 'SysCfg', 'D&CF', 'UC', 'TE', 'Validation'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left font-semibold text-coolslate uppercase tracking-wide whitespace-nowrap first:pl-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.rowNum} className={cn('border-t border-lgrayblue/20 dark:border-slate-700/50 align-top', !row.valid && 'bg-vibrant/5')}>
                      <td className="px-4 py-2.5 text-coolslate font-mono whitespace-nowrap">{row.rowNum}</td>
                      <td className="px-3 py-2.5 font-medium text-carbon dark:text-white max-w-[160px]">
                        <span className="block truncate" title={row.task_title}>{row.task_title || <span className="text-vibrant italic font-normal">empty</span>}</span>
                      </td>
                      <td className="px-3 py-2.5 text-coolslate max-w-[110px]"><span className="block truncate">{row.project_name || '—'}</span></td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{row.middleware_inputs || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{row.application || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{row.system_configuration || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{row.data_and_control_flow || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{row.use_case || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{row.team_efficiency ?? (row.team_efficiency_raw || '—')}</td>
                      <td className="px-3 py-2.5 min-w-[180px]">
                        {row.valid ? (
                          <span className="flex items-center gap-1 text-greenline font-semibold"><CheckCircle size={11} /> Valid</span>
                        ) : (
                          <div className="space-y-0.5">
                            {row.errors.map((err, j) => (
                              <p key={j} className="flex items-start gap-1 text-vibrant leading-snug">
                                <AlertCircle size={10} className="mt-0.5 flex-shrink-0" /><span>{err}</span>
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
              <AlertCircle size={13} /> All rows have errors. Fix them in the file and upload again.
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={reset}><RotateCcw size={14} /> Start Over</Button>
            <Button onClick={() => importMutation.mutate()} disabled={validCount === 0} loading={importMutation.isPending}>
              Import {validCount} record{validCount !== 1 ? 's' : ''}{errorCount > 0 ? ` (skip ${errorCount} invalid)` : ''}
            </Button>
          </div>
        </Card>
      )}

      {phase === 'importing' && (
        <Card padding="p-14" className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-carbon dark:text-lgrayblue" />
          <p className="text-sm text-coolslate">Importing {validCount} record{validCount !== 1 ? 's' : ''}…</p>
        </Card>
      )}

      {phase === 'done' && result && (
        <Card padding="p-5" className="space-y-3">
          {result.created > 0 && (
            <div className="flex items-center gap-3 p-4 bg-greenline/10 border border-greenline/20 rounded-xl">
              <CheckCircle size={18} className="text-greenline flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-carbon dark:text-white">
                  {result.created} parametric estimation{result.created !== 1 ? 's' : ''} imported successfully
                </p>
                <p className="text-xs text-coolslate mt-0.5">View them in the History tab.</p>
              </div>
            </div>
          )}
          {(result.errors ?? []).length > 0 && (
            <div className="border border-vibrant/20 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-vibrant/5 border-b border-vibrant/10">
                <AlertCircle size={13} className="text-vibrant" />
                <p className="text-xs font-semibold text-vibrant">{result.errors.length} row{result.errors.length !== 1 ? 's' : ''} failed</p>
              </div>
              <div className="max-h-36 overflow-y-auto divide-y divide-vibrant/10">
                {(result.errors ?? []).map(({ row, error }) => (
                  <div key={`${row}-${error}`} className="px-4 py-2 text-xs text-coolslate">
                    {row > 0 && <span className="font-semibold text-carbon dark:text-white mr-1">Row {row}:</span>}
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.created === 0 && (result.errors ?? []).length === 0 && (
            <p className="text-sm text-coolslate text-center py-6">No records were imported.</p>
          )}
          <div className="flex justify-end">
            <Button variant="outline" onClick={reset}><RotateCcw size={14} /> Upload Another File</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
