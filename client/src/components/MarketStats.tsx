/**
 * Stock Portfolio Tracker — Market Stats Component
 * Design: Dark Command Center
 * 
 * Shows key market statistics in a horizontal strip.
 */

import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, BarChart2, Clock } from 'lucide-react';
import type { StockQuote } from '@/lib/types';
import { formatNumber, formatVolume, formatTime } from '@/lib/format';

interface MarketStatsProps {
  quote: StockQuote | null;
  loading?: boolean;
}

export default function MarketStats({ quote, loading }: MarketStatsProps) {
  if (loading || !quote) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-card rounded-xl p-4 animate-pulse">
            <div className="h-3 w-16 bg-secondary rounded mb-2" />
            <div className="h-6 w-24 bg-secondary rounded" />
          </div>
        ))}
      </motion.div>
    );
  }

  const stats = [
    {
      label: 'Day Range',
      value: `${formatNumber(quote.dayLow, 2)} — ${formatNumber(quote.dayHigh, 2)}`,
      icon: <BarChart2 className="h-3.5 w-3.5" />,
      color: 'text-primary',
    },
    {
      label: '52W High',
      value: formatNumber(quote.fiftyTwoWeekHigh, 2),
      icon: <ArrowUpRight className="h-3.5 w-3.5" />,
      color: 'text-positive',
    },
    {
      label: '52W Low',
      value: formatNumber(quote.fiftyTwoWeekLow, 2),
      icon: <ArrowDownRight className="h-3.5 w-3.5" />,
      color: 'text-negative',
    },
    {
      label: 'Volume',
      value: formatVolume(quote.volume),
      icon: <Clock className="h-3.5 w-3.5" />,
      color: 'text-muted-foreground',
      subtext: `Updated ${formatTime(quote.lastUpdated)}`,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="grid grid-cols-2 sm:grid-cols-4 gap-3"
    >
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className="glass-card rounded-xl p-4 group hover:border-primary/20 transition-colors"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className={stat.color}>{stat.icon}</span>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
              {stat.label}
            </p>
          </div>
          <p className="font-display text-lg font-semibold tabular-nums">
            {stat.value}
          </p>
          {stat.subtext && (
            <p className="text-[10px] text-muted-foreground/60 mt-1">{stat.subtext}</p>
          )}
        </div>
      ))}
    </motion.div>
  );
}
