# Alpaca Options Trading Integration Guide

This document outlines how to integrate automated options trading strategies with the Stock Portfolio Tracker using Alpaca's API. Three proven strategies are documented below, sourced from open-source repositories, ready to be wired into the dashboard.

---

## Prerequisites

1. **Alpaca Account** — Sign up at [alpaca.markets](https://alpaca.markets) (paper trading available)
2. **API Keys** — Generate API Key ID and Secret Key from the Alpaca dashboard
3. **Options Trading Approval** — Request options trading access in your Alpaca account settings

---

## Strategy 1: The Wheel Strategy

**Source:** [alpacahq/options-wheel](https://github.com/alpacahq/options-wheel)

The Wheel is a conservative income strategy that cycles between selling cash-secured puts and covered calls.

### How It Works

1. **Sell Cash-Secured Put** — Collect premium while waiting to buy the stock at a lower price
2. **Get Assigned** — If the stock drops below the strike, you buy 100 shares at the strike price
3. **Sell Covered Call** — Collect premium on the shares you now own
4. **Get Called Away** — If the stock rises above the strike, you sell at a profit
5. **Repeat** — Start the cycle again

### Integration Architecture

```
┌─────────────────────────────────────────────────┐
│                Stock Tracker UI                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Position │  │  Wheel   │  │   Options    │  │
│  │  Cards   │  │  Status  │  │   Chain      │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└─────────────────────┬───────────────────────────┘
                      │ tRPC
┌─────────────────────▼───────────────────────────┐
│              Server (routers.ts)                 │
│  ┌──────────────────────────────────────────┐   │
│  │  alpaca.wheelStatus  (query)             │   │
│  │  alpaca.executeWheel (mutation)          │   │
│  │  alpaca.optionsChain (query)             │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────┘
                      │ REST API
┌─────────────────────▼───────────────────────────┐
│           Alpaca Trading API v2                  │
│  POST /v2/orders                                │
│  GET  /v2/positions                             │
│  GET  /v2/options/contracts                     │
└─────────────────────────────────────────────────┘
```

### Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `symbol` | — | Underlying stock symbol (e.g., AAPL) |
| `targetDTE` | 30 | Days to expiration for options |
| `deltaTarget` | 0.30 | Target delta for put/call selection |
| `minPremium` | 0.50 | Minimum premium per contract ($) |
| `maxPositionSize` | 5 | Max number of contracts |

### Sample Server Code

```typescript
// server/alpaca.ts
import Alpaca from '@alpacahq/alpaca-trade-api';

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true, // Use paper trading first!
});

// Get options chain for a symbol
async function getOptionsChain(symbol: string, expirationDate: string) {
  const contracts = await alpaca.getOptionContracts({
    underlying_symbols: symbol,
    expiration_date: expirationDate,
    type: 'put', // or 'call'
    status: 'active',
  });
  return contracts;
}

// Sell a cash-secured put
async function sellPut(symbol: string, strike: number, expiration: string) {
  const order = await alpaca.createOrder({
    symbol: `${symbol}${expiration}P${strike.toFixed(2).replace('.', '')}`,
    qty: 1,
    side: 'sell',
    type: 'limit',
    time_in_force: 'day',
    order_class: 'simple',
  });
  return order;
}
```

---

## Strategy 2: Gamma Scalping

**Source:** [alpacahq/gamma-scalping](https://github.com/alpacahq/gamma-scalping)

A market-neutral strategy that profits from volatility by delta-hedging a long straddle position.

### How It Works

1. **Buy Straddle** — Buy both a call and put at the same strike (ATM)
2. **Monitor Delta** — Track the net delta of the combined position
3. **Hedge with Stock** — When delta drifts beyond threshold, buy/sell shares to neutralize
4. **Profit from Gamma** — Each hedge locks in small profits from price movement
5. **Manage Theta** — Close before time decay erodes the straddle value

### Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `symbol` | — | Underlying stock symbol |
| `hedgeThreshold` | 0.10 | Delta drift before rebalancing |
| `targetDTE` | 45 | Days to expiration for straddle |
| `maxHedgesPerDay` | 5 | Limit on daily rebalancing trades |
| `stopLoss` | -20% | Maximum loss before closing position |

### Greeks Calculation (QuantLib-inspired)

```typescript
// Simplified Black-Scholes Greeks
function calculateGreeks(
  spotPrice: number,
  strikePrice: number,
  timeToExpiry: number, // in years
  riskFreeRate: number,
  volatility: number,
  optionType: 'call' | 'put'
) {
  const d1 = (Math.log(spotPrice / strikePrice) + 
    (riskFreeRate + 0.5 * volatility ** 2) * timeToExpiry) / 
    (volatility * Math.sqrt(timeToExpiry));
  const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
  
  const delta = optionType === 'call' ? normalCDF(d1) : normalCDF(d1) - 1;
  const gamma = normalPDF(d1) / (spotPrice * volatility * Math.sqrt(timeToExpiry));
  const theta = -(spotPrice * normalPDF(d1) * volatility) / (2 * Math.sqrt(timeToExpiry));
  const vega = spotPrice * normalPDF(d1) * Math.sqrt(timeToExpiry);
  
  return { delta, gamma, theta, vega };
}
```

---

## Strategy 3: AI-Powered Trading (Lumibot)

**Source:** [Lumiwealth/lumibot](https://github.com/Lumiwealth/lumibot) (1.3K stars)

A comprehensive Python framework for backtesting and live trading with AI agent support.

### Integration Approach

Since Lumibot is Python-based, the integration uses a Python microservice that the Node.js server communicates with:

```
Stock Tracker (Node.js) ──HTTP──▶ Lumibot Service (Python)
                                      │
                                      ▼
                                 Alpaca API
```

### Key Features to Integrate

1. **Backtesting Engine** — Test strategies against historical data before going live
2. **AI Agent Trading** — Use LLM to analyze market conditions and make trading decisions
3. **Risk Management** — Built-in position sizing, stop-loss, and portfolio allocation
4. **Multi-Asset Support** — Stocks, options, crypto, and forex

### Sample Lumibot Strategy

```python
# strategies/ai_options_trader.py
from lumibot.strategies import Strategy
from lumibot.brokers import Alpaca

class AIOptionsTrader(Strategy):
    parameters = {
        "symbol": "AAPL",
        "cash_at_risk": 0.5,
        "sentiment_threshold": 0.6,
    }
    
    def initialize(self):
        self.sleeptime = "1D"
        self.last_trade = None
    
    def on_trading_iteration(self):
        symbol = self.parameters["symbol"]
        cash = self.get_cash()
        last_price = self.get_last_price(symbol)
        
        # Get AI sentiment from our stock tracker
        sentiment = self.get_sentiment(symbol)
        
        if sentiment > self.parameters["sentiment_threshold"]:
            # Bullish: sell puts (wheel entry)
            self.sell_put(symbol, last_price * 0.95, days_out=30)
        elif sentiment < -self.parameters["sentiment_threshold"]:
            # Bearish: buy protective puts
            self.buy_put(symbol, last_price * 0.95, days_out=30)
```

---

## Dashboard Integration Plan

### Phase 1: Options Chain Viewer (Read-Only)
- Display available options contracts for any symbol
- Show Greeks (delta, gamma, theta, vega) for each contract
- Visualize the options chain with strike prices and premiums

### Phase 2: Paper Trading
- Connect to Alpaca paper trading account
- Execute wheel strategy on selected positions
- Track options P&L alongside stock positions

### Phase 3: Live Trading
- Switch from paper to live Alpaca account
- Add risk management controls and position limits
- Implement automated strategy execution with manual override

### Phase 4: AI-Enhanced Trading
- Use multi-agent analysis to inform trading decisions
- Backtest strategies using historical data
- Generate daily trade recommendations

---

## Environment Variables Required

| Variable | Description |
|----------|-------------|
| `ALPACA_API_KEY` | Alpaca API Key ID |
| `ALPACA_SECRET_KEY` | Alpaca Secret Key |
| `ALPACA_PAPER` | `true` for paper trading, `false` for live |
| `ALPACA_BASE_URL` | `https://paper-api.alpaca.markets` (paper) or `https://api.alpaca.markets` (live) |

---

## References

- [Alpaca Options Trading API Docs](https://docs.alpaca.markets/docs/options-trading)
- [alpacahq/options-wheel](https://github.com/alpacahq/options-wheel) — Wheel strategy implementation
- [alpacahq/gamma-scalping](https://github.com/alpacahq/gamma-scalping) — Gamma scalping with QuantLib
- [Lumiwealth/lumibot](https://github.com/Lumiwealth/lumibot) — Full trading framework with AI agents
