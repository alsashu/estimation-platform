import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Eye, EyeOff, Loader2, UserPlus, CheckCircle } from 'lucide-react';
import { authApi, projectsApi, rolesApi } from '../../services/api';
import type { ProjectRecord, RoleRecord } from '../../services/api';

function PasswordStrengthBar({ password }: { password: string }) {
  const checks = [
    { label: 'Min 8 chars', ok: password.length >= 8 },
    { label: 'Uppercase', ok: /[A-Z]/.test(password) },
    { label: 'Lowercase', ok: /[a-z]/.test(password) },
    { label: 'Number', ok: /[0-9]/.test(password) },
    { label: 'Special char', ok: /[!@#$%^&*]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['bg-vibrant', 'bg-vibrant', 'bg-gold', 'bg-gold', 'bg-greenline'];

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1.5">
        {checks.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score - 1] : 'bg-lgrayblue/40'}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {checks.map(c => (
          <span key={c.label} className={`text-[10px] flex items-center gap-1 ${c.ok ? 'text-greenline' : 'text-coolslate'}`}>
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${c.ok ? 'bg-greenline' : 'bg-coolslate/40'}`} />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '', lastName: '', username: '', email: '', password: '',
    requestedProjectId: '', requestedRoleId: '',
  });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);

  useEffect(() => {
    // Load projects and roles for registration dropdowns
    projectsApi.list({ limit: 100 }).then(r => setProjects(r.data)).catch(() => {});
    rolesApi.list().then(r => setRoles(r.filter(role => !role.name.includes('Super Admin')))).catch(() => {});
  }, []);

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.username || !form.email || !form.password) {
      setError('All required fields must be filled'); return;
    }
    setLoading(true);
    setError('');
    try {
      await authApi.register({
        firstName: form.firstName, lastName: form.lastName,
        username: form.username, email: form.email, password: form.password,
        requestedProjectId: form.requestedProjectId || undefined,
        requestedRoleId: form.requestedRoleId || undefined,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-offwhite dark:bg-carbon-900 px-4">
        <div className="w-full max-w-md bg-white dark:bg-carbon-800 rounded-2xl shadow-modal border border-lgrayblue/30 dark:border-slate-700 p-8 text-center">
          <CheckCircle size={48} className="text-greenline mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-carbon dark:text-white mb-2">Registration Submitted</h1>
          <p className="text-coolslate text-sm mb-6">
            Your registration request has been submitted. An administrator will review and approve your access.
            You will be notified once your account is approved.
          </p>
          <button onClick={() => navigate('/login')} className="px-6 py-2.5 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg font-medium text-sm hover:opacity-90 transition-all">
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-offwhite dark:bg-carbon-900 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
            <BarChart3 size={20} className="text-white" />
          </div>
          <div>
            <p className="text-carbon dark:text-white font-display font-bold text-lg leading-tight">Request Access</p>
            <p className="text-coolslate text-xs">Estimation Platform</p>
          </div>
        </div>

        <div className="bg-white dark:bg-carbon-800 rounded-2xl shadow-modal border border-lgrayblue/30 dark:border-slate-700 p-8">
          <h1 className="text-xl font-semibold text-carbon dark:text-white mb-1">Create Account</h1>
          <p className="text-coolslate text-sm mb-6">Your request will be reviewed by an administrator</p>

          {error && (
            <div className="mb-4 p-3 bg-vibrant/10 border border-vibrant/30 rounded-lg text-vibrant text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {(['firstName', 'lastName'] as const).map(f => (
                <div key={f}>
                  <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">
                    {f === 'firstName' ? 'First Name' : 'Last Name'} *
                  </label>
                  <input
                    value={form[f]} onChange={e => update(f, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-lgrayblue/50 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-carbon/20"
                  />
                </div>
              ))}
            </div>

            {[
              { field: 'username', label: 'Username *', type: 'text', placeholder: 'john.doe' },
              { field: 'email',    label: 'Email *',    type: 'email', placeholder: 'you@example.com' },
            ].map(({ field, label, type, placeholder }) => (
              <div key={field}>
                <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">{label}</label>
                <input
                  type={type} value={(form as Record<string,string>)[field]}
                  onChange={e => update(field, e.target.value)}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 rounded-lg border border-lgrayblue/50 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-carbon/20"
                />
              </div>
            ))}

            <div>
              <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Password *</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password} onChange={e => update('password', e.target.value)}
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-lgrayblue/50 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-carbon/20"
                />
                <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-coolslate">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.password && <PasswordStrengthBar password={form.password} />}
            </div>

            {projects.length > 0 && (
              <div>
                <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Requested Project</label>
                <select
                  value={form.requestedProjectId} onChange={e => update('requestedProjectId', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-lgrayblue/50 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-carbon/20"
                >
                  <option value="">Select a project (optional)</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                </select>
              </div>
            )}

            {roles.length > 0 && (
              <div>
                <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Requested Role</label>
                <select
                  value={form.requestedRoleId} onChange={e => update('requestedRoleId', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-lgrayblue/50 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-carbon/20"
                >
                  <option value="">Select a role (optional)</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-lgrayblue/30 dark:border-slate-700 text-center">
            <span className="text-sm text-coolslate">Already have an account? </span>
            <Link to="/login" className="text-sm text-carbon dark:text-white font-medium hover:underline">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
