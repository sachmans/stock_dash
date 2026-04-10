/**
 * Stock Portfolio Tracker — Forex Store
 * Design: Dark Command Center
 * 
 * Manages forex (currency pair) positions using localStorage.
 * Pre-loaded with the user's two USD/CHF trades.
 */

import type { ForexPosition } from './types';

const STORAGE_KEY = 'stock-tracker-forex';

const DEFAULT_FOREX_POSITIONS: ForexPosition[] = [
  {
    id: 'fx-usdchf-1',
    symbol: 'USD/CHF',
    yahooSymbol: 'USDCHF=X',
    name: 'USD/CHF — Trade 1',
    boughtCurrency: 'USD',
    boughtAmount: 100_000,
    soldCurrency: 'CHF',
    soldAmount: 76_750.10,
    entryRate: 0.767501,
    tradeDate: '2026-02-11',
    direction: 'buy',
  },
  {
    id: 'fx-usdchf-2',
    symbol: 'USD/CHF',
    yahooSymbol: 'USDCHF=X',
    name: 'USD/CHF — Trade 2',
    boughtCurrency: 'USD',
    boughtAmount: 200_000,
    soldCurrency: 'CHF',
    soldAmount: 158_150,
    entryRate: 0.79075,
    tradeDate: '2026-03-25',
    direction: 'buy',
  },
];

export function getForexPositions(): ForexPosition[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // fall through to defaults
  }
  saveForexPositions(DEFAULT_FOREX_POSITIONS);
  return DEFAULT_FOREX_POSITIONS;
}

export function saveForexPositions(positions: ForexPosition[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

export function addForexPosition(position: Omit<ForexPosition, 'id'>): ForexPosition {
  const positions = getForexPositions();
  const newPosition: ForexPosition = {
    ...position,
    id: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  positions.push(newPosition);
  saveForexPositions(positions);
  return newPosition;
}

export function removeForexPosition(id: string): void {
  const positions = getForexPositions().filter((p) => p.id !== id);
  saveForexPositions(positions);
}

/**
 * Calculate P&L for a forex position given the current exchange rate.
 * 
 * For a "buy USD / sell CHF" trade:
 * - You bought USD at a certain CHF rate
 * - If CHF weakens (rate goes down), your USD is worth more in CHF → profit
 * - If CHF strengthens (rate goes up), your USD is worth less in CHF → loss
 * 
 * P&L in CHF = boughtAmount * (currentRate - entryRate)
 * P&L in USD = P&L in CHF / currentRate
 */
export function calculateForexPnL(
  position: ForexPosition,
  currentRate: number
): {
  pnlCHF: number;
  pnlUSD: number;
  pnlPercent: number;
  currentValueCHF: number;
  currentValueUSD: number;
} {
  // Current value of the USD position in CHF at the current rate
  const currentValueCHF = position.boughtAmount * currentRate;
  // Original cost in CHF
  const originalCostCHF = position.soldAmount;
  // P&L in CHF (if rate went up, CHF value of USD went up → profit in CHF terms)
  const pnlCHF = currentValueCHF - originalCostCHF;
  // P&L in USD
  const pnlUSD = currentRate > 0 ? pnlCHF / currentRate : 0;
  // P&L percentage based on original CHF outlay
  const pnlPercent = originalCostCHF > 0 ? (pnlCHF / originalCostCHF) * 100 : 0;

  return {
    pnlCHF,
    pnlUSD,
    pnlPercent,
    currentValueCHF,
    currentValueUSD: position.boughtAmount,
  };
}
