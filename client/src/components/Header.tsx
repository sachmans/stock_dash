/**
 * Stock Portfolio Tracker — Header Component
 * Design: Dark Command Center
 * 
 * Top navigation bar with branding, live status indicator, and portfolio summary.
 */

import { Activity, BarChart3, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

interface HeaderProps {
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  isLive: boolean;
  onRefresh: () => void;
  currency?: string;
}

export default function Header({
  totalValue,
  totalPnL,
  totalPnLPercent,
  isLive,
  onRefresh,
  currency = 'USD',
}: HeaderProps) {
  const isPositive = totalPnL >= 0;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo / Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-lg font-semibold tracking-tight leading-none">
              Portfolio Tracker
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  isLive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'
                }`}
              />
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                {isLive ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Portfolio Summary (desktop) */}
        <div className="hidden sm:flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Portfolio Value</p>
            <p className="font-display text-xl font-semibold tabular-nums">
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency,
                minimumFractionDigits: 2,
              }).format(totalValue)}
            </p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total P&L</p>
            <motion.p
              key={totalPnL}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className={`font-display text-xl font-semibold tabular-nums ${
                isPositive ? 'text-positive' : 'text-negative'
              }`}
            >
              {isPositive ? '+' : ''}
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency,
                minimumFractionDigits: 2,
              }).format(totalPnL)}
              <span className="text-sm ml-1.5 opacity-75">
                ({isPositive ? '+' : ''}{totalPnLPercent.toFixed(2)}%)
              </span>
            </motion.p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Refresh data"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/50 px-3 h-9">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">30s</span>
          </div>
        </div>
      </div>
    </header>
  );
}
