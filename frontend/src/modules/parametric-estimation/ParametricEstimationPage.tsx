import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Sigma, Database, Layers, TrendingUp,
  Clock, Calculator, ChevronRight, Activity,
} from 'lucide-react';
import { Card } from '../../components/ui';

// ─── Animation variants ───────────────────────────────────────────────────────
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

// ─── Feature data ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Database,
    title: 'Historical Data Learning',
    desc: 'Train estimation models on past project data to continuously improve accuracy over time.',
    iconBg: 'bg-greenline/10 dark:bg-greenline/5 border border-greenline/20',
    iconColor: 'text-greenline',
  },
  {
    icon: Layers,
    title: 'Configurable Parameters',
    desc: 'Define custom variables — team composition, technology stack, project type, domain complexity.',
    iconBg: 'bg-gold/10 dark:bg-gold/5 border border-gold/20',
    iconColor: 'text-gold',
  },
  {
    icon: TrendingUp,
    title: 'Predictive Analytics',
    desc: 'Get confidence intervals and risk-adjusted estimates using regression and variance analysis.',
    iconBg: 'bg-lgrayblue/30 dark:bg-slate-700/50 border border-lgrayblue/40 dark:border-slate-600',
    iconColor: 'text-carbon dark:text-lgrayblue',
  },
];

// ─── Progress milestone labels ────────────────────────────────────────────────
const MILESTONES = ['Planning', 'Design', 'Build', 'Testing', 'Release'];

export default function ParametricEstimationPage() {
  return (
    <motion.div
      className="flex flex-col gap-5 min-w-0"
      variants={stagger}
      initial="hidden"
      animate="show"
    >

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <Card padding="p-0" className="overflow-hidden">
          <div className="relative flex flex-col items-center justify-center text-center px-6 py-20 md:py-28 bg-gradient-primary overflow-hidden">

            {/* Decorative background blobs */}
            <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
              <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/[0.03]" />
              <div className="absolute -bottom-28 -right-20 w-[32rem] h-[32rem] rounded-full bg-white/[0.03]" />
              <div className="absolute top-1/3 left-1/4 w-48 h-48 rounded-full bg-greenline/[0.07]" />
              {/* Math watermarks for visual texture */}
              <span className="absolute top-6 left-8 text-white/[0.045] text-9xl font-mono font-bold leading-none">Σ</span>
              <span className="absolute bottom-8 right-10 text-white/[0.045] text-7xl font-mono font-bold leading-none">f(x)</span>
              <span className="absolute top-1/2 right-5 -translate-y-1/2 text-white/[0.045] text-8xl font-mono font-bold leading-none">μ</span>
              <span className="absolute top-10 right-1/3 text-white/[0.045] text-5xl font-mono font-bold leading-none">β</span>
              <span className="absolute bottom-16 left-1/3 text-white/[0.045] text-4xl font-mono font-bold leading-none">σ²</span>
            </div>

            {/* Animated floating icon */}
            <motion.div
              className="relative mb-8 z-10"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="w-24 h-24 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center shadow-xl">
                <Sigma size={44} className="text-white" />
              </div>
              <span className="absolute -top-2.5 -right-2.5 bg-gold text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider leading-none shadow-sm">
                Soon
              </span>
            </motion.div>

            {/* Under development badge */}
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-white/80 border border-white/20 backdrop-blur mb-5 z-10">
              Under Development
            </span>

            <h1 className="text-4xl sm:text-5xl font-display font-bold text-white mb-4 z-10 relative">
              Parametric Estimation
            </h1>

            <p className="text-white/65 text-base sm:text-lg max-w-xl mb-10 leading-relaxed z-10 relative">
              A smarter estimation engine powered by historical data, configurable
              parameters, and predictive statistical models — coming soon.
            </p>

            <Link to="/estimate" className="z-10 relative">
              <button
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold
                           bg-white/15 hover:bg-white/25 text-white border border-white/25 hover:border-white/40
                           backdrop-blur transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-white/30"
              >
                <Calculator size={15} />
                Use Storypoint Estimation
                <ChevronRight size={14} className="opacity-70" />
              </button>
            </Link>
          </div>
        </Card>
      </motion.div>

      {/* ── Planned feature cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {FEATURES.map((feat) => (
          <motion.div key={feat.title} variants={fadeUp} className="flex min-w-0">
            <Card padding="p-5" className="flex flex-col gap-4 w-full min-w-0">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${feat.iconBg}`}>
                <feat.icon size={20} className={feat.iconColor} />
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-semibold text-carbon dark:text-white mb-1.5 leading-snug">
                  {feat.title}
                </h3>
                <p className="text-sm text-coolslate leading-relaxed">{feat.desc}</p>
              </div>
              <div className="mt-auto pt-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-coolslate/70 dark:text-lgrayblue/50">
                  <Clock size={10} />
                  Planned
                </span>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ── Development status bar ────────────────────────────────────────── */}
      {/* <motion.div variants={fadeUp}>
        <Card padding="p-5" className="bg-carbon/[0.02] dark:bg-carbon-800/30">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">

            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
                <Clock size={18} className="text-gold" />
              </div>
              <div>
                <p className="text-sm font-semibold text-carbon dark:text-white">In Active Development</p>
                <p className="text-xs text-coolslate mt-0.5">Estimated release: Q3 2026</p>
              </div>
            </div>

            <div className="w-full sm:w-80 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Activity size={12} className="text-greenline" />
                  <span className="text-xs text-coolslate">Build Phase</span>
                </div>
                <span className="text-xs font-semibold text-carbon dark:text-white">35%</span>
              </div>

              <div className="relative h-2 bg-lgrayblue/30 dark:bg-slate-700 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-carbon to-greenline"
                  initial={{ width: 0 }}
                  animate={{ width: '35%' }}
                  transition={{ duration: 1.2, delay: 0.6, ease: 'easeOut' }}
                />
              </div>

              <div className="flex justify-between mt-2">
                {MILESTONES.map((m, i) => (
                  <span
                    key={m}
                    className={`text-[10px] font-medium ${
                      i <= 2
                        ? 'text-carbon dark:text-lgrayblue'
                        : 'text-coolslate/50 dark:text-lgrayblue/30'
                    }`}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>

          </div>
        </Card>
      </motion.div> */}

    </motion.div>
  );
}
