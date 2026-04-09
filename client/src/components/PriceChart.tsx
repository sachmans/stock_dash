/**
 * Stock Portfolio Tracker — Price Chart Component
 * Design: Dark Command Center
 * 
 * Area chart showing price history with gradient fill.
 * Supports multiple time ranges.
 */

import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';
import type { ChartDataPoint, TimeRange } from '@/lib/types';
import { formatNumber } from '@/lib/format';

interface PriceChartProps {
  data: ChartDataPoint[];
  range: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  symbol: string;
  currentPrice: number;
  previousClose: number;
  loading?: boolean;
}

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '1d', label: '1D' },
  { value: '5d', label: '5D' },
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: 'ytd', label: 'YTD' },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload as ChartDataPoint;
  return (
    <div className="glass-card rounded-lg px-3 py-2 shadow-xl border border-border/50">
      <p className="text-xs text-muted-foreground mb-1">{data.date}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        <span className="text-muted-foreground">Open</span>
        <span className="font-display font-medium tabular-nums text-right">{formatNumber(data.open, 3)}</span>
        <span className="text-muted-foreground">High</span>
        <span className="font-display font-medium tabular-nums text-right">{formatNumber(data.high, 3)}</span>
        <span className="text-muted-foreground">Low</span>
        <span className="font-display font-medium tabular-nums text-right">{formatNumber(data.low, 3)}</span>
        <span className="text-muted-foreground">Close</span>
        <span className="font-display font-semibold tabular-nums text-right">{formatNumber(data.close, 3)}</span>
      </div>
    </div>
  );
}

export default function PriceChart({
  data,
  range,
  onRangeChange,
  symbol,
  currentPrice,
  previousClose,
  loading,
}: PriceChartProps) {
  const isPositive = currentPrice >= previousClose;
  const chartColor = isPositive ? '#22c55e' : '#ef4444';
  const gradientId = `chart-gradient-${symbol}`;

  // Calculate Y-axis domain with padding
  const prices = data.map((d) => d.close).filter(Boolean);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.1 || 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="glass-card rounded-xl p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-base font-semibold text-foreground">
          Price History
        </h2>
        {/* Time Range Selector */}
        <div className="flex items-center gap-1 rounded-lg bg-secondary/50 p-1">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.value}
              onClick={() => onRangeChange(tr.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                range === tr.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-[280px] sm:h-[340px]">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No chart data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                dy={8}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[minPrice - padding, maxPrice + padding]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                dx={-8}
                tickFormatter={(v) => v.toFixed(1)}
                width={55}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="close"
                stroke={chartColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}
