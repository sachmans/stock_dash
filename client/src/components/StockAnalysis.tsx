/**
 * Stock Portfolio Tracker — AI Stock Analysis Component
 * Design: Dark Command Center
 * 
 * Displays AI-powered analysis with:
 * - Buy/Sell/Hold recommendation badge
 * - Confidence gauge (0-100)
 * - Summary, bull/bear cases
 * - Key price levels (support, resistance, target)
 * - Risk level indicator
 * - Catalysts to watch
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  Target,
  AlertTriangle,
  Zap,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatNumber } from '@/lib/format';

/* ─── Types ─── */
interface AnalysisData {
  recommendation: string;
  confidence: number;
  summary: string;
  bullCase: string;
  bearCase: string;
  keyLevels: {
    support: number;
    resistance: number;
    target: number;
  };
  riskLevel: string;
  catalysts: string[];
  analyzedAt: number;
  symbol: string;
}

interface StockAnalysisProps {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  volume?: number;
  previousClose?: number;
  currency?: string;
  exchange?: string;
}

/* ─── Recommendation config ─── */
const REC_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: typeof TrendingUp }> = {
  STRONG_BUY: { label: 'Strong Buy', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15 border-emerald-500/30', icon: TrendingUp },
  BUY: { label: 'Buy', color: 'text-green-400', bgColor: 'bg-green-500/15 border-green-500/30', icon: TrendingUp },
  HOLD: { label: 'Hold', color: 'text-amber-400', bgColor: 'bg-amber-500/15 border-amber-500/30', icon: Minus },
  SELL: { label: 'Sell', color: 'text-orange-400', bgColor: 'bg-orange-500/15 border-orange-500/30', icon: TrendingDown },
  STRONG_SELL: { label: 'Strong Sell', color: 'text-red-400', bgColor: 'bg-red-500/15 border-red-500/30', icon: TrendingDown },
};

/* ─── Risk level config ─── */
const RISK_CONFIG: Record<string, { label: string; color: string; bars: number }> = {
  LOW: { label: 'Low', color: 'text-green-400', bars: 1 },
  MEDIUM: { label: 'Medium', color: 'text-amber-400', bars: 2 },
  HIGH: { label: 'High', color: 'text-orange-400', bars: 3 },
  VERY_HIGH: { label: 'Very High', color: 'text-red-400', bars: 4 },
};

/* ─── Confidence Gauge ─── */
function ConfidenceGauge({ value }: { value: number }) {
  // Gauge goes from 0 (sell) to 100 (buy)
  const clampedValue = Math.max(0, Math.min(100, value));
  const rotation = -90 + (clampedValue / 100) * 180; // -90 to 90 degrees
  
  // Determine color based on value
  const getColor = (v: number) => {
    if (v >= 75) return '#34d399'; // emerald
    if (v >= 55) return '#4ade80'; // green
    if (v >= 45) return '#fbbf24'; // amber
    if (v >= 25) return '#fb923c'; // orange
    return '#f87171'; // red
  };

  const color = getColor(clampedValue);

  return (
    <div className="relative flex flex-col items-center">
      <svg width="140" height="80" viewBox="0 0 140 80" className="overflow-visible">
        {/* Background arc */}
        <path
          d="M 10 70 A 60 60 0 0 1 130 70"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          className="text-secondary/40"
        />
        {/* Colored arc segments */}
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="25%" stopColor="#fb923c" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="75%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
        <path
          d="M 10 70 A 60 60 0 0 1 130 70"
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth="8"
          strokeLinecap="round"
          opacity="0.3"
        />
        {/* Needle */}
        <motion.g
          initial={{ rotate: -90 }}
          animate={{ rotate: rotation }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{ transformOrigin: '70px 70px' }}
        >
          <line
            x1="70"
            y1="70"
            x2="70"
            y2="20"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="70" cy="70" r="4" fill={color} />
        </motion.g>
        {/* Labels */}
        <text x="8" y="78" className="fill-red-400/60 text-[8px] font-medium">SELL</text>
        <text x="113" y="78" className="fill-emerald-400/60 text-[8px] font-medium">BUY</text>
      </svg>
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-center -mt-2"
      >
        <span className="font-display font-bold text-2xl tabular-nums" style={{ color }}>
          {clampedValue}
        </span>
        <span className="text-xs text-muted-foreground/60 ml-1">/100</span>
      </motion.div>
    </div>
  );
}

/* ─── Risk Bars ─── */
function RiskBars({ level }: { level: string }) {
  const config = RISK_CONFIG[level] || RISK_CONFIG.MEDIUM;
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4].map((bar) => (
        <div
          key={bar}
          className={`h-3 w-1.5 rounded-sm transition-colors ${
            bar <= config.bars ? config.color.replace('text-', 'bg-') : 'bg-secondary/40'
          }`}
        />
      ))}
      <span className={`text-xs font-medium ml-1 ${config.color}`}>
        {config.label}
      </span>
    </div>
  );
}

/* ─── Main Component ─── */
export default function StockAnalysis(props: StockAnalysisProps) {
  const [expanded, setExpanded] = useState(true);

  // Use tRPC to fetch analysis — enabled only when we have valid price data
  const { data: rawAnalysis, isLoading, refetch, isFetching } = trpc.stock.getAnalysis.useQuery(
    {
      symbol: props.symbol,
      name: props.name,
      price: props.price,
      change: props.change,
      changePercent: props.changePercent,
      dayHigh: props.dayHigh,
      dayLow: props.dayLow,
      fiftyTwoWeekHigh: props.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: props.fiftyTwoWeekLow,
      volume: props.volume,
      previousClose: props.previousClose,
      currency: props.currency,
      exchange: props.exchange,
    },
    {
      enabled: props.price > 0,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      refetchOnWindowFocus: false,
    }
  );

  const analysis = rawAnalysis as AnalysisData | null | undefined;
  const recConfig = analysis ? (REC_CONFIG[analysis.recommendation] || REC_CONFIG.HOLD) : null;
  const RecIcon = recConfig?.icon || Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="glass-card rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-secondary/10 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5">
          <Brain className="h-5 w-5 text-purple-400" />
          <h2 className="font-display font-bold text-foreground text-base">
            AI Analysis
          </h2>
          <span className="text-[10px] uppercase tracking-wider text-purple-400/60 bg-purple-500/10 px-2 py-0.5 rounded-full">
            {props.symbol}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {analysis && !isLoading && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                refetch();
              }}
              disabled={isFetching}
              className="p-1.5 rounded-md hover:bg-secondary/30 transition-colors text-muted-foreground/60 hover:text-muted-foreground"
              title="Refresh analysis"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground/40" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
          )}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4">
              {/* Loading State */}
              {(isLoading || isFetching) && !analysis && (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-400 mb-3" />
                  <p className="text-sm text-muted-foreground">Analyzing {props.name}...</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">AI is reviewing market data</p>
                </div>
              )}

              {/* No data state */}
              {!isLoading && !isFetching && !analysis && props.price > 0 && (
                <div className="flex flex-col items-center justify-center py-8">
                  <Brain className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Analysis unavailable</p>
                  <button
                    onClick={() => refetch()}
                    className="mt-2 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* Analysis Results */}
              {analysis && (
                <>
                  {/* Recommendation + Confidence */}
                  <div className="flex items-start gap-5">
                    {/* Gauge */}
                    <div className="shrink-0">
                      <ConfidenceGauge value={analysis.confidence} />
                    </div>

                    {/* Recommendation Badge + Summary */}
                    <div className="flex-1 min-w-0 space-y-3">
                      {recConfig && (
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${recConfig.bgColor}`}>
                          <RecIcon className={`h-4 w-4 ${recConfig.color}`} />
                          <span className={`font-display font-bold text-sm ${recConfig.color}`}>
                            {recConfig.label}
                          </span>
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {analysis.summary}
                      </p>
                    </div>
                  </div>

                  {/* Bull / Bear Cases */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/15">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                        <span className="text-[10px] uppercase tracking-wider text-green-400 font-medium">Bull Case</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {analysis.bullCase}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/15">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                        <span className="text-[10px] uppercase tracking-wider text-red-400 font-medium">Bear Case</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {analysis.bearCase}
                      </p>
                    </div>
                  </div>

                  {/* Key Levels */}
                  <div className="p-3 rounded-lg bg-secondary/20 border border-border/20">
                    <div className="flex items-center gap-1.5 mb-3">
                      <Target className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[10px] uppercase tracking-wider text-primary font-medium">Key Price Levels</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Support</div>
                        <div className="font-display font-bold text-sm text-green-400 tabular-nums">
                          {formatNumber(analysis.keyLevels.support, 2)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Resistance</div>
                        <div className="font-display font-bold text-sm text-red-400 tabular-nums">
                          {formatNumber(analysis.keyLevels.resistance, 2)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Target</div>
                        <div className="font-display font-bold text-sm text-primary tabular-nums">
                          {formatNumber(analysis.keyLevels.target, 2)}
                        </div>
                      </div>
                    </div>
                    {/* Visual price bar */}
                    <div className="mt-3 relative h-2 rounded-full bg-secondary/40 overflow-hidden">
                      {(() => {
                        const min = Math.min(analysis.keyLevels.support, props.price) * 0.98;
                        const max = Math.max(analysis.keyLevels.target, props.price) * 1.02;
                        const range = max - min;
                        const currentPos = ((props.price - min) / range) * 100;
                        const supportPos = ((analysis.keyLevels.support - min) / range) * 100;
                        const targetPos = ((analysis.keyLevels.target - min) / range) * 100;
                        return (
                          <>
                            <div
                              className="absolute top-0 h-full bg-gradient-to-r from-red-500/30 via-amber-500/30 to-green-500/30 rounded-full"
                              style={{ left: `${supportPos}%`, width: `${targetPos - supportPos}%` }}
                            />
                            <div
                              className="absolute top-0 h-full w-1 bg-foreground rounded-full"
                              style={{ left: `${currentPos}%`, transform: 'translateX(-50%)' }}
                            />
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Risk + Catalysts */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Risk Level */}
                    <div className="p-3 rounded-lg bg-secondary/20 border border-border/20">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Shield className="h-3.5 w-3.5 text-amber-400" />
                        <span className="text-[10px] uppercase tracking-wider text-amber-400 font-medium">Risk Level</span>
                      </div>
                      <RiskBars level={analysis.riskLevel} />
                    </div>

                    {/* Catalysts */}
                    <div className="p-3 rounded-lg bg-secondary/20 border border-border/20">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Zap className="h-3.5 w-3.5 text-yellow-400" />
                        <span className="text-[10px] uppercase tracking-wider text-yellow-400 font-medium">Catalysts</span>
                      </div>
                      <ul className="space-y-1">
                        {analysis.catalysts.map((catalyst: string, i: number) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <span className="text-yellow-400/60 mt-0.5">•</span>
                            {catalyst}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Disclaimer */}
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400/60 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                      AI-generated analysis for informational purposes only. Not financial advice. Always conduct your own research before making investment decisions.
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
