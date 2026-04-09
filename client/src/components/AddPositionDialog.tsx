/**
 * Stock Portfolio Tracker — Add Position Dialog
 * Design: Dark Command Center
 * 
 * Modal dialog for adding new stock positions to the portfolio.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Search } from 'lucide-react';
import { addPosition } from '@/lib/portfolio';
import type { Position } from '@/lib/types';

interface AddPositionDialogProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

const POPULAR_SYMBOLS = [
  { symbol: 'AAPL', yahoo: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' },
  { symbol: 'MSFT', yahoo: 'MSFT', name: 'Microsoft Corp.', exchange: 'NASDAQ' },
  { symbol: 'GOOGL', yahoo: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ' },
  { symbol: 'TSLA', yahoo: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ' },
  { symbol: 'AMZN', yahoo: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ' },
  { symbol: 'NVDA', yahoo: 'NVDA', name: 'NVIDIA Corp.', exchange: 'NASDAQ' },
  { symbol: 'BRK-B', yahoo: 'BRK-B', name: 'Berkshire Hathaway', exchange: 'NYSE' },
  { symbol: 'META', yahoo: 'META', name: 'Meta Platforms', exchange: 'NASDAQ' },
];

export default function AddPositionDialog({ open, onClose, onAdded }: AddPositionDialogProps) {
  const [symbol, setSymbol] = useState('');
  const [yahooSymbol, setYahooSymbol] = useState('');
  const [name, setName] = useState('');
  const [exchange, setExchange] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [step, setStep] = useState<'search' | 'details'>('search');

  const handleSelectSymbol = (sym: typeof POPULAR_SYMBOLS[0]) => {
    setSymbol(sym.symbol);
    setYahooSymbol(sym.yahoo);
    setName(sym.name);
    setExchange(sym.exchange);
    setStep('details');
  };

  const handleCustomSymbol = () => {
    if (!symbol.trim()) return;
    if (!yahooSymbol.trim()) setYahooSymbol(symbol.trim());
    setStep('details');
  };

  const handleSubmit = () => {
    if (!symbol || !quantity || !avgPrice) return;
    addPosition({
      symbol: symbol.toUpperCase(),
      yahooSymbol: yahooSymbol || symbol.toUpperCase(),
      name: name || symbol.toUpperCase(),
      exchange: exchange || 'Unknown',
      quantity: parseFloat(quantity),
      avgPrice: parseFloat(avgPrice),
      currency,
      openedDate: new Date().toISOString().split('T')[0],
    });
    onAdded();
    handleReset();
  };

  const handleReset = () => {
    setSymbol('');
    setYahooSymbol('');
    setName('');
    setExchange('');
    setQuantity('');
    setAvgPrice('');
    setCurrency('USD');
    setStep('search');
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={handleReset}
          />
          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-x-4 top-[10%] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-50 w-auto sm:w-[440px] glass-card rounded-2xl p-6 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg font-semibold">Add Position</h2>
              <button
                onClick={handleReset}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-secondary transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {step === 'search' ? (
              <div className="space-y-4">
                {/* Custom Symbol Input */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Enter Yahoo symbol (e.g. AAPL, BRNT.L)"
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && handleCustomSymbol()}
                      className="w-full h-10 pl-10 pr-4 rounded-lg bg-secondary/60 border border-border/50 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <button
                    onClick={handleCustomSymbol}
                    disabled={!symbol.trim()}
                    className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
                  >
                    Next
                  </button>
                </div>

                {/* Yahoo Symbol Override */}
                <div>
                  <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Yahoo Finance Symbol (if different)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BRNT.L for London exchange"
                    value={yahooSymbol}
                    onChange={(e) => setYahooSymbol(e.target.value.toUpperCase())}
                    className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border/50 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                {/* Popular Symbols */}
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">
                    Popular Symbols
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {POPULAR_SYMBOLS.map((sym) => (
                      <button
                        key={sym.symbol}
                        onClick={() => handleSelectSymbol(sym)}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/60 border border-border/30 transition-colors text-left"
                      >
                        <span className="font-display text-sm font-semibold text-primary">
                          {sym.symbol}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate">
                          {sym.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Selected Symbol */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <span className="font-display text-lg font-bold text-primary">{symbol}</span>
                  <span className="text-sm text-muted-foreground">{name || yahooSymbol}</span>
                  <button
                    onClick={() => setStep('search')}
                    className="ml-auto text-xs text-primary hover:underline"
                  >
                    Change
                  </button>
                </div>

                {/* Name */}
                <div>
                  <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Company / instrument name"
                    className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border/50 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                {/* Quantity & Price */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1.5">
                      Quantity
                    </label>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="250"
                      className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border/50 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1.5">
                      Avg. Price
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      value={avgPrice}
                      onChange={(e) => setAvgPrice(e.target.value)}
                      placeholder="78.660"
                      className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border/50 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50 tabular-nums"
                    />
                  </div>
                </div>

                {/* Currency & Exchange */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1.5">
                      Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="USD">USD</option>
                      <option value="GBP">GBP</option>
                      <option value="EUR">EUR</option>
                      <option value="GBX">GBX</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1.5">
                      Exchange
                    </label>
                    <input
                      type="text"
                      value={exchange}
                      onChange={(e) => setExchange(e.target.value)}
                      placeholder="NASDAQ"
                      className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border/50 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={!quantity || !avgPrice}
                  className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add to Portfolio
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
