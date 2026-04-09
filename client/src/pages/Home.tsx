/**
 * Stock Portfolio Tracker — Home Page
 * Design: Dark Command Center
 * 
 * Main dashboard page assembling all components:
 * - Header with portfolio summary
 * - Hero banner
 * - Price chart (2/3 width)
 * - Position card (1/3 width)
 * - Market stats strip
 * - Watchlist (separate from portfolio)
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
import { getPositions } from '@/lib/portfolio';
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '@/lib/watchlist';
import { useStockData } from '@/hooks/useStockData';
import { useNews } from '@/hooks/useNews';
import type { Position, WatchlistItem, TimeRange } from '@/lib/types';

export default function Home() {
  const [positions, setPositions] = useState<Position[]>(() => getPositions());
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('1mo');
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Watchlist state
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>(() => getWatchlist());
  const [watchlistDialogOpen, setWatchlistDialogOpen] = useState(false);

  // Select first position by default
  useEffect(() => {
    if (positions.length > 0 && !selectedPosition) {
      setSelectedPosition(positions[0]);
    }
  }, [positions, selectedPosition]);

  const activeSymbol = selectedPosition?.yahooSymbol || 'BRNT.L';

  // Fetch stock data for the selected position
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

  // Calculate portfolio totals
  const portfolioSummary = useMemo(() => {
    if (!quote || !selectedPosition) {
      return { totalValue: 0, totalCost: 0, totalPnL: 0, totalPnLPercent: 0 };
    }
    const totalValue = quote.price * selectedPosition.quantity;
    const totalCost = selectedPosition.avgPrice * selectedPosition.quantity;
    const totalPnL = totalValue - totalCost;
    const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
    return { totalValue, totalCost, totalPnL, totalPnLPercent };
  }, [quote, selectedPosition]);

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
  }, []);

  const existingWatchlistSymbols = useMemo(
    () => watchlistItems.map((w) => w.yahooSymbol),
    [watchlistItems]
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header
        totalValue={portfolioSummary.totalValue}
        totalPnL={portfolioSummary.totalPnL}
        totalPnLPercent={portfolioSummary.totalPnLPercent}
        isLive={!!quote}
        onRefresh={handleRefresh}
        currency={selectedPosition?.currency}
      />

      {/* Main Content */}
      <main className="container py-5 space-y-5">
        {/* Hero Banner */}
        <HeroBanner
          positionCount={positions.length}
          onAddPosition={() => setAddDialogOpen(true)}
        />

        {/* Position Tabs (if multiple positions) */}
        {positions.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {positions.map((pos) => (
              <button
                key={pos.id}
                onClick={() => setSelectedPosition(pos)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shrink-0 ${
                  selectedPosition?.id === pos.id
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

        {/* Chart + Position Grid */}
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

          {/* Position Card — 1/3 width */}
          <div className="lg:col-span-1">
            {selectedPosition && (
              <PositionCard
                position={selectedPosition}
                quote={quote}
                loading={stockLoading}
              />
            )}
          </div>
        </div>

        {/* Market Stats */}
        <MarketStats quote={quote} loading={stockLoading} />

        {/* Watchlist Section */}
        <Watchlist
          items={watchlistItems}
          onRemove={handleRemoveFromWatchlist}
          onAdd={() => setWatchlistDialogOpen(true)}
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
