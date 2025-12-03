import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export interface Tick {
  symbol: string;
  price: number;
  timestamp: number;
  epoch: number;
}

export interface Candle {
  symbol: string;
  timeframe: number;
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
  tickCount: number;
  isForming: boolean;
}

export interface IndicatorValues {
  ema5?: number;
  ema9?: number;
  ema12?: number;
  ema21?: number;
  ema50?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  macd?: { macd: number; signal: number; histogram: number };
  rsi14?: number;
  stochastic?: { k: number; d: number };
  atr14?: number;
  adx?: number;
  cci?: number;
  williamsR?: number;
  bollingerBands?: { upper: number; middle: number; lower: number };
  keltnerChannels?: { upper: number; middle: number; lower: number };
  hullMA?: number;
  superTrend?: { value: number; direction: 'up' | 'down' };
  roc?: number;
  momentum?: number;
  vwap?: number;
  obv?: number;
  chaikinOsc?: number;
  fisherTransform?: number;
  donchianChannels?: { upper: number; lower: number };
  psar?: number;
  ultimateOsc?: number;
  meanReversionZ?: number;
  linRegSlope?: number;
  atrBands?: { upper: number; lower: number };
  rangePercentile?: number;
  emaRibbon?: number;
}

export interface CandlestickPattern {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  description: string;
}

export interface PsychologyAnalysis {
  bodyRatio: number;
  upperWickRatio: number;
  lowerWickRatio: number;
  isDoji: boolean;
  patterns: CandlestickPattern[];
  bias: 'bullish' | 'bearish' | 'neutral';
  orderBlockProbability: number;
  fvgDetected: boolean;
}

export interface Vote {
  indicator: string;
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  weight: number;
  reason?: string;
}

export interface SignalResult {
  sessionId: string;
  symbol: string;
  timeframe: number;
  timestamp: number;
  candleCloseTime: number;
  direction: 'CALL' | 'PUT' | 'NO_TRADE';
  confidence: number;
  pUp: number;
  pDown: number;
  votes: Vote[];
  indicators: IndicatorValues;
  psychology: PsychologyAnalysis;
  volatilityOverride: boolean;
  volatilityReason?: string;
  closedCandlesCount: number;
  formingCandle?: Candle;
}

export interface Session {
  id: string;
  chatId: number;
  symbol: string;
  timeframe: number;
  status: 'active' | 'stopped';
  startedAt: number;
  lastSignalAt?: number;
  options?: SessionOptions;
}

export interface SessionOptions {
  enabledIndicators?: string[];
  customWeights?: Record<string, number>;
  volatilityThreshold?: number;
}

export interface ChartRenderRequest {
  candles: Candle[];
  formingCandle?: Candle;
  indicators?: IndicatorValues;
  signal?: SignalResult;
  overlays?: string[];
  annotations?: ChartAnnotation[];
}

export interface ChartAnnotation {
  type: 'signal' | 'countdown' | 'label';
  position: 'top' | 'bottom';
  text: string;
  color?: string;
}

export interface Asset {
  id: string;
  name: string;
  category?: string;
}

export const signalLogs = pgTable("signal_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull(),
  symbol: text("symbol").notNull(),
  timeframe: integer("timeframe").notNull(),
  timestamp: integer("timestamp").notNull(),
  candleCloseTime: integer("candle_close_time").notNull(),
  direction: text("direction").notNull(),
  confidence: real("confidence").notNull(),
  pUp: real("p_up").notNull(),
  pDown: real("p_down").notNull(),
  votes: jsonb("votes").notNull(),
  indicators: jsonb("indicators").notNull(),
  psychology: jsonb("psychology").notNull(),
  volatilityOverride: integer("volatility_override").notNull(),
  volatilityReason: text("volatility_reason"),
  closedCandlesCount: integer("closed_candles_count").notNull(),
});

export const candleLogs = pgTable("candle_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  timeframe: integer("timeframe").notNull(),
  open: real("open").notNull(),
  high: real("high").notNull(),
  low: real("low").notNull(),
  close: real("close").notNull(),
  timestamp: integer("timestamp").notNull(),
  tickCount: integer("tick_count").notNull(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey(),
  chatId: integer("chat_id").notNull(),
  symbol: text("symbol").notNull(),
  timeframe: integer("timeframe").notNull(),
  status: text("status").notNull(),
  startedAt: integer("started_at").notNull(),
  lastSignalAt: integer("last_signal_at"),
  options: jsonb("options"),
});

export const insertSignalLogSchema = createInsertSchema(signalLogs).omit({ id: true });
export const insertCandleLogSchema = createInsertSchema(candleLogs).omit({ id: true });
export const insertSessionSchema = createInsertSchema(sessions);

export type InsertSignalLog = z.infer<typeof insertSignalLogSchema>;
export type InsertCandleLog = z.infer<typeof insertCandleLogSchema>;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type SignalLog = typeof signalLogs.$inferSelect;
export type CandleLog = typeof candleLogs.$inferSelect;
export type SessionRecord = typeof sessions.$inferSelect;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
