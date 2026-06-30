import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { BarChart3, Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { authApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth } = useAuthStore();
  const { addToast } = useToastStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const from = (location.state as { from?: string })?.from || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password are required'); return; }

    setLoading(true);
    setError('');
    try {
      const result = await authApi.login(email, password);
      setAuth(result.user, result.accessToken, result.refreshToken);
      addToast({ type: 'success', title: `Welcome back, ${result.user.firstName}!` });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-offwhite dark:bg-carbon-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
            <BarChart3 size={20} className="text-white" />
          </div>
          <div>
            <p className="text-carbon dark:text-white font-display font-bold text-lg leading-tight">Estimation Platform</p>
            <p className="text-coolslate text-xs">Enterprise Edition</p>
          </div>
        </div>

        <div className="bg-white dark:bg-carbon-800 rounded-2xl shadow-modal border border-lgrayblue/30 dark:border-slate-700 p-8">
          <h1 className="text-xl font-semibold text-carbon dark:text-white mb-1">Sign in</h1>
          <p className="text-coolslate text-sm mb-6">Enter your credentials to access the platform</p>

          {error && (
            <div className="mb-4 p-3 bg-vibrant/10 border border-vibrant/30 rounded-lg text-vibrant text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue/50 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-carbon/20 dark:focus:ring-white/20"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-carbon dark:text-lgrayblue">Password</label>
                <Link to="/forgot-password" className="text-xs text-coolslate hover:text-carbon dark:hover:text-white">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 pr-10 rounded-lg border border-lgrayblue/50 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-carbon/20 dark:focus:ring-white/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-coolslate hover:text-carbon dark:hover:text-white"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-lgrayblue/30 dark:border-slate-700 text-center">
            <span className="text-sm text-coolslate">Don't have an account? </span>
            <Link to="/register" className="text-sm text-carbon dark:text-white font-medium hover:underline">
              Request access
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
