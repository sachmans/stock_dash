/**
 * Stock Portfolio Tracker — Position Card Component
 * Design: Dark Command Center
 * 
 * Shows detailed position information with live P&L calculation.
 */

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Droplets, MapPin, Calendar, Hash } from 'lucide-react';
import type { Position, StockQuote } from '@/lib/types';
import { formatCurrency, formatNumber, formatPercent, formatDate } from '@/lib/format';

interface PositionCardProps {
  position: Position;
  quote: StockQuote | null;
  loading?: boolean;
}

export default function PositionCard({ position, quote, loading }: PositionCardProps) {
  const currentPrice = quote?.price ?? 0;
  const marketValue = currentPrice * position.quantity;
  const costBasis = position.avgPrice * position.quantity;
  const pnl = marketValue - costBasis;
  const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  const isPositive = pnl >= 0;
  const priceChange = quote ? quote.change : 0;
  const priceChangePercent = quote ? quote.changePercent : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass-card rounded-xl p-5 space-y-5"
    >
      {/* Title Row */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
              <Droplets className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold leading-none">
                {position.symbol}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {position.yahooSymbol}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-[220px]">
            {position.name}
          </p>
        </div>
        <div className="text-right">
          {loading ? (
            <div className="h-7 w-20 rounded bg-secondary animate-pulse" />
          ) : (
            <>
              <p className="font-display text-2xl font-bold tabular-nums">
                {formatNumber(currentPrice, 3)}
              </p>
              <div
                className={`flex items-center justify-end gap-1 text-sm ${
                  priceChange >= 0 ? 'text-positive' : 'text-negative'
                }`}
              >
                {priceChange >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                <span className="font-display font-medium tabular-nums">
                  {priceChange >= 0 ? '+' : ''}
                  {formatNumber(priceChange, 3)} ({formatPercent(priceChangePercent)})
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/50" />

      {/* Position Details Grid */}
      <div className="grid grid-cols-2 gap-3">
        <DetailRow label="Quantity" value={`${position.quantity}`} icon={<Hash className="h-3 w-3" />} />
        <DetailRow label="Avg. Price" value={formatNumber(position.avgPrice, 3)} icon={<TrendingUp className="h-3 w-3" />} />
        <DetailRow label="Exchange" value="LSE (ETFs)" icon={<MapPin className="h-3 w-3" />} />
        <DetailRow label="Opened" value={formatDate(position.openedDate)} icon={<Calendar className="h-3 w-3" />} />
      </div>

      {/* Divider */}
      <div className="h-px bg-border/50" />

      {/* P&L Section */}
      <div className="space-y-3">
        <h4 className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          Profit & Loss
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-secondary/40 p-3">
            <p className="text-[11px] text-muted-foreground mb-1">Cost Basis</p>
            <p className="font-display text-sm font-semibold tabular-nums">
              {formatCurrency(costBasis, position.currency)}
            </p>
          </div>
          <div className="rounded-lg bg-secondary/40 p-3">
            <p className="text-[11px] text-muted-foreground mb-1">Market Value</p>
            <p className="font-display text-sm font-semibold tabular-nums">
              {loading ? '—' : formatCurrency(marketValue, position.currency)}
            </p>
          </div>
        </div>

        {/* P&L Banner */}
        <div
          className={`rounded-lg p-4 ${
            isPositive ? 'bg-positive' : 'bg-negative'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Unrealized P&L</p>
              <p
                className={`font-display text-xl font-bold tabular-nums ${
                  isPositive ? 'text-positive' : 'text-negative'
                }`}
              >
                {isPositive ? '+' : ''}
                {loading ? '—' : formatCurrency(pnl, position.currency)}
              </p>
            </div>
            <div
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold ${
                isPositive
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {isPositive ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {loading ? '—' : formatPercent(pnlPercent)}
            </div>
          </div>
        </div>
      </div>

      {/* Position ID */}
      {position.positionId && (
        <p className="text-[10px] text-muted-foreground/60 text-right tabular-nums">
          Position ID: {position.positionId}
        </p>
      )}
    </motion.div>
  );
}

function DetailRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary/60 text-muted-foreground">
        {icon}
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground leading-none">{label}</p>
        <p className="text-xs font-medium tabular-nums mt-0.5">{value}</p>
      </div>
    </div>
  );
}
