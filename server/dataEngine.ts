/**
 * Multi-Source Data Engine — Inspired by OpenBB & daily_stock_analysis
 * 
 * Provides a unified data layer that:
 * 1. Aggregates data from Yahoo Finance (chart, quote, fundamentals)
 * 2. Computes technical indicators (SMA, EMA, RSI, MACD, Bollinger Bands)
 * 3. Provides enriched instrument profiles with fundamentals
 * 4. Calculates daily analysis with buy/stop/target levels
 */

/* ─── Technical Indicator Calculations ─── */

/** Simple Moving Average */
export function calcSMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return result;
}

/** Exponential Moving Average */
export function calcEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      // First EMA is the SMA
      const sma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      result.push(sma);
    } else {
      const prev = result[i - 1] as number;
      result.push((data[i] - prev) * multiplier + prev);
    }
  }
  return result;
}

/** Relative Strength Index (RSI) */
export function calcRSI(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  if (closes.length < period + 1) return closes.map(() => null);

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }

  result.push(null); // First element has no change

  for (let i = 0; i < gains.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      const avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(100 - 100 / (1 + rs));
      }
    } else {
      // Use smoothed averages
      const prevRsi = result[result.length - 1];
      if (prevRsi === null) {
        result.push(null);
        continue;
      }
      // Recalculate using Wilder's smoothing
      const prevAvgGain = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
      const prevAvgLoss = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
      const smoothedGain = (prevAvgGain * (period - 1) + gains[i]) / period;
      const smoothedLoss = (prevAvgLoss * (period - 1) + losses[i]) / period;
      if (smoothedLoss === 0) {
        result.push(100);
      } else {
        const rs = smoothedGain / smoothedLoss;
        result.push(100 - 100 / (1 + rs));
      }
    }
  }
  return result;
}

/** MACD (Moving Average Convergence Divergence) */
export function calcMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9,
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const fastEMA = calcEMA(closes, fastPeriod);
  const slowEMA = calcEMA(closes, slowPeriod);

  const macdLine: (number | null)[] = fastEMA.map((f, i) => {
    const s = slowEMA[i];
    if (f === null || s === null) return null;
    return f - s;
  });

  // Signal line is EMA of MACD line
  const validMacd = macdLine.filter((v) => v !== null) as number[];
  const signalEMA = calcEMA(validMacd, signalPeriod);

  // Map signal back to full length
  const signal: (number | null)[] = [];
  let signalIdx = 0;
  for (const m of macdLine) {
    if (m === null) {
      signal.push(null);
    } else {
      signal.push(signalEMA[signalIdx] ?? null);
      signalIdx++;
    }
  }

  const histogram: (number | null)[] = macdLine.map((m, i) => {
    const s = signal[i];
    if (m === null || s === null) return null;
    return m - s;
  });

  return { macd: macdLine, signal, histogram };
}

/** Bollinger Bands */
export function calcBollingerBands(
  closes: number[],
  period: number = 20,
  stdDev: number = 2,
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = calcSMA(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    const m = middle[i];
    if (m === null || i < period - 1) {
      upper.push(null);
      lower.push(null);
    } else {
      const slice = closes.slice(i - period + 1, i + 1);
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / period;
      const sd = Math.sqrt(variance) * stdDev;
      upper.push(m + sd);
      lower.push(m - sd);
    }
  }

  return { upper, middle, lower };
}

/* ─── Enriched Data Types ─── */

export interface TechnicalIndicators {
  sma20: (number | null)[];
  sma50: (number | null)[];
  ema12: (number | null)[];
  ema26: (number | null)[];
  rsi14: (number | null)[];
  macd: { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] };
  bollingerBands: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] };
}

export interface DailyAnalysis {
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  strength: number; // 0-100
  signals: string[];
  buyLevel: number;
  stopLoss: number;
  targetPrice: number;
  riskRewardRatio: number;
}

/**
 * Compute all technical indicators from close prices.
 */
export function computeIndicators(closes: number[]): TechnicalIndicators {
  return {
    sma20: calcSMA(closes, 20),
    sma50: calcSMA(closes, 50),
    ema12: calcEMA(closes, 12),
    ema26: calcEMA(closes, 26),
    rsi14: calcRSI(closes, 14),
    macd: calcMACD(closes),
    bollingerBands: calcBollingerBands(closes),
  };
}

/**
 * Generate a daily analysis with buy/stop/target levels.
 * Inspired by ZhuLinsen/daily_stock_analysis automated approach.
 */
export function generateDailyAnalysis(
  closes: number[],
  highs: number[],
  lows: number[],
  currentPrice: number,
): DailyAnalysis {
  if (closes.length < 30) {
    return {
      trend: 'NEUTRAL',
      strength: 50,
      signals: ['Insufficient data for analysis'],
      buyLevel: currentPrice * 0.98,
      stopLoss: currentPrice * 0.95,
      targetPrice: currentPrice * 1.05,
      riskRewardRatio: 1.67,
    };
  }

  const signals: string[] = [];
  let bullPoints = 0;
  let bearPoints = 0;

  // 1. SMA crossover analysis
  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const latestSma20 = sma20[sma20.length - 1];
  const latestSma50 = sma50[sma50.length - 1];

  if (latestSma20 !== null && latestSma50 !== null) {
    if (latestSma20 > latestSma50) {
      signals.push('SMA 20 above SMA 50 — bullish trend');
      bullPoints += 2;
    } else {
      signals.push('SMA 20 below SMA 50 — bearish trend');
      bearPoints += 2;
    }

    if (currentPrice > latestSma20) {
      signals.push('Price above SMA 20 — short-term bullish');
      bullPoints += 1;
    } else {
      signals.push('Price below SMA 20 — short-term bearish');
      bearPoints += 1;
    }
  }

  // 2. RSI analysis
  const rsi = calcRSI(closes, 14);
  const latestRsi = rsi[rsi.length - 1];
  if (latestRsi !== null) {
    if (latestRsi > 70) {
      signals.push(`RSI at ${latestRsi.toFixed(1)} — overbought territory`);
      bearPoints += 2;
    } else if (latestRsi < 30) {
      signals.push(`RSI at ${latestRsi.toFixed(1)} — oversold territory`);
      bullPoints += 2;
    } else if (latestRsi > 50) {
      signals.push(`RSI at ${latestRsi.toFixed(1)} — bullish momentum`);
      bullPoints += 1;
    } else {
      signals.push(`RSI at ${latestRsi.toFixed(1)} — bearish momentum`);
      bearPoints += 1;
    }
  }

  // 3. MACD analysis
  const macd = calcMACD(closes);
  const latestMacd = macd.macd[macd.macd.length - 1];
  const latestSignal = macd.signal[macd.signal.length - 1];
  const latestHist = macd.histogram[macd.histogram.length - 1];

  if (latestMacd !== null && latestSignal !== null) {
    if (latestMacd > latestSignal) {
      signals.push('MACD above signal line — bullish crossover');
      bullPoints += 2;
    } else {
      signals.push('MACD below signal line — bearish crossover');
      bearPoints += 2;
    }
  }

  if (latestHist !== null) {
    const prevHist = macd.histogram[macd.histogram.length - 2];
    if (prevHist !== null && latestHist > prevHist) {
      signals.push('MACD histogram expanding — momentum increasing');
      bullPoints += 1;
    }
  }

  // 4. Bollinger Bands
  const bb = calcBollingerBands(closes);
  const latestUpper = bb.upper[bb.upper.length - 1];
  const latestLower = bb.lower[bb.lower.length - 1];

  if (latestUpper !== null && latestLower !== null) {
    if (currentPrice >= latestUpper) {
      signals.push('Price at upper Bollinger Band — potential resistance');
      bearPoints += 1;
    } else if (currentPrice <= latestLower) {
      signals.push('Price at lower Bollinger Band — potential support');
      bullPoints += 1;
    }
  }

  // 5. Price action — recent trend
  const recent5 = closes.slice(-5);
  const priceChange5d = ((recent5[recent5.length - 1] - recent5[0]) / recent5[0]) * 100;
  if (priceChange5d > 2) {
    signals.push(`+${priceChange5d.toFixed(1)}% in 5 days — strong upward momentum`);
    bullPoints += 1;
  } else if (priceChange5d < -2) {
    signals.push(`${priceChange5d.toFixed(1)}% in 5 days — strong downward pressure`);
    bearPoints += 1;
  }

  // Determine trend
  const totalPoints = bullPoints + bearPoints;
  const bullRatio = totalPoints > 0 ? bullPoints / totalPoints : 0.5;
  const trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    bullRatio > 0.6 ? 'BULLISH' : bullRatio < 0.4 ? 'BEARISH' : 'NEUTRAL';
  const strength = Math.round(Math.abs(bullRatio - 0.5) * 200); // 0-100

  // Calculate key levels using recent price action
  const recentHighs = highs.slice(-20);
  const recentLows = lows.slice(-20);
  const recentHigh = Math.max(...recentHighs);
  const recentLow = Math.min(...recentLows);
  const range = recentHigh - recentLow;

  // ATR-based levels (simplified)
  const atr = range / 20 * 14; // Approximate 14-period ATR
  const buyLevel = trend === 'BULLISH'
    ? currentPrice - atr * 0.5
    : currentPrice - atr * 1.0;
  const stopLoss = buyLevel - atr * 1.5;
  const targetPrice = currentPrice + atr * 2.5;
  const riskRewardRatio = (targetPrice - buyLevel) / (buyLevel - stopLoss);

  return {
    trend,
    strength,
    signals: signals.slice(0, 8),
    buyLevel: Math.round(buyLevel * 1000) / 1000,
    stopLoss: Math.round(stopLoss * 1000) / 1000,
    targetPrice: Math.round(targetPrice * 1000) / 1000,
    riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
  };
}
