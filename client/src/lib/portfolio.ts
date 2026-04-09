/**
 * Stock Portfolio Tracker — Portfolio Store
 * Design: Dark Command Center
 * 
 * Manages positions using localStorage for persistence.
 * Pre-loaded with the user's BRNT position.
 */

import type { Position } from './types';

const STORAGE_KEY = 'stock-tracker-positions';

const DEFAULT_POSITIONS: Position[] = [
  {
    id: 'brnt-1',
    symbol: 'BRNT',
    yahooSymbol: 'BRNT.L',
    name: 'WisdomTree Brent Crude Oil ETC',
    exchange: 'London Stock Exchange (ETFs)',
    quantity: 250,
    avgPrice: 78.660,
    currency: 'USD',
    openedDate: '2026-04-09',
    positionId: '7547453908',
  },
];

export function getPositions(): Position[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // fall through to defaults
  }
  // Initialize with defaults
  savePositions(DEFAULT_POSITIONS);
  return DEFAULT_POSITIONS;
}

export function savePositions(positions: Position[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

export function addPosition(position: Omit<Position, 'id'>): Position {
  const positions = getPositions();
  const newPosition: Position = {
    ...position,
    id: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  positions.push(newPosition);
  savePositions(positions);
  return newPosition;
}

export function removePosition(id: string): void {
  const positions = getPositions().filter((p) => p.id !== id);
  savePositions(positions);
}

export function resetToDefaults(): void {
  savePositions(DEFAULT_POSITIONS);
}
