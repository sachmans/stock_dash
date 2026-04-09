/**
 * Stock Portfolio Tracker — Hero Banner Component
 * Design: Dark Command Center
 * 
 * Displays a visually striking hero section with the oil commodity image
 * and key portfolio headline.
 */

import { motion } from 'framer-motion';

const HERO_BG = 'https://d2xsxph8kpxj0f.cloudfront.net/109756376/ZPbk3R8RpqEj7mYeyZ8LwY/hero-bg-QM8CNq2ESAXausF2dWUvoa.webp';
const OIL_IMG = 'https://d2xsxph8kpxj0f.cloudfront.net/109756376/ZPbk3R8RpqEj7mYeyZ8LwY/oil-commodity-6ofTCKVd24aBdxL6wDrDbg.webp';

interface HeroBannerProps {
  positionCount: number;
  onAddPosition: () => void;
}

export default function HeroBanner({ positionCount, onAddPosition }: HeroBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="relative overflow-hidden rounded-2xl h-[180px] sm:h-[200px]"
    >
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${HERO_BG})` }}
      />
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/70 to-background/40" />

      {/* Content */}
      <div className="relative z-10 h-full flex items-center px-6 sm:px-8">
        <div className="flex items-center gap-6 w-full">
          {/* Oil Image Thumbnail */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="hidden sm:block shrink-0"
          >
            <div className="h-24 w-24 rounded-xl overflow-hidden border-2 border-border/30 shadow-xl">
              <img
                src={OIL_IMG}
                alt="Brent Crude Oil"
                className="h-full w-full object-cover"
              />
            </div>
          </motion.div>

          {/* Text */}
          <div className="flex-1">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="text-xs text-primary font-medium uppercase tracking-widest mb-1"
            >
              Commodity Portfolio
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="font-display text-2xl sm:text-3xl font-bold text-foreground leading-tight"
            >
              Brent Crude Oil Tracker
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="text-sm text-muted-foreground mt-1"
            >
              Tracking {positionCount} active position{positionCount !== 1 ? 's' : ''} with live market data
            </motion.p>
          </div>

          {/* Add Position Button */}
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            onClick={onAddPosition}
            className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/15 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/25 transition-colors shrink-0"
          >
            <span className="text-lg leading-none">+</span>
            Add Position
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
