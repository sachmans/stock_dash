/**
 * Stock Portfolio Tracker — Watchlist Component
 * Design: Dark Command Center
 * 
 * Displays a watchlist of instruments with live prices.
 * Separate from the portfolio section.
 */

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, TrendingUp, TrendingDown, Minus, X, Plus, Loader2, Sparkles } from 'lucide-react';
import { useWatchlistQuote } from '@/hooks/useWatchlistData';
import { formatNumber, formatPercent, formatChange, formatVolume, formatTime } from '@/lib/format';
import type { WatchlistItem } from '@/lib/types';

/* ─── Category icons / colors ─── */
const CATEGORY_CONFIG: Record<string, { icon: string; color: string }> = {
  commodity: { icon: '🏆', color: 'text-amber-400' },
  stock: { icon: '📊', color: 'text-blue-400' },
  etf: { icon: '📦', color: 'text-purple-400' },
  crypto: { icon: '₿', color: 'text-orange-400' },
};

/* ─── Individual Watchlist Row ─── */
function WatchlistRow({ item, onRemove }: { item: WatchlistItem; onRemove: (id: string) => void }) {
  const { quote, loading } = useWatchlistQuote(item.yahooSymbol);

  const isPositive = (quote?.change ?? 0) >= 0;
  const config = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.stock;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0 }}
      transition={{ duration: 0.25 }}
      className="group relative flex items-center gap-4 px-4 py-3.5 rounded-lg bg-secondary/20 hover:bg-secondary/40 border border-border/20 hover:border-border/40 transition-all"
    >
      {/* Symbol & Name */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`text-lg ${config.color} shrink-0`}>
          {config.icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-foreground text-sm">
              {item.symbol}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 bg-secondary/40 px-1.5 py-0.5 rounded">
              {item.exchange}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {item.name}
          </p>
        </div>
      </div>

      {/* Price */}
      <div className="text-right shrink-0">
        {loading ? (
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading...</span>
          </div>
        ) : quote ? (
          <>
            <div className="font-display font-bold text-foreground text-sm tabular-nums">
              {quote.currency === 'AED' ? 'AED ' : quote.currency === 'GBP' ? '£' : '$'}
              {formatNumber(quote.price, quote.price > 100 ? 2 : 3)}
            </div>
            <div className={`flex items-center gap-1 justify-end text-xs ${isPositive ? 'text-positive' : 'text-negative'}`}>
              {isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span className="tabular-nums">
                {formatChange(quote.change)} ({formatPercent(quote.changePercent)})
              </span>
            </div>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">No data</span>
        )}
      </div>

      {/* Day Range & Volume (desktop only) */}
      {quote && !loading && (
        <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider opacity-60">Range</div>
            <div className="tabular-nums">
              {formatNumber(quote.dayLow, 2)} — {formatNumber(quote.dayHigh, 2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider opacity-60">Volume</div>
            <div className="tabular-nums">{formatVolume(quote.volume)}</div>
          </div>
        </div>
      )}

      {/* Remove button */}
      <button
        onClick={() => onRemove(item.id)}
        className="opacity-0 group-hover:opacity-100 absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-destructive/80 text-destructive-foreground text-[10px] transition-opacity hover:bg-destructive"
        title="Remove from watchlist"
      >
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

/* ─── Loading Skeleton Row ─── */
function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5 rounded-lg bg-secondary/20 border border-border/20 animate-pulse">
      <div className="h-6 w-6 rounded bg-secondary/60" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-20 rounded bg-secondary/60" />
        <div className="h-2.5 w-32 rounded bg-secondary/40" />
      </div>
      <div className="space-y-1.5 text-right">
        <div className="h-3.5 w-16 rounded bg-secondary/60 ml-auto" />
        <div className="h-2.5 w-20 rounded bg-secondary/40 ml-auto" />
      </div>
    </div>
  );
}

/* ─── Main Watchlist Component ─── */
interface WatchlistProps {
  items: WatchlistItem[];
  onRemove: (id: string) => void;
  onAdd: () => void;
  loading?: boolean;
}

export default function Watchlist({ items, onRemove, onAdd, loading }: WatchlistProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="glass-card rounded-xl p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Eye className="h-5 w-5 text-primary" />
          <h2 className="font-display font-bold text-foreground text-base">
            Watchlist
          </h2>
          <span className="text-xs text-muted-foreground bg-secondary/40 px-2 py-0.5 rounded-full">
            {items.length} {items.length === 1 ? 'ITEM' : 'ITEMS'}
          </span>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {/* Watchlist Items */}
      <div className="space-y-2">
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Your watchlist is empty</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Add instruments to track their prices</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {items.map((item) => (
              <WatchlistRow
                key={item.id}
                item={item}
                onRemove={onRemove}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Last updated footer */}
      {items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/20 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">
            Auto-refreshing every 30s
          </span>
          <span className="text-[10px] text-muted-foreground/50 tabular-nums">
            Updated {formatTime(Date.now())}
          </span>
        </div>
      )}
    </motion.div>
  );
}
