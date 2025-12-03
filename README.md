# Telegram Trading Signal Bot

A production-quality algorithmic trading signal bot for Telegram with 35+ technical indicators, candlestick pattern analysis, and real-time chart rendering.

## Features

- **Real-time Market Data**: Connects to Deriv WebSocket for live price feeds
- **35+ Technical Indicators**: EMA, SMA, MACD, RSI, Stochastic, ATR, ADX, CCI, Bollinger Bands, SuperTrend, and more
- **Candlestick Psychology**: Detects engulfing patterns, hammers, shooting stars, doji, wick rejections, order blocks, and FVG
- **Pre-close Signals**: Sends predictions 3-4 seconds before candle close
- **Chart Rendering**: Server-side PNG generation with Puppeteer + lightweight-charts
- **Button-driven UX**: Full inline keyboard navigation in Telegram
- **Session Management**: Concurrent multi-user sessions
- **Signal Persistence**: SQLite database for backtesting

## Quick Start

### 1. Get a Telegram Bot Token

1. Open Telegram and search for @BotFather
2. Send `/newbot` and follow the prompts
3. Copy the bot token

### 2. Set Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and add your Telegram bot token:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Server

```bash
npm run dev
```

The server will start on port 5000. The Telegram bot will automatically begin polling.

## Using the Bot

1. Open your bot in Telegram
2. Send `/start`
3. Tap **Begin Trading Session**
4. Select an asset (EUR/USD, GBP/USD, Synthetic Indices, etc.)
5. Choose a timeframe (1m, 2m, 5m, 15m, 30m, 1h)
6. Tap **Start Session**

The bot will now send you signals 3-4 seconds before each candle closes.

### Bot Commands

- `/start` - Start a new trading session
- `/stop` - Stop the current session
- `/status` - View current session status
- `/help` - Show help message

## API Endpoints

### GET /api/assets
Returns list of available trading assets.

### GET /api/status
Returns system status (Deriv connection, active sessions, render service).

### POST /api/startSession
Start a new trading session.
```json
{
  "session_id": "unique_id",
  "chat_id": 123456789,
  "asset": "frxEURUSD",
  "timeframe": 60
}
```

### POST /api/stopSession
Stop an active session.
```json
{
  "session_id": "unique_id"
}
```

### GET /api/signal?pair=frxEURUSD&tf=60
Get debug signal for a pair and timeframe.

### POST /api/render-chart
Render a chart image. Returns PNG.

### GET /api/candles?symbol=frxEURUSD&timeframe=60&count=100
Fetch historical candles.

## Configuration

### Indicator Weights

Edit `server/config/indicators.ts` to customize indicator weights:

```typescript
export const DEFAULT_INDICATOR_WEIGHTS: IndicatorWeight[] = [
  { name: "ema_cross_5_21", weight: 1.2, enabled: true },
  { name: "macd_signal", weight: 1.4, enabled: true },
  { name: "engulfing_pattern", weight: 1.5, enabled: true },
  // ... more indicators
];
```

### Signal Thresholds

```typescript
export const SIGNAL_CONFIG = {
  minConfidence: 60,      // Minimum confidence for CALL/PUT
  preCloseSeconds: 4,     // Pre-close window start
  sendSignalSeconds: 3,   // When to send signal
  historyCandles: 300,    // Historical candles to fetch
  chartCandles: 100,      // Candles to show on chart
};
```

### Volatility Thresholds

```typescript
export const VOLATILITY_CONFIG = {
  atrThreshold: 0.005,           // 0.5% ATR threshold
  tickVolatilityThreshold: 0.003, // 0.3% tick volatility
  minCandlesForSignal: 50,        // Minimum candles required
};
```

## Supported Assets

### Forex
- EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/INR
- USD/CAD, EUR/GBP, EUR/JPY

### Synthetic Indices
- Volatility 10, 25, 50, 75, 100 Index
- Volatility 10 (1s), 25 (1s), 50 (1s), 75 (1s), 100 (1s) Index

### Crypto
- Bitcoin/USD, Ethereum/USD

## Architecture

```
/server
  /config
    assets.ts          # Supported assets
    indicators.ts      # Indicator configuration
  /services
    derivFeed.ts       # Deriv WebSocket connection
    candleAggregator.ts # Tick-to-candle conversion
    indicatorEngine.ts # 35+ indicator calculations
    psychologyEngine.ts # Candlestick pattern detection
    predictionEngine.ts # Forming candle estimation
    signalEngine.ts    # Weighted scoring & decisions
    renderService.ts   # Puppeteer chart rendering
    sessionManager.ts  # Multi-user session handling
  /telegram
    bot.ts             # Telegram bot entry point
    handlers.ts        # Callback query handlers
    keyboards.ts       # Inline keyboard builders
  /utils
    logger.ts          # Logging utilities
    time.ts            # Timestamp helpers
  routes.ts            # API endpoints
  storage.ts           # SQLite persistence
  index.ts             # Server entry point
```

## Signal Logic

### Indicator Voting
Each indicator produces a vote: UP, DOWN, or NEUTRAL with a configurable weight.

### Scoring
```
finalUp = sum(bullish weights)
finalDown = sum(bearish weights)
pUp = finalUp / (finalUp + finalDown)
confidence = max(pUp, 1-pUp) * 100
```

### Decision
- confidence < 60% → NO_TRADE
- pUp > 0.5 → CALL
- pUp ≤ 0.5 → PUT

### Volatility Override
If ATR/price > 0.5% or sudden tick spike → NO_TRADE with reason.

## Backtesting

Signals are stored in `./data/signals.db` (SQLite). Export to CSV:

```typescript
const storage = new SQLiteStorage("./data/signals.db");
const csv = storage.exportSignalsToCSV();
fs.writeFileSync("signals.csv", csv);
```

## Scaling

### Redis Integration (Future)
For horizontal scaling, configure Redis:
```
REDIS_URL=redis://localhost:6379
```

### Worker Queue
Use Bull queue for chart rendering:
```typescript
const renderQueue = new Bull("render", process.env.REDIS_URL);
```

## Troubleshooting

### Bot not responding
- Check TELEGRAM_BOT_TOKEN is set correctly
- Verify bot is not blocked or deleted
- Check server logs for polling errors

### No signals being sent
- Ensure session is active
- Check Deriv WebSocket connection
- Verify sufficient historical data (50+ candles)

### Chart rendering fails
- Puppeteer requires Chromium - may need system dependencies
- Check available memory
- Signals will be sent as text-only if rendering fails

## License

MIT
