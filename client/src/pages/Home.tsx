/**
 * Stock Portfolio Tracker — Home Page
 * Design: Dark Command Center
 * 
 * Main dashboard page assembling all components:
 * - Header with portfolio summary
 * - Hero banner
 * - Price chart (2/3 width) + Position/Watchlist detail card (1/3 width)
 * - AI Analysis panel
 * - Market stats strip
 * - Watchlist (clickable to switch chart view)
 * - News feed
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import Header from '@/components/Header';
import HeroBanner from '@/components/HeroBanner';
import PriceChart from '@/components/PriceChart';
import PositionCard from '@/components/PositionCard';
import MarketStats from '@/components/MarketStats';
import Watchlist from '@/components/Watchlist';
import AddToWatchlistDialog from '@/components/AddToWatchlistDialog';
import NewsFeed from '@/components/NewsFeed';
import AddPositionDialog from '@/components/AddPositionDialog';
import StockAnalysis from '@/components/StockAnalysis';
import { getPositions } from '@/lib/portfolio';
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '@/lib/watchlist';
import { useStockData } from '@/hooks/useStockData';
import { useNews } from '@/hooks/useNews';
import type { Position, WatchlistItem, TimeRange } from '@/lib/types';

/**
 * Represents which instrument is currently selected for the main chart view.
 * Can be either a portfolio position or a watchlist item.
 */
type ViewMode = 
  | { type: 'position'; position: Position }
  | { type: 'watchlist'; item: WatchlistItem };

export default function Home() {
  const [positions, setPositions] = useState<Position[]>(() => getPositions());
  const [timeRange, setTimeRange] = useState<TimeRange>('1mo');
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Watchlist state
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>(() => getWatchlist());
  const [watchlistDialogOpen, setWatchlistDialogOpen] = useState(false);

  // Unified view mode: which instrument is being viewed in the chart
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);

  // Select first position by default
  useEffect(() => {
    if (positions.length > 0 && !viewMode) {
      setViewMode({ type: 'position', position: positions[0] });
    }
  }, [positions, viewMode]);

  // Derive the active symbol from the view mode
  const activeSymbol = useMemo(() => {
    if (!viewMode) return 'BRNT.L';
    return viewMode.type === 'position'
      ? viewMode.position.yahooSymbol
      : viewMode.item.yahooSymbol;
  }, [viewMode]);

  // Derive display name for the active instrument
  const activeName = useMemo(() => {
    if (!viewMode) return 'BRNT';
    return viewMode.type === 'position'
      ? viewMode.position.name
      : viewMode.item.name;
  }, [viewMode]);

  // Fetch stock data for the active symbol
  const { quote, chart, loading: stockLoading, error: stockError, refetch } = useStockData(activeSymbol, timeRange);

  // Fetch news for all position + watchlist symbols
  const newsSymbols = useMemo(
    () => [
      ...positions.map((p) => p.yahooSymbol),
      ...watchlistItems.map((w) => w.yahooSymbol),
    ],
    [positions, watchlistItems]
  );
  const { news, loading: newsLoading } = useNews(newsSymbols);

  // Calculate portfolio totals (only when viewing a position)
  const portfolioSummary = useMemo(() => {
    if (!quote || !viewMode || viewMode.type !== 'position') {
      return { totalValue: 0, totalCost: 0, totalPnL: 0, totalPnLPercent: 0 };
    }
    const pos = viewMode.position;
    const totalValue = quote.price * pos.quantity;
    const totalCost = pos.avgPrice * pos.quantity;
    const totalPnL = totalValue - totalCost;
    const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
    return { totalValue, totalCost, totalPnL, totalPnLPercent };
  }, [quote, viewMode]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handlePositionAdded = useCallback(() => {
    const updated = getPositions();
    setPositions(updated);
    setAddDialogOpen(false);
  }, []);

  // Watchlist handlers
  const handleAddToWatchlist = useCallback((item: Omit<WatchlistItem, 'id'>) => {
    addToWatchlist(item);
    setWatchlistItems(getWatchlist());
  }, []);

  const handleRemoveFromWatchlist = useCallback((id: string) => {
    removeFromWatchlist(id);
    setWatchlistItems(getWatchlist());
    // If we were viewing the removed item, switch back to first position
    if (viewMode?.type === 'watchlist') {
      const remaining = getWatchlist();
      const wasRemoved = !remaining.find(w => w.id === id);
      if (wasRemoved && viewMode.item.id === id && positions.length > 0) {
        setViewMode({ type: 'position', position: positions[0] });
      }
    }
  }, [viewMode, positions]);

  // Handle clicking a watchlist item to view its chart
  const handleWatchlistSelect = useCallback((item: WatchlistItem) => {
    setViewMode({ type: 'watchlist', item });
    setTimeRange('1mo'); // Reset to 1 month view
    // Scroll to top to see the chart
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Handle clicking a position tab to switch back
  const handlePositionSelect = useCallback((pos: Position) => {
    setViewMode({ type: 'position', position: pos });
  }, []);

  const existingWatchlistSymbols = useMemo(
    () => watchlistItems.map((w) => w.yahooSymbol),
    [watchlistItems]
  );

  // Determine the currently selected position (if viewing a position)
  const selectedPosition = viewMode?.type === 'position' ? viewMode.position : null;

  // Currency for header display
  const headerCurrency = viewMode?.type === 'position'
    ? viewMode.position.currency
    : quote?.currency;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header
        totalValue={portfolioSummary.totalValue}
        totalPnL={portfolioSummary.totalPnL}
        totalPnLPercent={portfolioSummary.totalPnLPercent}
        isLive={!!quote}
        onRefresh={handleRefresh}
        currency={headerCurrency}
      />

      {/* Main Content */}
      <main className="container py-5 space-y-5">
        {/* Hero Banner */}
        <HeroBanner
          positionCount={positions.length}
          onAddPosition={() => setAddDialogOpen(true)}
        />

        {/* Viewing indicator when watching a watchlist item */}
        {viewMode?.type === 'watchlist' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-primary font-medium">
                Viewing watchlist item:
              </span>
              <span className="font-display font-bold text-sm text-foreground">
                {viewMode.item.symbol}
              </span>
              <span className="text-xs text-muted-foreground">
                {viewMode.item.name}
              </span>
            </div>
            <button
              onClick={() => positions.length > 0 && setViewMode({ type: 'position', position: positions[0] })}
              className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
            >
              Back to Portfolio
            </button>
          </motion.div>
        )}

        {/* Position Tabs (if multiple positions) */}
        {positions.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {positions.map((pos) => (
              <button
                key={pos.id}
                onClick={() => handlePositionSelect(pos)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shrink-0 ${
                  viewMode?.type === 'position' && selectedPosition?.id === pos.id
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'bg-secondary/30 text-muted-foreground border border-border/30 hover:text-foreground hover:bg-secondary/50'
                }`}
              >
                <span className="font-display font-semibold">{pos.symbol}</span>
                <span className="text-xs opacity-60">{pos.quantity} units</span>
              </button>
            ))}
          </div>
        )}

        {/* Chart + Position/Detail Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Price Chart — 2/3 width */}
          <div className="lg:col-span-2">
            <PriceChart
              data={chart}
              range={timeRange}
              onRangeChange={setTimeRange}
              symbol={activeSymbol}
              currentPrice={quote?.price ?? 0}
              previousClose={quote?.previousClose ?? 0}
              loading={stockLoading}
            />
          </div>

          {/* Detail Card — 1/3 width */}
          <div className="lg:col-span-1">
            {selectedPosition && (
              <PositionCard
                position={selectedPosition}
                quote={quote}
                loading={stockLoading}
              />
            )}
            {viewMode?.type === 'watchlist' && quote && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="glass-card rounded-xl p-5 space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">
                        {viewMode.item.category === 'commodity' ? '🏆' : '📊'}
                      </span>
                      <div>
                        <h3 className="font-display text-base font-semibold leading-none">
                          {viewMode.item.symbol}
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {viewMode.item.exchange}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-[220px]">
                      {viewMode.item.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-2xl font-bold tabular-nums">
                      {quote.currency === 'AED' ? 'AED ' : quote.currency === 'GBP' ? '£' : '$'}
                      {quote.price.toFixed(quote.price > 100 ? 2 : 3)}
                    </p>
                    <div className={`flex items-center justify-end gap-1 text-sm ${
                      quote.change >= 0 ? 'text-positive' : 'text-negative'
                    }`}>
                      <span className="font-display font-medium tabular-nums">
                        {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(3)} ({quote.changePercent.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border/50" />

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-secondary/40 p-3">
                    <p className="text-[11px] text-muted-foreground mb-1">Day Range</p>
                    <p className="text-xs font-medium tabular-nums">
                      {quote.dayLow.toFixed(2)} — {quote.dayHigh.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 p-3">
                    <p className="text-[11px] text-muted-foreground mb-1">Volume</p>
                    <p className="text-xs font-medium tabular-nums">
                      {quote.volume >= 1_000_000
                        ? `${(quote.volume / 1_000_000).toFixed(1)}M`
                        : quote.volume >= 1_000
                        ? `${(quote.volume / 1_000).toFixed(1)}K`
                        : quote.volume.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 p-3">
                    <p className="text-[11px] text-muted-foreground mb-1">52W High</p>
                    <p className="text-xs font-medium tabular-nums">
                      {quote.fiftyTwoWeekHigh.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 p-3">
                    <p className="text-[11px] text-muted-foreground mb-1">52W Low</p>
                    <p className="text-xs font-medium tabular-nums">
                      {quote.fiftyTwoWeekLow.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Watchlist badge */}
                <div className="flex items-center justify-center">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 bg-secondary/30 px-3 py-1 rounded-full">
                    Watchlist Item — Not in Portfolio
                  </span>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* AI Analysis Panel */}
        {quote && (
          <StockAnalysis
            symbol={activeSymbol}
            name={activeName}
            price={quote.price}
            change={quote.change}
            changePercent={quote.changePercent}
            dayHigh={quote.dayHigh}
            dayLow={quote.dayLow}
            fiftyTwoWeekHigh={quote.fiftyTwoWeekHigh}
            fiftyTwoWeekLow={quote.fiftyTwoWeekLow}
            volume={quote.volume}
            previousClose={quote.previousClose}
            currency={quote.currency}
            exchange={quote.exchange}
          />
        )}

        {/* Market Stats */}
        <MarketStats quote={quote} loading={stockLoading} />

        {/* Watchlist Section */}
        <Watchlist
          items={watchlistItems}
          onRemove={handleRemoveFromWatchlist}
          onAdd={() => setWatchlistDialogOpen(true)}
          onSelect={handleWatchlistSelect}
          selectedSymbol={viewMode?.type === 'watchlist' ? viewMode.item.yahooSymbol : undefined}
        />

        {/* News Feed */}
        <NewsFeed news={news} loading={newsLoading} />

        {/* Mobile Add Button */}
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          onClick={() => setAddDialogOpen(true)}
          className="fixed bottom-6 right-6 sm:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl glow-blue z-40"
        >
          <Plus className="h-6 w-6" />
        </motion.button>
      </main>

      {/* Add Position Dialog */}
      <AddPositionDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdded={handlePositionAdded}
      />

      {/* Add to Watchlist Dialog */}
      <AddToWatchlistDialog
        open={watchlistDialogOpen}
        onClose={() => setWatchlistDialogOpen(false)}
        onAdd={handleAddToWatchlist}
        existingSymbols={existingWatchlistSymbols}
      />
    </div>
  );
}
