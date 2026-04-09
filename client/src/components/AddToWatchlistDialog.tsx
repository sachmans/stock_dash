/**
 * Stock Portfolio Tracker — Add to Watchlist Dialog
 * Design: Dark Command Center
 * 
 * Simple dialog to add new instruments to the watchlist.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Plus, TrendingUp } from 'lucide-react';
import type { WatchlistItem } from '@/lib/types';

const POPULAR_INSTRUMENTS = [
  { symbol: 'AAPL', yahooSymbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', currency: 'USD', category: 'stock' as const },
  { symbol: 'TSLA', yahooSymbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', currency: 'USD', category: 'stock' as const },
  { symbol: 'NVDA', yahooSymbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', currency: 'USD', category: 'stock' as const },
  { symbol: 'BTC-USD', yahooSymbol: 'BTC-USD', name: 'Bitcoin USD', exchange: 'Crypto', currency: 'USD', category: 'crypto' as const },
  { symbol: 'CL=F', yahooSymbol: 'CL=F', name: 'Crude Oil Futures', exchange: 'NYMEX', currency: 'USD', category: 'commodity' as const },
  { symbol: 'EURUSD=X', yahooSymbol: 'EURUSD=X', name: 'EUR/USD', exchange: 'FX', currency: 'USD', category: 'stock' as const },
  { symbol: 'MSFT', yahooSymbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', currency: 'USD', category: 'stock' as const },
  { symbol: 'AMZN', yahooSymbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', currency: 'USD', category: 'stock' as const },
];

interface AddToWatchlistDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (item: Omit<WatchlistItem, 'id'>) => void;
  existingSymbols: string[];
}

export default function AddToWatchlistDialog({ open, onClose, onAdd, existingSymbols }: AddToWatchlistDialogProps) {
  const [customSymbol, setCustomSymbol] = useState('');
  const [customName, setCustomName] = useState('');
  const [customExchange, setCustomExchange] = useState('');
  const [customCurrency, setCustomCurrency] = useState('USD');
  const [customCategory, setCustomCategory] = useState<'commodity' | 'stock' | 'etf' | 'crypto'>('stock');
  const [showCustomForm, setShowCustomForm] = useState(false);

  const handleAddPopular = (item: typeof POPULAR_INSTRUMENTS[0]) => {
    onAdd({
      symbol: item.symbol,
      yahooSymbol: item.yahooSymbol,
      name: item.name,
      exchange: item.exchange,
      currency: item.currency,
      category: item.category,
    });
  };

  const handleAddCustom = () => {
    if (!customSymbol.trim()) return;
    onAdd({
      symbol: customSymbol.toUpperCase(),
      yahooSymbol: customSymbol.toUpperCase(),
      name: customName || customSymbol.toUpperCase(),
      exchange: customExchange || 'Unknown',
      currency: customCurrency,
      category: customCategory,
    });
    setCustomSymbol('');
    setCustomName('');
    setCustomExchange('');
    setShowCustomForm(false);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

        {/* Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-md glass-card rounded-xl p-6 z-10 max-h-[80vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h3 className="font-display font-bold text-foreground text-lg">Add to Watchlist</h3>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-secondary/40 hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Popular Instruments */}
          <div className="mb-5">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Popular Instruments</h4>
            <div className="grid grid-cols-2 gap-2">
              {POPULAR_INSTRUMENTS.map((item) => {
                const alreadyAdded = existingSymbols.includes(item.yahooSymbol);
                return (
                  <button
                    key={item.yahooSymbol}
                    onClick={() => !alreadyAdded && handleAddPopular(item)}
                    disabled={alreadyAdded}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all ${
                      alreadyAdded
                        ? 'bg-secondary/20 text-muted-foreground/40 cursor-not-allowed'
                        : 'bg-secondary/30 hover:bg-secondary/50 border border-border/20 hover:border-primary/30'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-display font-semibold text-xs">{item.symbol}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{item.name}</div>
                    </div>
                    {alreadyAdded ? (
                      <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">Added</span>
                    ) : (
                      <Plus className="h-3.5 w-3.5 text-primary ml-auto shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Symbol */}
          <div className="border-t border-border/20 pt-4">
            {!showCustomForm ? (
              <button
                onClick={() => setShowCustomForm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border/40 text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                <Search className="h-4 w-4" />
                Add Custom Yahoo Finance Symbol
              </button>
            ) : (
              <div className="space-y-3">
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground">Custom Symbol</h4>
                <input
                  type="text"
                  placeholder="Yahoo Finance symbol (e.g., AAPL, BTC-USD)"
                  value={customSymbol}
                  onChange={(e) => setCustomSymbol(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border/30 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                />
                <input
                  type="text"
                  placeholder="Display name (optional)"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border/30 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Exchange"
                    value={customExchange}
                    onChange={(e) => setCustomExchange(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-secondary/30 border border-border/30 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                  />
                  <select
                    value={customCurrency}
                    onChange={(e) => setCustomCurrency(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-secondary/30 border border-border/30 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  >
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                    <option value="EUR">EUR</option>
                    <option value="AED">AED</option>
                    <option value="JPY">JPY</option>
                  </select>
                </div>
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border/30 text-sm text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="stock">Stock</option>
                  <option value="commodity">Commodity</option>
                  <option value="etf">ETF</option>
                  <option value="crypto">Crypto</option>
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCustomForm(false)}
                    className="flex-1 px-4 py-2 rounded-lg bg-secondary/40 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddCustom}
                    disabled={!customSymbol.trim()}
                    className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                  >
                    Add to Watchlist
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
