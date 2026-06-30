import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Loader2, Mail, ArrowLeft } from 'lucide-react';
import { authApi } from '../../services/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ message: string; resetToken?: string; resetUrl?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Email is required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await authApi.forgotPassword(email);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-offwhite dark:bg-carbon-900 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
            <BarChart3 size={20} className="text-white" />
          </div>
          <p className="text-carbon dark:text-white font-display font-bold text-lg">Estimation Platform</p>
        </div>

        <div className="bg-white dark:bg-carbon-800 rounded-2xl shadow-modal border border-lgrayblue/30 dark:border-slate-700 p-8">
          <Link to="/login" className="flex items-center gap-1.5 text-coolslate hover:text-carbon dark:hover:text-white text-sm mb-6">
            <ArrowLeft size={14} /> Back to login
          </Link>

          <h1 className="text-xl font-semibold text-carbon dark:text-white mb-1">Reset Password</h1>
          <p className="text-coolslate text-sm mb-6">Enter your email to receive a reset link</p>

          {error && <div className="mb-4 p-3 bg-vibrant/10 border border-vibrant/30 rounded-lg text-vibrant text-sm">{error}</div>}

          {result ? (
            <div className="space-y-4">
              <div className="p-4 bg-greenline/10 border border-greenline/30 rounded-lg text-greenline text-sm">{result.message}</div>
              {result.resetToken && (
                <div className="p-3 bg-lgrayblue/20 dark:bg-slate-700 rounded-lg text-xs font-mono break-all text-carbon dark:text-white">
                  <p className="text-coolslate mb-1 font-sans text-[10px] uppercase tracking-wide">Dev mode — Reset URL:</p>
                  {result.resetUrl}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Email</label>
                <div className="relative">
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-lgrayblue/50 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-carbon/20"
                  />
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-coolslate" />
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
