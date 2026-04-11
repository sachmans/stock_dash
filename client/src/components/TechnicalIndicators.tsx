/**
 * Technical Indicators Panel
 * Shows RSI, MACD, Bollinger Bands, Moving Averages, and signal summary.
 * Inspired by OpenBB and daily_stock_analysis.
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Gauge,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatNumber } from '@/lib/format';

interface TechnicalIndicatorsProps {
  symbol: string;
  closes: number[];
  highs: number[];
  lows: number[];
  currentPrice: number;
}

/* ─── Gauge Component ─── */
function MiniGauge({ value, min, max, label, zones }: {
  value: number;
  min: number;
  max: number;
  label: string;
  zones?: Array<{ from: number; to: number; color: string }>;
}) {
  const isValid = value != null && !isNaN(value) && !isNaN(min) && !isNaN(max) && max !== min;
  const pct = isValid ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;

  const defaultZones = [
    { from: 0, to: 30, color: 'bg-red-400' },
    { from: 30, to: 70, color: 'bg-amber-400' },
    { from: 70, to: 100, color: 'bg-green-400' },
  ];

  const activeZones = zones || defaultZones;
  const activeZone = activeZones.find(z => pct >= z.from && pct <= z.to) || activeZones[1];

  return (
    <div className="text-center">
      <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-lg font-mono font-bold text-foreground">{isValid ? formatNumber(value) : '—'}</div>
      <div className="h-1.5 bg-secondary/30 rounded-full overflow-hidden mt-1 relative">
        {activeZones.map((zone, i) => (
          <div
            key={i}
            className={`absolute h-full ${zone.color} opacity-20`}
            style={{
              left: `${zone.from}%`,
              width: `${zone.to - zone.from}%`,
            }}
          />
        ))}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8 }}
          className={`h-full rounded-full ${activeZone?.color || 'bg-primary'}`}
        />
      </div>
    </div>
  );
}

/* ─── Signal Badge ─── */
function SignalBadge({ signal }: { signal: string }) {
  const isUp = signal.includes('BULLISH') || signal.includes('BUY') || signal.includes('ABOVE') || signal.includes('OVERSOLD');
  const isDown = signal.includes('BEARISH') || signal.includes('SELL') || signal.includes('BELOW') || signal.includes('OVERBOUGHT');

  const color = isUp ? 'text-green-400 bg-green-500/10' : isDown ? 'text-red-400 bg-red-500/10' : 'text-amber-400 bg-amber-500/10';
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>
      <Icon className="h-2.5 w-2.5" />
      {signal}
    </span>
  );
}

/* ─── Main Component ─── */
export default function TechnicalIndicators({ symbol, closes, highs, lows, currentPrice }: TechnicalIndicatorsProps) {
  const [expanded, setExpanded] = useState(true);

  const queryInput = useMemo(() => ({
    symbol,
    closes,
    highs,
    lows,
    currentPrice,
  }), [symbol, closes.length, currentPrice]);

  const { data: rawData, isLoading } = trpc.stock.getTechnicalIndicators.useQuery(
    queryInput,
    {
      enabled: closes.length > 0,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  );

  const data = rawData as any;

  if (!data && !isLoading) return null;

  const indicators = data?.indicators;
  const daily = data?.dailyAnalysis;

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
          <Activity className="h-5 w-5 text-blue-400" />
          <h2 className="font-display font-bold text-foreground text-base">
            Technical Indicators
          </h2>
          {daily && (
            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold ${
              daily.trend === 'BULLISH' ? 'text-green-400 bg-green-500/10' :
              daily.trend === 'BEARISH' ? 'text-red-400 bg-red-500/10' :
              'text-amber-400 bg-amber-500/10'
            }`}>
              {daily.trend} ({daily.strength}%)
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground/40" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/40" />}
      </div>

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
              {isLoading && (
                <div className="flex items-center justify-center py-6">
                  <Gauge className="h-6 w-6 animate-pulse text-blue-400" />
                  <span className="text-sm text-muted-foreground ml-2">Computing indicators...</span>
                </div>
              )}

              {indicators && (
                <>
                  {/* Key Gauges */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <MiniGauge
                      value={indicators.rsi14}
                      min={0}
                      max={100}
                      label="RSI (14)"
                      zones={[
                        { from: 0, to: 30, color: 'bg-green-400' },
                        { from: 30, to: 70, color: 'bg-amber-400' },
                        { from: 70, to: 100, color: 'bg-red-400' },
                      ]}
                    />
                    <MiniGauge
                      value={indicators.macd?.histogram || 0}
                      min={-5}
                      max={5}
                      label="MACD Hist"
                    />
                    <MiniGauge
                      value={indicators.sma20}
                      min={indicators.bollingerBands?.lower || currentPrice * 0.9}
                      max={indicators.bollingerBands?.upper || currentPrice * 1.1}
                      label="SMA 20"
                    />
                    <MiniGauge
                      value={currentPrice}
                      min={indicators.bollingerBands?.lower || currentPrice * 0.9}
                      max={indicators.bollingerBands?.upper || currentPrice * 1.1}
                      label="BB Position"
                    />
                  </div>

                  {/* Moving Averages Table */}
                  <div className="bg-secondary/5 border border-secondary/15 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">Moving Averages</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      {[
                        { label: 'SMA 10', value: indicators.sma10 },
                        { label: 'SMA 20', value: indicators.sma20 },
                        { label: 'SMA 50', value: indicators.sma50 },
                      ].map((ma) => {
                        const isValid = ma.value != null && !isNaN(ma.value);
                        return (
                          <div key={ma.label}>
                            <div className="text-[10px] text-muted-foreground/50">{ma.label}</div>
                            <div className={`text-sm font-mono font-bold ${
                              !isValid ? 'text-muted-foreground/40' :
                              currentPrice > ma.value ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {isValid ? formatNumber(ma.value) : '—'}
                            </div>
                            <div className={`text-[9px] ${
                              !isValid ? 'text-muted-foreground/30' :
                              currentPrice > ma.value ? 'text-green-400/60' : 'text-red-400/60'
                            }`}>
                              {!isValid ? 'N/A' : currentPrice > ma.value ? 'Above' : 'Below'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bollinger Bands */}
                  {indicators.bollingerBands && (
                    <div className="bg-secondary/5 border border-secondary/15 rounded-lg p-3">
                      <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Bollinger Bands (20, 2)</div>
                      <div className="relative h-6 bg-secondary/20 rounded-full overflow-hidden">
                        {/* Band visualization */}
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full h-2 bg-gradient-to-r from-red-500/20 via-amber-500/20 to-green-500/20 rounded-full" />
                        </div>
                        {/* Price marker */}
                        <motion.div
                          initial={{ left: '50%' }}
                          animate={{
                            left: `${Math.max(5, Math.min(95, ((currentPrice - indicators.bollingerBands.lower) / (indicators.bollingerBands.upper - indicators.bollingerBands.lower)) * 100))}%`
                          }}
                          className="absolute top-0 h-full w-0.5 bg-cyan-400"
                        >
                          <div className="absolute -top-0.5 -left-1 w-2 h-2 rounded-full bg-cyan-400" />
                        </motion.div>
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground/50 mt-1">
                        <span>Lower: {formatNumber(indicators.bollingerBands.lower)}</span>
                        <span>Mid: {formatNumber(indicators.bollingerBands.middle)}</span>
                        <span>Upper: {formatNumber(indicators.bollingerBands.upper)}</span>
                      </div>
                    </div>
                  )}

                  {/* Signals */}
                  {daily?.signals && daily.signals.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Active Signals</div>
                      <div className="flex flex-wrap gap-1.5">
                        {daily.signals.map((sig: string, i: number) => (
                          <SignalBadge key={i} signal={sig} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
