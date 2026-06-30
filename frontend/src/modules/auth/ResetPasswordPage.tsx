import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { BarChart3, Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { authApi } from '../../services/api';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-offwhite dark:bg-carbon-900 px-4">
        <div className="bg-white dark:bg-carbon-800 rounded-2xl shadow-modal border border-lgrayblue/30 dark:border-slate-700 p-8 text-center max-w-sm">
          <p className="text-vibrant font-medium mb-4">Invalid or missing reset token.</p>
          <Link to="/forgot-password" className="text-sm text-carbon dark:text-white underline">Request new link</Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirm) { setError('Both fields are required'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    setError('');
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-offwhite dark:bg-carbon-900 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
            <BarChart3 size={20} className="text-white" />
          </div>
          <p className="text-carbon dark:text-white font-display font-bold text-lg">Estimation Platform</p>
        </div>

        <div className="bg-white dark:bg-carbon-800 rounded-2xl shadow-modal border border-lgrayblue/30 dark:border-slate-700 p-8">
          {done ? (
            <div className="text-center">
              <CheckCircle size={44} className="text-greenline mx-auto mb-3" />
              <h1 className="text-lg font-semibold text-carbon dark:text-white mb-2">Password Reset!</h1>
              <p className="text-coolslate text-sm mb-5">Your password has been reset successfully.</p>
              <button onClick={() => navigate('/login')} className="px-6 py-2.5 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg font-medium text-sm hover:opacity-90 transition-all">
                Sign in
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-carbon dark:text-white mb-1">Set New Password</h1>
              <p className="text-coolslate text-sm mb-6">Choose a strong password</p>

              {error && <div className="mb-4 p-3 bg-vibrant/10 border border-vibrant/30 rounded-lg text-vibrant text-sm">{error}</div>}

              <form onSubmit={handleSubmit} className="space-y-4">
                {[
                  { val: password, set: setPassword, label: 'New Password' },
                  { val: confirm,  set: setConfirm,  label: 'Confirm Password' },
                ].map(({ val, set, label }, idx) => (
                  <div key={idx}>
                    <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">{label}</label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={val} onChange={e => set(e.target.value)}
                        className="w-full px-3 py-2.5 pr-10 rounded-lg border border-lgrayblue/50 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-carbon/20"
                      />
                      {idx === 0 && (
                        <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-coolslate">
                          {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
