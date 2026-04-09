/**
 * Stock Portfolio Tracker — News Feed Component
 * Design: Dark Command Center
 * 
 * Displays financial news related to tracked positions.
 */

import { motion } from 'framer-motion';
import { Newspaper, ExternalLink, Clock } from 'lucide-react';
import type { NewsItem } from '@/lib/types';
import { timeAgo } from '@/lib/format';

interface NewsFeedProps {
  news: NewsItem[];
  loading?: boolean;
}

export default function NewsFeed({ news, loading }: NewsFeedProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass-card rounded-xl p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold">Market News & Insights</h2>
        </div>
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
          {news.length} items
        </span>
      </div>

      {/* News List */}
      <div className="space-y-1">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="p-3 animate-pulse">
              <div className="h-4 w-3/4 bg-secondary rounded mb-2" />
              <div className="h-3 w-full bg-secondary/60 rounded mb-1" />
              <div className="h-3 w-2/3 bg-secondary/40 rounded" />
            </div>
          ))
        ) : news.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No news available at this time
          </div>
        ) : (
          news.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.05 * i }}
            >
              <a
                href={item.url !== '#' ? item.url : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg p-3 -mx-1 hover:bg-secondary/40 transition-colors group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {item.title}
                    </h3>
                    {item.summary && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {item.summary}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-primary/80 font-medium uppercase tracking-wider">
                        {item.source}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                        <Clock className="h-2.5 w-2.5" />
                        {timeAgo(item.publishedAt)}
                      </div>
                    </div>
                  </div>
                  {item.url !== '#' && (
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 mt-0.5" />
                  )}
                </div>
              </a>
              {i < news.length - 1 && <div className="h-px bg-border/30 mx-2" />}
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
}
