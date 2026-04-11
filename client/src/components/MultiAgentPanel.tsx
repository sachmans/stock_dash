/**
 * Multi-Agent Analysis Panel
 * Shows 4 AI agents debating + moderator verdict
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Globe,
  MessageSquare,
  Shield,
  Target,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Gavel,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatNumber } from '@/lib/format';

/* ─── Types (mirrors server output) ─── */
interface AgentOpinion {
  agent: string;
  role: string;
  stance: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  reasoning: string;
  keyPoints: string[];
}

interface MultiAgentResult {
  agents: AgentOpinion[];
  consensus: {
    recommendation: string;
    confidence: number;
    summary: string;
    agreementLevel: string;
  };
  debate: string;
  finalVerdict: {
    action: string;
    buyLevel: number;
    stopLoss: number;
    targetPrice: number;
    riskRewardRatio: number;
    timeHorizon: string;
  };
  analyzedAt: number;
  symbol: string;
}

interface MultiAgentPanelProps {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  volume?: number;
  previousClose?: number;
  currency?: string;
  exchange?: string;
  technicalSignals?: string[];
  dailyTrend?: string;
  dailyStrength?: number;
}

/* ─── Config ─── */
const AGENT_ICONS: Record<string, typeof BarChart3> = {
  technical: BarChart3,
  fundamental: Globe,
  sentiment: MessageSquare,
  risk: Shield,
};

const AGENT_COLORS: Record<string, string> = {
  technical: 'text-blue-400',
  fundamental: 'text-emerald-400',
  sentiment: 'text-purple-400',
  risk: 'text-amber-400',
};

const AGENT_BG: Record<string, string> = {
  technical: 'bg-blue-500/10 border-blue-500/20',
  fundamental: 'bg-emerald-500/10 border-emerald-500/20',
  sentiment: 'bg-purple-500/10 border-purple-500/20',
  risk: 'bg-amber-500/10 border-amber-500/20',
};

const STANCE_CONFIG = {
  BULLISH: { color: 'text-green-400', bg: 'bg-green-500/15', icon: TrendingUp },
  BEARISH: { color: 'text-red-400', bg: 'bg-red-500/15', icon: TrendingDown },
  NEUTRAL: { color: 'text-amber-400', bg: 'bg-amber-500/15', icon: Minus },
};

const REC_COLORS: Record<string, string> = {
  STRONG_BUY: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  BUY: 'text-green-400 bg-green-500/15 border-green-500/30',
  HOLD: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  SELL: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
  STRONG_SELL: 'text-red-400 bg-red-500/15 border-red-500/30',
};

const AGREEMENT_COLORS: Record<string, string> = {
  UNANIMOUS: 'text-emerald-400',
  MAJORITY: 'text-green-400',
  SPLIT: 'text-amber-400',
  DIVIDED: 'text-red-400',
};

/* ─── Agent Card ─── */
function AgentCard({ agent, index }: { agent: AgentOpinion; index: number }) {
  const [showDetails, setShowDetails] = useState(false);
  const Icon = AGENT_ICONS[agent.role] || Brain;
  const stanceConfig = STANCE_CONFIG[agent.stance] || STANCE_CONFIG.NEUTRAL;
  const StanceIcon = stanceConfig.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`rounded-lg border p-3 ${AGENT_BG[agent.role] || 'bg-secondary/10 border-secondary/20'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${AGENT_COLORS[agent.role] || 'text-muted-foreground'}`} />
          <span className="text-xs font-semibold text-foreground">{agent.agent}</span>
        </div>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${stanceConfig.bg} ${stanceConfig.color}`}>
          <StanceIcon className="h-3 w-3" />
          {agent.stance}
        </div>
      </div>

      {/* Confidence bar */}
      <div className="mb-2">
        <div className="flex justify-between text-[10px] text-muted-foreground/60 mb-0.5">
          <span>Confidence</span>
          <span className="font-mono">{agent.confidence}%</span>
        </div>
        <div className="h-1 bg-secondary/30 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${agent.confidence}%` }}
            transition={{ duration: 0.8, delay: index * 0.1 + 0.3 }}
            className={`h-full rounded-full ${
              agent.confidence >= 70 ? 'bg-green-400' : agent.confidence >= 40 ? 'bg-amber-400' : 'bg-red-400'
            }`}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{agent.reasoning}</p>

      {agent.keyPoints.length > 0 && (
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="mt-2 text-[10px] text-primary/60 hover:text-primary transition-colors flex items-center gap-1"
        >
          {showDetails ? 'Hide' : 'Show'} key points
          {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      )}

      <AnimatePresence>
        {showDetails && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-2 space-y-1 overflow-hidden"
          >
            {agent.keyPoints.map((point, i) => (
              <li key={i} className="text-[10px] text-muted-foreground/70 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-primary/40">
                {point}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Main Component ─── */
export default function MultiAgentPanel(props: MultiAgentPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const queryInput = {
    symbol: props.symbol,
    name: props.name,
    price: props.price,
    change: props.change,
    changePercent: props.changePercent,
    dayHigh: props.dayHigh,
    dayLow: props.dayLow,
    fiftyTwoWeekHigh: props.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: props.fiftyTwoWeekLow,
    volume: props.volume,
    previousClose: props.previousClose,
    currency: props.currency,
    exchange: props.exchange,
    technicalSignals: props.technicalSignals,
    dailyTrend: props.dailyTrend,
    dailyStrength: props.dailyStrength,
  };

  const { data: rawData, isLoading, refetch, isFetching } = trpc.stock.getMultiAgentAnalysis.useQuery(
    queryInput,
    {
      enabled: props.price > 0 && expanded, // Only fetch when expanded
      staleTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  );

  const data = rawData as MultiAgentResult | null | undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="glass-card rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-secondary/10 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5">
          <Users className="h-5 w-5 text-cyan-400" />
          <h2 className="font-display font-bold text-foreground text-base">
            Multi-Agent Analysis
          </h2>
          <span className="text-[10px] uppercase tracking-wider text-cyan-400/60 bg-cyan-500/10 px-2 py-0.5 rounded-full">
            4 Agents + Moderator
          </span>
        </div>
        <div className="flex items-center gap-2">
          {data && !isLoading && (
            <button
              onClick={(e) => { e.stopPropagation(); refetch(); }}
              disabled={isFetching}
              className="p-1.5 rounded-md hover:bg-secondary/30 transition-colors text-muted-foreground/60 hover:text-muted-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground/40" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/40" />}
        </div>
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
              {(isLoading || isFetching) && !data && (
                <div className="flex flex-col items-center justify-center py-10">
                  <div className="relative">
                    <Loader2 className="h-10 w-10 animate-spin text-cyan-400" />
                    <Users className="h-4 w-4 text-cyan-400/60 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">Agents are analyzing {props.name}...</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">4 specialists debating, moderator synthesizing</p>
                </div>
              )}

              {/* Results */}
              {data && (
                <>
                  {/* Moderator Verdict */}
                  <div className="bg-secondary/10 border border-secondary/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Gavel className="h-4 w-4 text-cyan-400" />
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider">Moderator Verdict</span>
                      <span className={`ml-auto text-xs font-bold ${AGREEMENT_COLORS[data.consensus.agreementLevel] || 'text-muted-foreground'}`}>
                        {data.consensus.agreementLevel}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mb-3">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold border ${REC_COLORS[data.consensus.recommendation] || REC_COLORS.HOLD}`}>
                        {data.consensus.recommendation.replace('_', ' ')}
                      </span>
                      <span className="text-sm font-mono text-foreground">{data.consensus.confidence}% confidence</span>
                    </div>

                    <p className="text-sm text-muted-foreground leading-relaxed">{data.consensus.summary}</p>

                    {/* Price levels */}
                    <div className="grid grid-cols-3 gap-3 mt-4">
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Entry</div>
                        <div className="text-sm font-mono font-bold text-green-400">
                          {formatNumber(data.finalVerdict.buyLevel)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Stop Loss</div>
                        <div className="text-sm font-mono font-bold text-red-400">
                          {formatNumber(data.finalVerdict.stopLoss)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Target</div>
                        <div className="text-sm font-mono font-bold text-emerald-400">
                          {formatNumber(data.finalVerdict.targetPrice)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground/60">
                      <span>R:R {data.finalVerdict.riskRewardRatio}x</span>
                      <span>{data.finalVerdict.timeHorizon}</span>
                      <span>{data.finalVerdict.action}</span>
                    </div>
                  </div>

                  {/* Debate Summary */}
                  <div className="bg-secondary/5 border border-secondary/15 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">Debate Summary</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{data.debate}</p>
                  </div>

                  {/* Agent Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.agents.map((agent, i) => (
                      <AgentCard key={agent.role} agent={agent} index={i} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
