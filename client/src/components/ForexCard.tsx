/**
 * Stock Portfolio Tracker — Forex Position Card
 * Design: Dark Command Center
 * 
 * Shows detailed forex position information with live P&L calculation.
 * Displays entry rate, current rate, amounts in both currencies, and P&L.
 */

import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Calendar,
  DollarSign,
  Banknote,
} from 'lucide-react';
import type { ForexPosition, StockQuote } from '@/lib/types';
import { calculateForexPnL } from '@/lib/forex';
import { formatNumber, formatDate } from '@/lib/format';

interface ForexCardProps {
  position: ForexPosition;
  quote: StockQuote | null;
  loading?: boolean;
}

export default function ForexCard({ position, quote, loading }: ForexCardProps) {
  const currentRate = quote?.price ?? 0;
  const { pnlCHF, pnlUSD, pnlPercent, currentValueCHF } = calculateForexPnL(
    position,
    currentRate
  );
  const isPositive = pnlCHF >= 0;
  const rateChange = quote ? quote.change : 0;
  const rateChangePercent = quote ? quote.changePercent : 0;

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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15">
              <ArrowRightLeft className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold leading-none">
                {position.symbol}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {position.name}
              </p>
            </div>
          </div>
        </div>
        <div className="text-right">
          {loading ? (
            <div className="h-7 w-20 rounded bg-secondary animate-pulse" />
          ) : (
            <>
              <p className="font-display text-2xl font-bold tabular-nums">
                {formatNumber(currentRate, 6)}
              </p>
              <div
                className={`flex items-center justify-end gap-1 text-sm ${
                  rateChange >= 0 ? 'text-positive' : 'text-negative'
                }`}
              >
                {rateChange >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                <span className="font-display font-medium tabular-nums">
                  {rateChange >= 0 ? '+' : ''}
                  {formatNumber(rateChange, 6)} ({rateChangePercent.toFixed(2)}%)
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/50" />

      {/* Trade Details */}
      <div className="space-y-3">
        <h4 className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          Trade Details
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <DetailRow
            label="Bought"
            value={`USD ${position.boughtAmount.toLocaleString()}`}
            icon={<DollarSign className="h-3 w-3" />}
          />
          <DetailRow
            label="Sold"
            value={`CHF ${position.soldAmount.toLocaleString()}`}
            icon={<Banknote className="h-3 w-3" />}
          />
          <DetailRow
            label="Entry Rate"
            value={formatNumber(position.entryRate, 6)}
            icon={<ArrowRightLeft className="h-3 w-3" />}
          />
          <DetailRow
            label="Trade Date"
            value={formatDate(position.tradeDate)}
            icon={<Calendar className="h-3 w-3" />}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/50" />

      {/* Rate Comparison */}
      <div className="space-y-3">
        <h4 className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          Rate Comparison
        </h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-secondary/40 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">Entry Rate</p>
            <p className="font-display text-sm font-semibold tabular-nums">
              {formatNumber(position.entryRate, 6)}
            </p>
          </div>
          <div className="rounded-lg bg-secondary/40 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">Current Rate</p>
            <p className="font-display text-sm font-semibold tabular-nums">
              {loading ? '—' : formatNumber(currentRate, 6)}
            </p>
          </div>
          <div className="rounded-lg bg-secondary/40 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">Rate Change</p>
            <p
              className={`font-display text-sm font-semibold tabular-nums ${
                currentRate >= position.entryRate ? 'text-positive' : 'text-negative'
              }`}
            >
              {loading
                ? '—'
                : `${currentRate >= position.entryRate ? '+' : ''}${formatNumber(
                    currentRate - position.entryRate,
                    6
                  )}`}
            </p>
          </div>
        </div>
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
            <p className="text-[11px] text-muted-foreground mb-1">Original Cost (CHF)</p>
            <p className="font-display text-sm font-semibold tabular-nums">
              CHF {position.soldAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-lg bg-secondary/40 p-3">
            <p className="text-[11px] text-muted-foreground mb-1">Current Value (CHF)</p>
            <p className="font-display text-sm font-semibold tabular-nums">
              {loading
                ? '—'
                : `CHF ${currentValueCHF.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
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
              <div className="space-y-1">
                <p
                  className={`font-display text-lg font-bold tabular-nums ${
                    isPositive ? 'text-positive' : 'text-negative'
                  }`}
                >
                  {isPositive ? '+' : ''}
                  {loading
                    ? '—'
                    : `CHF ${pnlCHF.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
                <p
                  className={`font-display text-sm tabular-nums ${
                    isPositive ? 'text-green-400/70' : 'text-red-400/70'
                  }`}
                >
                  {isPositive ? '+' : ''}
                  {loading
                    ? '—'
                    : `USD ${pnlUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
              </div>
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
              {loading ? '—' : `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`}
            </div>
          </div>
        </div>
      </div>
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
