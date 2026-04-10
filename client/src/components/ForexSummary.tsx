/**
 * Stock Portfolio Tracker — Forex Summary Section
 * Design: Dark Command Center
 * 
 * Shows a summary of all forex positions with combined P&L,
 * and individual trade cards that can be clicked to view charts.
 */

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import type { ForexPosition, StockQuote } from '@/lib/types';
import { calculateForexPnL } from '@/lib/forex';
import { formatNumber, formatDate } from '@/lib/format';

interface ForexSummaryProps {
  positions: ForexPosition[];
  onSelectPosition: (position: ForexPosition) => void;
  selectedPositionId?: string;
}

/** Parse the Yahoo Finance chart response to extract a quote */
function parseQuoteFromChart(data: any): StockQuote | null {
  try {
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    return {
      symbol: meta.symbol,
      name: meta.symbol,
      price: meta.regularMarketPrice ?? 0,
      previousClose: meta.chartPreviousClose ?? meta.previousClose ?? 0,
      change:
        (meta.regularMarketPrice ?? 0) -
        (meta.chartPreviousClose ?? meta.previousClose ?? 0),
      changePercent:
        meta.chartPreviousClose || meta.previousClose
          ? (((meta.regularMarketPrice ?? 0) -
              (meta.chartPreviousClose ?? meta.previousClose ?? 0)) /
              (meta.chartPreviousClose ?? meta.previousClose ?? 1)) *
            100
          : 0,
      dayHigh: meta.regularMarketDayHigh ?? meta.regularMarketPrice ?? 0,
      dayLow: meta.regularMarketDayLow ?? meta.regularMarketPrice ?? 0,
      volume: meta.regularMarketVolume ?? 0,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? 0,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? 0,
      currency: meta.currency ?? 'CHF',
      exchange: meta.exchangeName ?? 'FX',
      marketState: meta.marketState ?? 'REGULAR',
      lastUpdated: Date.now(),
    };
  } catch {
    return null;
  }
}

export default function ForexSummary({
  positions,
  onSelectPosition,
  selectedPositionId,
}: ForexSummaryProps) {
  const [expanded, setExpanded] = useState(true);

  // Fetch live USD/CHF rate
  const { data: chartData, isLoading } = trpc.stock.getChart.useQuery(
    { symbol: 'USDCHF=X', range: '1d', interval: '1d', region: 'US' },
    { refetchInterval: 30_000, staleTime: 15_000 }
  );

  const quote = useMemo(() => parseQuoteFromChart(chartData), [chartData]);
  const currentRate = quote?.price ?? 0;

  // Calculate combined P&L across all forex positions
  const combinedPnL = useMemo(() => {
    if (!currentRate) return { totalPnLCHF: 0, totalPnLUSD: 0, totalBoughtUSD: 0, totalSoldCHF: 0 };
    
    let totalPnLCHF = 0;
    let totalPnLUSD = 0;
    let totalBoughtUSD = 0;
    let totalSoldCHF = 0;

    for (const pos of positions) {
      const { pnlCHF, pnlUSD } = calculateForexPnL(pos, currentRate);
      totalPnLCHF += pnlCHF;
      totalPnLUSD += pnlUSD;
      totalBoughtUSD += pos.boughtAmount;
      totalSoldCHF += pos.soldAmount;
    }

    return { totalPnLCHF, totalPnLUSD, totalBoughtUSD, totalSoldCHF };
  }, [positions, currentRate]);

  const isPositive = combinedPnL.totalPnLCHF >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="glass-card rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-secondary/10 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5">
          <ArrowRightLeft className="h-5 w-5 text-blue-400" />
          <h2 className="font-display font-bold text-foreground text-base">
            Forex Positions
          </h2>
          <span className="text-[10px] uppercase tracking-wider text-blue-400/60 bg-blue-500/10 px-2 py-0.5 rounded-full">
            {positions.length} trade{positions.length !== 1 ? 's' : ''}
          </span>
          {/* Live rate badge */}
          {currentRate > 0 && (
            <span className="text-xs text-muted-foreground ml-2 font-display tabular-nums">
              USD/CHF {formatNumber(currentRate, 6)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Combined P&L */}
          {currentRate > 0 && (
            <span
              className={`font-display font-bold text-sm tabular-nums ${
                isPositive ? 'text-positive' : 'text-negative'
              }`}
            >
              {isPositive ? '+' : ''}CHF{' '}
              {combinedPnL.totalPnLCHF.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground/40" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
          )}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="px-5 pb-5 space-y-3">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400 mr-2" />
              <span className="text-sm text-muted-foreground">Fetching live rates...</span>
            </div>
          )}

          {/* Combined Summary Bar */}
          {currentRate > 0 && (
            <div className="grid grid-cols-4 gap-3 mb-2">
              <div className="rounded-lg bg-secondary/30 p-3 text-center">
                <p className="text-[10px] text-muted-foreground mb-1">Total Bought</p>
                <p className="font-display text-sm font-semibold tabular-nums">
                  USD {combinedPnL.totalBoughtUSD.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3 text-center">
                <p className="text-[10px] text-muted-foreground mb-1">Total Sold</p>
                <p className="font-display text-sm font-semibold tabular-nums">
                  CHF {combinedPnL.totalSoldCHF.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3 text-center">
                <p className="text-[10px] text-muted-foreground mb-1">P&L (CHF)</p>
                <p
                  className={`font-display text-sm font-semibold tabular-nums ${
                    isPositive ? 'text-positive' : 'text-negative'
                  }`}
                >
                  {isPositive ? '+' : ''}
                  {combinedPnL.totalPnLCHF.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3 text-center">
                <p className="text-[10px] text-muted-foreground mb-1">P&L (USD)</p>
                <p
                  className={`font-display text-sm font-semibold tabular-nums ${
                    isPositive ? 'text-positive' : 'text-negative'
                  }`}
                >
                  {isPositive ? '+' : ''}
                  {combinedPnL.totalPnLUSD.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            </div>
          )}

          {/* Individual Trade Cards */}
          {positions.map((pos, idx) => {
            const { pnlCHF, pnlUSD, pnlPercent } = currentRate
              ? calculateForexPnL(pos, currentRate)
              : { pnlCHF: 0, pnlUSD: 0, pnlPercent: 0 };
            const posIsPositive = pnlCHF >= 0;
            const isSelected = selectedPositionId === pos.id;

            return (
              <motion.div
                key={pos.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                onClick={() => onSelectPosition(pos)}
                className={`p-4 rounded-lg border cursor-pointer transition-all hover:bg-secondary/20 ${
                  isSelected
                    ? 'border-blue-500/40 bg-blue-500/5'
                    : 'border-border/20 bg-secondary/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      isSelected ? 'bg-blue-500/20' : 'bg-secondary/40'
                    }`}>
                      <ArrowRightLeft className={`h-5 w-5 ${isSelected ? 'text-blue-400' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display font-semibold text-sm">
                          {pos.symbol}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 bg-secondary/40 px-1.5 py-0.5 rounded">
                          Trade {idx + 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(pos.tradeDate)}
                        </span>
                        <span className="text-[11px] text-muted-foreground/40">•</span>
                        <span className="text-[11px] text-muted-foreground">
                          USD {pos.boughtAmount.toLocaleString()} → CHF {pos.soldAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Entry</p>
                        <p className="font-display text-xs font-medium tabular-nums">
                          {formatNumber(pos.entryRate, 6)}
                        </p>
                      </div>
                      <div className="text-muted-foreground/30">→</div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Current</p>
                        <p className="font-display text-xs font-medium tabular-nums">
                          {currentRate > 0 ? formatNumber(currentRate, 6) : '—'}
                        </p>
                      </div>
                    </div>
                    {currentRate > 0 && (
                      <div
                        className={`flex items-center justify-end gap-1 mt-1 text-xs ${
                          posIsPositive ? 'text-positive' : 'text-negative'
                        }`}
                      >
                        {posIsPositive ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        <span className="font-display font-medium tabular-nums">
                          {posIsPositive ? '+' : ''}CHF{' '}
                          {pnlCHF.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          ({posIsPositive ? '+' : ''}{pnlPercent.toFixed(2)}%)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
