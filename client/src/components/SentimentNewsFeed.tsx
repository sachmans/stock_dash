/**
 * Sentiment-Scored News Feed
 * Shows news articles with AI sentiment scores and impact ratings.
 * Inspired by mvanhorn/last30days-skill.
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Newspaper,
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface SentimentNewsFeedProps {
  symbol: string;
  instrumentName: string;
  newsItems: Array<{
    title: string;
    link?: string;
    publisher?: string;
    providerPublishTime?: number;
    type?: string;
  }>;
}

/* ─── Config ─── */
const SENTIMENT_CONFIG = {
  BULLISH: { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', icon: TrendingUp },
  BEARISH: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: TrendingDown },
  NEUTRAL: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Minus },
};

const IMPACT_CONFIG = {
  HIGH: { color: 'text-red-400', bg: 'bg-red-500/10', icon: Flame },
  MEDIUM: { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: AlertTriangle },
  LOW: { color: 'text-muted-foreground/60', bg: 'bg-secondary/10', icon: Info },
};

const CATEGORY_COLORS: Record<string, string> = {
  earnings: 'text-green-400 bg-green-500/10',
  macro: 'text-blue-400 bg-blue-500/10',
  geopolitical: 'text-red-400 bg-red-500/10',
  technical: 'text-purple-400 bg-purple-500/10',
  sector: 'text-amber-400 bg-amber-500/10',
  regulatory: 'text-orange-400 bg-orange-500/10',
  general: 'text-muted-foreground/60 bg-secondary/10',
};

/* ─── Sentiment Score Bar ─── */
function SentimentBar({ score }: { score: number }) {
  // Score is -100 to +100, map to 0-100 for display
  const pct = (score + 100) / 2;
  const color = score > 15 ? 'bg-green-400' : score < -15 ? 'bg-red-400' : 'bg-amber-400';

  return (
    <div className="flex items-center gap-2">
      <div className="text-[10px] font-mono text-muted-foreground/50 w-8 text-right">
        {score > 0 ? '+' : ''}{score}
      </div>
      <div className="flex-1 h-1 bg-secondary/30 rounded-full overflow-hidden relative">
        {/* Center line */}
        <div className="absolute left-1/2 top-0 w-px h-full bg-muted-foreground/20" />
        <motion.div
          initial={{ width: '50%' }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

/* ─── News Article Card ─── */
function ScoredArticle({ article, index }: {
  article: {
    title: string;
    source: string;
    sentiment: string;
    score: number;
    confidence: number;
    impact: string;
    category: string;
    link?: string;
    publishedAt?: string;
  };
  index: number;
}) {
  const sentimentCfg = SENTIMENT_CONFIG[article.sentiment as keyof typeof SENTIMENT_CONFIG] || SENTIMENT_CONFIG.NEUTRAL;
  const impactCfg = IMPACT_CONFIG[article.impact as keyof typeof IMPACT_CONFIG] || IMPACT_CONFIG.LOW;
  const SentimentIcon = sentimentCfg.icon;
  const ImpactIcon = impactCfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`rounded-lg border p-3 ${sentimentCfg.bg} ${sentimentCfg.border} hover:bg-secondary/15 transition-colors`}
    >
      <div className="flex items-start gap-3">
        {/* Sentiment indicator */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${sentimentCfg.bg} flex items-center justify-center`}>
          <SentimentIcon className={`h-4 w-4 ${sentimentCfg.color}`} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="flex items-start gap-2">
            <h3 className="text-sm font-medium text-foreground leading-tight line-clamp-2 flex-1">
              {article.link ? (
                <a href={article.link} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                  {article.title}
                  <ExternalLink className="inline h-3 w-3 ml-1 opacity-40" />
                </a>
              ) : (
                article.title
              )}
            </h3>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground/50">{article.source}</span>
            {article.publishedAt && (
              <span className="text-[10px] text-muted-foreground/40">
                {new Date(article.publishedAt).toLocaleDateString()}
              </span>
            )}
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[article.category] || CATEGORY_COLORS.general}`}>
              {article.category}
            </span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 ${impactCfg.color} ${impactCfg.bg}`}>
              <ImpactIcon className="h-2.5 w-2.5" />
              {article.impact}
            </span>
          </div>

          {/* Sentiment bar */}
          <div className="mt-2">
            <SentimentBar score={article.score} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main Component ─── */
export default function SentimentNewsFeed({ symbol, instrumentName, newsItems }: SentimentNewsFeedProps) {
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH' | 'NEUTRAL'>('ALL');

  const articles = useMemo(() =>
    newsItems.map(item => ({
      title: item.title,
      summary: item.title,
      source: item.publisher || 'Unknown',
    })),
    [newsItems],
  );

  const { data: rawData, isLoading } = trpc.stock.getSentimentNews.useQuery(
    { symbol, instrumentName, articles },
    {
      enabled: articles.length > 0,
      staleTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  );

  const data = rawData as any;

  const scoredArticles = useMemo(() => {
    if (!data?.articles) return [];
    return data.articles.map((a: any, i: number) => ({
      ...a,
      link: newsItems[i]?.link,
      publishedAt: newsItems[i]?.providerPublishTime
        ? new Date(newsItems[i].providerPublishTime! * 1000).toISOString()
        : undefined,
    }));
  }, [data, newsItems]);

  const filteredArticles = useMemo(() => {
    if (filter === 'ALL') return scoredArticles;
    return scoredArticles.filter((a: any) => a.sentiment === filter);
  }, [scoredArticles, filter]);

  const summary = data?.summary;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="glass-card rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-secondary/10 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5">
          <Newspaper className="h-5 w-5 text-purple-400" />
          <h2 className="font-display font-bold text-foreground text-base">
            Sentiment News
          </h2>
          {summary && (
            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold ${
              summary.overallSentiment === 'BULLISH' ? 'text-green-400 bg-green-500/10' :
              summary.overallSentiment === 'BEARISH' ? 'text-red-400 bg-red-500/10' :
              'text-amber-400 bg-amber-500/10'
            }`}>
              {summary.overallSentiment} ({summary.averageScore > 0 ? '+' : ''}{summary.averageScore})
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground/40" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/40" />}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4">
              {/* Loading */}
              {isLoading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                  <span className="text-sm text-muted-foreground ml-2">Analyzing sentiment...</span>
                </div>
              )}

              {/* Summary bar */}
              {summary && (
                <div className="bg-secondary/10 border border-secondary/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">Sentiment Distribution</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-green-400" />
                      <span className="text-xs font-mono text-green-400">{summary.bullishCount}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Minus className="h-3 w-3 text-amber-400" />
                      <span className="text-xs font-mono text-amber-400">{summary.neutralCount}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingDown className="h-3 w-3 text-red-400" />
                      <span className="text-xs font-mono text-red-400">{summary.bearishCount}</span>
                    </div>
                    {summary.highImpactCount > 0 && (
                      <div className="flex items-center gap-1 ml-auto">
                        <Flame className="h-3 w-3 text-orange-400" />
                        <span className="text-xs font-mono text-orange-400">{summary.highImpactCount} high impact</span>
                      </div>
                    )}
                  </div>
                  {/* Stacked bar */}
                  <div className="h-2 bg-secondary/30 rounded-full overflow-hidden mt-2 flex">
                    {summary.bullishCount > 0 && (
                      <div className="bg-green-400 h-full" style={{ width: `${(summary.bullishCount / (summary.bullishCount + summary.neutralCount + summary.bearishCount)) * 100}%` }} />
                    )}
                    {summary.neutralCount > 0 && (
                      <div className="bg-amber-400 h-full" style={{ width: `${(summary.neutralCount / (summary.bullishCount + summary.neutralCount + summary.bearishCount)) * 100}%` }} />
                    )}
                    {summary.bearishCount > 0 && (
                      <div className="bg-red-400 h-full" style={{ width: `${(summary.bearishCount / (summary.bullishCount + summary.neutralCount + summary.bearishCount)) * 100}%` }} />
                    )}
                  </div>
                </div>
              )}

              {/* Filter tabs */}
              {scoredArticles.length > 0 && (
                <div className="flex gap-1">
                  {(['ALL', 'BULLISH', 'BEARISH', 'NEUTRAL'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                        filter === f
                          ? 'bg-primary/20 text-primary'
                          : 'bg-secondary/10 text-muted-foreground/60 hover:text-muted-foreground'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}

              {/* Articles */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {filteredArticles.map((article: any, i: number) => (
                  <ScoredArticle key={i} article={article} index={i} />
                ))}
                {filteredArticles.length === 0 && !isLoading && (
                  <div className="text-center py-6 text-sm text-muted-foreground/50">
                    No {filter !== 'ALL' ? filter.toLowerCase() : ''} news articles
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
