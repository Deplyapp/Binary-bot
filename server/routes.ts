import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { SUPPORTED_ASSETS, getAssetById, getTimeframeLabel, TIMEFRAMES } from "./config/assets";
import { sessionManager } from "./services/sessionManager";
import { derivFeed } from "./services/derivFeed";
import { candleAggregator } from "./services/candleAggregator";
import { generateSignal } from "./services/signalEngine";
import { renderChart, initRenderService, isRenderServiceInitialized } from "./services/renderService";
import { initStorage, SQLiteStorage } from "./storage";
import { getCandleCloseTime, nowEpoch } from "./utils/time";
import { createLogger } from "./utils/logger";
import { SIGNAL_CONFIG } from "./config/indicators";
import type { ChartRenderRequest } from "@shared/schema";

const logger = createLogger("Routes");

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/api/assets", (_req: Request, res: Response) => {
    res.json(SUPPORTED_ASSETS);
  });
  
  app.get("/api/timeframes", (_req: Request, res: Response) => {
    res.json(TIMEFRAMES);
  });
  
  app.get("/api/status", (_req: Request, res: Response) => {
    res.json({
      derivConnected: derivFeed.isConnected(),
      activeSessions: sessionManager.getActiveSessionsCount(),
      renderServiceReady: isRenderServiceInitialized(),
      uptime: process.uptime(),
    });
  });
  
  app.post("/api/startSession", async (req: Request, res: Response) => {
    try {
      const { session_id, chat_id, asset, timeframe, options } = req.body;
      
      if (!session_id || !chat_id || !asset || !timeframe) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const assetInfo = getAssetById(asset);
      if (!assetInfo) {
        return res.status(400).json({ error: "Invalid asset" });
      }
      
      const session = await sessionManager.startSession(
        session_id,
        chat_id,
        asset,
        timeframe,
        options
      );
      
      res.json({
        success: true,
        session: {
          id: session.id,
          symbol: session.symbol,
          timeframe: session.timeframe,
          status: session.status,
          startedAt: session.startedAt,
        },
      });
    } catch (error) {
      logger.error("Failed to start session", error);
      res.status(500).json({ error: "Failed to start session" });
    }
  });
  
  app.post("/api/stopSession", async (req: Request, res: Response) => {
    try {
      const { session_id } = req.body;
      
      if (!session_id) {
        return res.status(400).json({ error: "Missing session_id" });
      }
      
      await sessionManager.stopSession(session_id);
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Failed to stop session", error);
      res.status(500).json({ error: "Failed to stop session" });
    }
  });
  
  app.get("/api/session/:sessionId", (req: Request, res: Response) => {
    const session = sessionManager.getSession(req.params.sessionId);
    
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    
    const { closed, forming } = sessionManager.getSessionCandles(req.params.sessionId);
    
    res.json({
      session: {
        id: session.id,
        symbol: session.symbol,
        timeframe: session.timeframe,
        status: session.status,
        startedAt: session.startedAt,
        lastSignalAt: session.lastSignalAt,
      },
      candlesCount: closed.length,
      formingCandle: forming,
    });
  });
  
  app.get("/api/sessions", (_req: Request, res: Response) => {
    const sessions = sessionManager.getAllSessions();
    res.json(
      sessions.map((s) => ({
        id: s.id,
        symbol: s.symbol,
        timeframe: s.timeframe,
        status: s.status,
        startedAt: s.startedAt,
      }))
    );
  });
  
  app.get("/api/signal", async (req: Request, res: Response) => {
    try {
      const { pair, tf } = req.query;
      
      if (!pair || !tf) {
        return res.status(400).json({ error: "Missing pair or tf query params" });
      }
      
      const symbol = pair as string;
      const timeframe = parseInt(tf as string, 10);
      
      const assetInfo = getAssetById(symbol);
      if (!assetInfo) {
        return res.status(400).json({ error: "Invalid pair" });
      }
      
      let closedCandles = candleAggregator.getClosedCandles(symbol, timeframe);
      let formingCandle = candleAggregator.getFormingCandle(symbol, timeframe);
      
      if (closedCandles.length === 0) {
        logger.info(`Fetching history for debug signal: ${symbol}`);
        const history = await derivFeed.fetchCandleHistory(symbol, timeframe, SIGNAL_CONFIG.historyCandles);
        candleAggregator.initialize(symbol, timeframe, history);
        closedCandles = candleAggregator.getClosedCandles(symbol, timeframe);
        formingCandle = candleAggregator.getFormingCandle(symbol, timeframe);
      }
      
      if (closedCandles.length < 50) {
        return res.status(400).json({ 
          error: "Not enough candle data",
          candlesCount: closedCandles.length,
          required: 50,
        });
      }
      
      const candleCloseTime = getCandleCloseTime(
        formingCandle?.timestamp || closedCandles[closedCandles.length - 1].timestamp,
        timeframe
      );
      
      const signal = generateSignal(
        "debug",
        symbol,
        timeframe,
        closedCandles,
        formingCandle,
        candleCloseTime
      );
      
      res.json({
        signal: {
          direction: signal.direction,
          confidence: signal.confidence,
          pUp: signal.pUp,
          pDown: signal.pDown,
          timestamp: signal.timestamp,
          candleCloseTime: signal.candleCloseTime,
          volatilityOverride: signal.volatilityOverride,
          volatilityReason: signal.volatilityReason,
        },
        indicators: signal.indicators,
        psychology: signal.psychology,
        votes: signal.votes,
        meta: {
          closedCandlesCount: signal.closedCandlesCount,
          formingCandlePrice: formingCandle?.close,
          asset: assetInfo.name,
          timeframeLabel: getTimeframeLabel(timeframe),
        },
      });
    } catch (error) {
      logger.error("Failed to generate debug signal", error);
      res.status(500).json({ error: "Failed to generate signal" });
    }
  });
  
  app.post("/api/render-chart", async (req: Request, res: Response) => {
    try {
      const chartData: ChartRenderRequest = req.body;
      
      if (!chartData.candles || chartData.candles.length === 0) {
        return res.status(400).json({ error: "No candles provided" });
      }
      
      if (!isRenderServiceInitialized()) {
        await initRenderService();
      }
      
      const imageBuffer = await renderChart(chartData);
      
      res.set("Content-Type", "image/png");
      res.send(imageBuffer);
    } catch (error) {
      logger.error("Failed to render chart", error);
      res.status(500).json({ error: "Failed to render chart" });
    }
  });
  
  app.get("/api/candles", async (req: Request, res: Response) => {
    try {
      const { symbol, timeframe, count } = req.query;
      
      if (!symbol || !timeframe) {
        return res.status(400).json({ error: "Missing symbol or timeframe" });
      }
      
      const tf = parseInt(timeframe as string, 10);
      const limit = parseInt((count as string) || "100", 10);
      
      let candles = candleAggregator.getClosedCandles(symbol as string, tf);
      
      if (candles.length === 0) {
        candles = await derivFeed.fetchCandleHistory(symbol as string, tf, limit);
      }
      
      const forming = candleAggregator.getFormingCandle(symbol as string, tf);
      
      res.json({
        candles: candles.slice(-limit),
        formingCandle: forming,
      });
    } catch (error) {
      logger.error("Failed to fetch candles", error);
      res.status(500).json({ error: "Failed to fetch candles" });
    }
  });

  return httpServer;
}
