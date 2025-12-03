# Design Guidelines Not Applicable

## Project Scope Analysis

This project is a **pure backend + Telegram bot system** with **no web frontend interface**. The user explicitly stated: *"I do not want any dashboard or status page only tg bot"*

## Visual Components (Limited Scope)

The only visual elements in this system are:

### 1. Chart PNG Rendering (Technical Specifications)
**Already Fully Specified:**
- Size: 1200 x 675 px (Telegram-optimized)
- Theme: Dark background
- Components: Candlesticks, indicator overlays, price axis, grid lines, last price marker
- Forming candle: Muted/provisional styling
- Technical implementation via Puppeteer + lightweight-charts

### 2. Telegram Message Formatting
**Text-Based Only:**
- Signal captions using Markdown formatting
- Inline button labels (short, action-oriented)
- Status messages and confirmations
- No custom styling possible within Telegram constraints

## Recommendation

**No web design guidelines are needed for this project.** The system operates entirely through:
- Telegram bot interactions (button-driven flow)
- Server-side chart generation (specs provided)
- Backend API endpoints (no UI)

The engineer should proceed directly to implementation using the technical specifications provided in the original requirements. All visual rendering is constrained to Telegram's built-in styling and the chart PNG generation parameters already defined.