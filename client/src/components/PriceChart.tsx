/**
 * Stock Portfolio Tracker — Professional Price Chart
 * Powered by TradingView Lightweight Charts
 * 
 * Features:
 * - Candlestick chart with OHLC data
 * - Volume histogram overlay
 * - SMA (20/50) moving average indicators
 * - Crosshair with OHLC tooltip
 * - Multiple time range selector
 * - Dark theme matching command center design
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type CandlestickData, type HistogramData, type LineData, ColorType, CrosshairMode, CandlestickSeries, LineSeries, AreaSeries, HistogramSeries } from 'lightweight-charts';
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

type ChartType = 'candle' | 'line' | 'area';

const CHART_TYPES: { value: ChartType; label: string; icon: string }[] = [
  { value: 'candle', label: 'Candlestick', icon: '🕯️' },
  { value: 'line', label: 'Line', icon: '📈' },
  { value: 'area', label: 'Area', icon: '📊' },
];

/** Calculate Simple Moving Average */
function calculateSMA(data: ChartDataPoint[], period: number): { time: string; value: number }[] {
  const result: { time: string; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    // Convert timestamp to YYYY-MM-DD for lightweight-charts
    const d = new Date(data[i].timestamp * 1000);
    const timeStr = d.toISOString().split('T')[0];
    result.push({ time: timeStr, value: sum / period });
  }
  return result;
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
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [chartType, setChartType] = useState<ChartType>('candle');
  const [showSMA20, setShowSMA20] = useState(true);
  const [showSMA50, setShowSMA50] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [hoveredData, setHoveredData] = useState<{
    open: number; high: number; low: number; close: number; volume: number; time: string;
  } | null>(null);

  const isPositive = currentPrice >= previousClose;

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(59, 130, 246, 0.4)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: 'rgba(59, 130, 246, 0.4)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#1e293b',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        scaleMargins: { top: 0.1, bottom: showVolume ? 0.25 : 0.05 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        timeVisible: range === '1d' || range === '5d',
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    // Prepare data — convert timestamps to date strings for daily, or use time for intraday
    const isIntraday = range === '1d' || range === '5d';
    
    const prepareTime = (point: ChartDataPoint) => {
      if (isIntraday) {
        return point.timestamp as any;
      }
      const d = new Date(point.timestamp * 1000);
      return d.toISOString().split('T')[0];
    };

    // Deduplicate data by time
    const seenTimes = new Set<string>();
    const deduped = data.filter(point => {
      const t = String(prepareTime(point));
      if (seenTimes.has(t)) return false;
      seenTimes.add(t);
      return true;
    });

    if (chartType === 'candle') {
      // Candlestick series
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderDownColor: '#ef4444',
        borderUpColor: '#22c55e',
        wickDownColor: '#ef4444',
        wickUpColor: '#22c55e',
      });

      const candleData: CandlestickData[] = deduped.map(point => ({
        time: prepareTime(point),
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
      }));

      candleSeries.setData(candleData as any);

      // Add entry price line for the main position
      if (symbol === 'BRNT.L') {
        candleSeries.createPriceLine({
          price: 78.66,
          color: '#3b82f6',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'Entry @ 78.660',
        });
      }
    } else if (chartType === 'line') {
      const lineSeries = chart.addSeries(LineSeries, {
        color: isPositive ? '#22c55e' : '#ef4444',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });

      const lineData: LineData[] = deduped.map(point => ({
        time: prepareTime(point),
        value: point.close,
      }));

      lineSeries.setData(lineData as any);
    } else {
      // Area chart
      const areaSeries = chart.addSeries(AreaSeries, {
        topColor: isPositive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
        bottomColor: isPositive ? 'rgba(34, 197, 94, 0.02)' : 'rgba(239, 68, 68, 0.02)',
        lineColor: isPositive ? '#22c55e' : '#ef4444',
        lineWidth: 2,
        crosshairMarkerVisible: true,
      });

      const areaData: LineData[] = deduped.map(point => ({
        time: prepareTime(point),
        value: point.close,
      }));

      areaSeries.setData(areaData as any);
    }

    // Volume histogram
    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      const volumeData = deduped.map(point => ({
        time: prepareTime(point),
        value: point.volume,
        color: point.close >= point.open
          ? 'rgba(34, 197, 94, 0.3)'
          : 'rgba(239, 68, 68, 0.3)',
      }));

      volumeSeries.setData(volumeData as any);
    }

    // SMA indicators (only for daily+ data with enough points)
    if (!isIntraday && deduped.length >= 20 && showSMA20) {
      const sma20Series = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const sma20Data = calculateSMA(deduped, 20);
      sma20Series.setData(sma20Data as any);
    }

    if (!isIntraday && deduped.length >= 50 && showSMA50) {
      const sma50Series = chart.addSeries(LineSeries, {
        color: '#8b5cf6',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const sma50Data = calculateSMA(deduped, 50);
      sma50Series.setData(sma50Data as any);
    }

    // Crosshair move handler for OHLC tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoveredData(null);
        return;
      }
      // Find the matching data point
      const timeStr = String(param.time);
      const match = deduped.find(d => {
        const t = String(prepareTime(d));
        return t === timeStr;
      });
      if (match) {
        setHoveredData({
          open: match.open,
          high: match.high,
          low: match.low,
          close: match.close,
          volume: match.volume,
          time: match.date,
        });
      }
    });

    // Fit content
    chart.timeScale().fitContent();

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, chartType, showSMA20, showSMA50, showVolume, range, symbol, isPositive, currentPrice]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="glass-card rounded-xl p-5"
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-base font-semibold text-foreground">
            Price Chart
          </h2>
          {/* Chart Type Selector */}
          <div className="flex items-center gap-0.5 rounded-lg bg-secondary/50 p-0.5">
            {CHART_TYPES.map((ct) => (
              <button
                key={ct.value}
                onClick={() => setChartType(ct.value)}
                title={ct.label}
                className={`px-2 py-1 rounded-md text-xs transition-all ${
                  chartType === ct.value
                    ? 'bg-primary/20 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {ct.icon}
              </button>
            ))}
          </div>
        </div>

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

      {/* Indicator Toggles */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => setShowSMA20(!showSMA20)}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-all ${
            showSMA20 ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground/50 hover:text-muted-foreground'
          }`}
        >
          <span className="w-3 h-0.5 rounded" style={{ backgroundColor: showSMA20 ? '#f59e0b' : '#475569' }} />
          SMA 20
        </button>
        <button
          onClick={() => setShowSMA50(!showSMA50)}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-all ${
            showSMA50 ? 'bg-violet-500/20 text-violet-400' : 'text-muted-foreground/50 hover:text-muted-foreground'
          }`}
        >
          <span className="w-3 h-0.5 rounded" style={{ backgroundColor: showSMA50 ? '#8b5cf6' : '#475569' }} />
          SMA 50
        </button>
        <button
          onClick={() => setShowVolume(!showVolume)}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-all ${
            showVolume ? 'bg-blue-500/20 text-blue-400' : 'text-muted-foreground/50 hover:text-muted-foreground'
          }`}
        >
          <span className="w-2 h-2.5 rounded-sm" style={{ backgroundColor: showVolume ? '#3b82f6' : '#475569' }} />
          Vol
        </button>
      </div>

      {/* OHLC Tooltip Overlay */}
      {hoveredData && (
        <div className="flex items-center gap-4 mb-2 text-xs font-display tabular-nums">
          <span className="text-muted-foreground">
            {hoveredData.time}
          </span>
          <span>
            O <span className="text-foreground font-medium">{formatNumber(hoveredData.open, 3)}</span>
          </span>
          <span>
            H <span className="text-green-400 font-medium">{formatNumber(hoveredData.high, 3)}</span>
          </span>
          <span>
            L <span className="text-red-400 font-medium">{formatNumber(hoveredData.low, 3)}</span>
          </span>
          <span>
            C <span className="text-foreground font-medium">{formatNumber(hoveredData.close, 3)}</span>
          </span>
          <span>
            V <span className="text-blue-400 font-medium">{hoveredData.volume?.toLocaleString() ?? '—'}</span>
          </span>
        </div>
      )}

      {/* Chart Container */}
      <div className="h-[300px] sm:h-[380px]" ref={chartContainerRef}>
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No chart data available
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
