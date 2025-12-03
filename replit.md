# Telegram Trading Signal Bot

## Overview
A production-quality algorithmic trading signal bot for Telegram that provides real-time trading signals using 35+ technical indicators and candlestick pattern analysis. Connects to Deriv WebSocket for live market data.

## Project Architecture

```
/server
  /config
    assets.ts          # Supported trading assets (forex, synthetic, crypto)
    indicators.ts      # Indicator weights and configuration
  /services
    derivFeed.ts       # Deriv WebSocket connection with auto-reconnect
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
/client
  /src/pages
    home.tsx           # Minimal status page
/data
  signals.db           # SQLite database (auto-created)
```

## Key Features

### Technical Indicators (35+)
- Moving Averages: EMA5, EMA9, EMA12, EMA21, EMA50, SMA20, SMA50, SMA200
- Momentum: MACD, RSI(14), Stochastic, ROC, Momentum
- Volatility: ATR(14), Bollinger Bands, Keltner Channels, SuperTrend
- Trend: ADX, CCI, Williams %R, Hull MA, PSAR
- Advanced: Mean Reversion Z-score, Fisher Transform, Ultimate Oscillator

### Candlestick Psychology
- Engulfing patterns (bullish/bearish)
- Hammer and Shooting Star
- Doji detection
- Wick rejection analysis
- Order block probability
- Fair Value Gap (FVG) detection

### Signal Generation
- Pre-close signals: 3-4 seconds before candle close
- Weighted voting system
- Confidence percentage calculation
- Volatility override for unstable markets

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/assets` | GET | List available trading assets |
| `/api/timeframes` | GET | List available timeframes |
| `/api/status` | GET | System status (connection, sessions) |
| `/api/signal?pair=X&tf=Y` | GET | Debug signal for pair/timeframe |
| `/api/startSession` | POST | Start a trading session |
| `/api/stopSession` | POST | Stop a trading session |
| `/api/session/:id` | GET | Get session details |
| `/api/sessions` | GET | List all sessions |
| `/api/candles` | GET | Fetch historical candles |
| `/api/render-chart` | POST | Render chart PNG |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
| `PORT` | No | Server port (default: 5000) |

## Running the Project

1. Set `TELEGRAM_BOT_TOKEN` in environment secrets
2. The server starts automatically with `npm run dev`
3. Open Telegram and send `/start` to your bot

## Telegram Commands

- `/start` - Start new trading session
- `/stop` - Stop current session
- `/status` - View session status
- `/help` - Show help message

## Telegram Flow
1. /start → [Begin] button
2. Select asset (EUR/USD, Volatility indices, etc.)
3. Select timeframe (1m, 2m, 5m, 15m, 30m, 1h)
4. [Start Session] → Receive signals

## Technical Stack
- Backend: Express.js + TypeScript
- Telegram: node-telegram-bot-api
- Market Data: Deriv WebSocket API
- Chart Rendering: Puppeteer + lightweight-charts
- Persistence: SQLite (better-sqlite3)
- Indicators: technicalindicators library

## Recent Changes
- Initial implementation of complete signal bot system
- 35+ technical indicators with configurable weights
- Candlestick psychology module with pattern detection
- Puppeteer chart rendering with dark theme
- SQLite persistence for backtesting
- Button-driven Telegram UX

## Configuration

### Indicator Weights (server/config/indicators.ts)
Adjust weights to prioritize certain indicators in signal generation.

### Volatility Thresholds
- ATR threshold: 0.5% of price
- Minimum candles required: 50

### Signal Thresholds
- Minimum confidence: 60%
- Pre-close window: 4 seconds
