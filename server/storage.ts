import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type { 
  User, 
  InsertUser, 
  SignalResult, 
  Session,
  Candle 
} from "@shared/schema";
import { createLogger } from "./utils/logger";

const logger = createLogger("Storage");

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  saveSignal(signal: SignalResult): Promise<void>;
  getSignals(sessionId: string, limit?: number): Promise<SignalResult[]>;
  getRecentSignals(limit?: number): Promise<SignalResult[]>;
  
  saveCandle(candle: Candle): Promise<void>;
  getCandles(symbol: string, timeframe: number, limit?: number): Promise<Candle[]>;
  
  saveSession(session: Session): Promise<void>;
  getSession(sessionId: string): Promise<Session | undefined>;
  updateSessionStatus(sessionId: string, status: string): Promise<void>;
  getActiveSessions(): Promise<Session[]>;
}

export class SQLiteStorage implements IStorage {
  private db: Database.Database;

  constructor(dbPath: string = "./data/signals.db") {
    this.db = new Database(dbPath);
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS signal_logs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        timeframe INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        candle_close_time INTEGER NOT NULL,
        direction TEXT NOT NULL,
        confidence REAL NOT NULL,
        p_up REAL NOT NULL,
        p_down REAL NOT NULL,
        votes TEXT NOT NULL,
        indicators TEXT NOT NULL,
        psychology TEXT NOT NULL,
        volatility_override INTEGER NOT NULL,
        volatility_reason TEXT,
        closed_candles_count INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS candle_logs (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        timeframe INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        tick_count INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        chat_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        timeframe INTEGER NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        last_signal_at INTEGER,
        options TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_signals_session ON signal_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signal_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_candles_symbol_tf ON candle_logs(symbol, timeframe);
      CREATE INDEX IF NOT EXISTS idx_sessions_chat ON sessions(chat_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    `);
    
    logger.info("Database tables initialized");
  }

  async getUser(id: string): Promise<User | undefined> {
    const stmt = this.db.prepare("SELECT * FROM users WHERE id = ?");
    return stmt.get(id) as User | undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const stmt = this.db.prepare("SELECT * FROM users WHERE username = ?");
    return stmt.get(username) as User | undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    const stmt = this.db.prepare(
      "INSERT INTO users (id, username, password) VALUES (?, ?, ?)"
    );
    stmt.run(id, user.username, user.password);
    return user;
  }

  async saveSignal(signal: SignalResult): Promise<void> {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO signal_logs (
        id, session_id, symbol, timeframe, timestamp, candle_close_time,
        direction, confidence, p_up, p_down, votes, indicators, psychology,
        volatility_override, volatility_reason, closed_candles_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      signal.sessionId,
      signal.symbol,
      signal.timeframe,
      signal.timestamp,
      signal.candleCloseTime,
      signal.direction,
      signal.confidence,
      signal.pUp,
      signal.pDown,
      JSON.stringify(signal.votes),
      JSON.stringify(signal.indicators),
      JSON.stringify(signal.psychology),
      signal.volatilityOverride ? 1 : 0,
      signal.volatilityReason || null,
      signal.closedCandlesCount
    );
    
    logger.debug(`Signal saved: ${signal.symbol} ${signal.direction}`);
  }

  async getSignals(sessionId: string, limit: number = 100): Promise<SignalResult[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM signal_logs 
      WHERE session_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    const rows = stmt.all(sessionId, limit) as Array<Record<string, unknown>>;
    return rows.map(this.rowToSignal);
  }

  async getRecentSignals(limit: number = 50): Promise<SignalResult[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM signal_logs 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    const rows = stmt.all(limit) as Array<Record<string, unknown>>;
    return rows.map(this.rowToSignal);
  }

  private rowToSignal(row: Record<string, unknown>): SignalResult {
    return {
      sessionId: row.session_id as string,
      symbol: row.symbol as string,
      timeframe: row.timeframe as number,
      timestamp: row.timestamp as number,
      candleCloseTime: row.candle_close_time as number,
      direction: row.direction as "CALL" | "PUT" | "NO_TRADE",
      confidence: row.confidence as number,
      pUp: row.p_up as number,
      pDown: row.p_down as number,
      votes: JSON.parse(row.votes as string),
      indicators: JSON.parse(row.indicators as string),
      psychology: JSON.parse(row.psychology as string),
      volatilityOverride: row.volatility_override === 1,
      volatilityReason: row.volatility_reason as string | undefined,
      closedCandlesCount: row.closed_candles_count as number,
    };
  }

  async saveCandle(candle: Candle): Promise<void> {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO candle_logs (
        id, symbol, timeframe, open, high, low, close, timestamp, tick_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      candle.symbol,
      candle.timeframe,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.timestamp,
      candle.tickCount
    );
  }

  async getCandles(symbol: string, timeframe: number, limit: number = 500): Promise<Candle[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM candle_logs 
      WHERE symbol = ? AND timeframe = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    const rows = stmt.all(symbol, timeframe, limit) as Array<Record<string, unknown>>;
    return rows.map(row => ({
      symbol: row.symbol as string,
      timeframe: row.timeframe as number,
      open: row.open as number,
      high: row.high as number,
      low: row.low as number,
      close: row.close as number,
      timestamp: row.timestamp as number,
      tickCount: row.tick_count as number,
      isForming: false,
    })).reverse();
  }

  async saveSession(session: Session): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (
        id, chat_id, symbol, timeframe, status, started_at, last_signal_at, options
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      session.id,
      session.chatId,
      session.symbol,
      session.timeframe,
      session.status,
      session.startedAt,
      session.lastSignalAt || null,
      session.options ? JSON.stringify(session.options) : null
    );
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    const stmt = this.db.prepare("SELECT * FROM sessions WHERE id = ?");
    const row = stmt.get(sessionId) as Record<string, unknown> | undefined;
    
    if (!row) return undefined;
    
    return {
      id: row.id as string,
      chatId: row.chat_id as number,
      symbol: row.symbol as string,
      timeframe: row.timeframe as number,
      status: row.status as "active" | "stopped",
      startedAt: row.started_at as number,
      lastSignalAt: row.last_signal_at as number | undefined,
      options: row.options ? JSON.parse(row.options as string) : undefined,
    };
  }

  async updateSessionStatus(sessionId: string, status: string): Promise<void> {
    const stmt = this.db.prepare("UPDATE sessions SET status = ? WHERE id = ?");
    stmt.run(status, sessionId);
  }

  async getActiveSessions(): Promise<Session[]> {
    const stmt = this.db.prepare("SELECT * FROM sessions WHERE status = 'active'");
    const rows = stmt.all() as Array<Record<string, unknown>>;
    
    return rows.map(row => ({
      id: row.id as string,
      chatId: row.chat_id as number,
      symbol: row.symbol as string,
      timeframe: row.timeframe as number,
      status: row.status as "active" | "stopped",
      startedAt: row.started_at as number,
      lastSignalAt: row.last_signal_at as number | undefined,
      options: row.options ? JSON.parse(row.options as string) : undefined,
    }));
  }

  exportSignalsToCSV(): string {
    const stmt = this.db.prepare(`
      SELECT * FROM signal_logs ORDER BY timestamp DESC
    `);
    const rows = stmt.all() as Array<Record<string, unknown>>;
    
    if (rows.length === 0) return "";
    
    const headers = [
      "timestamp", "session_id", "symbol", "timeframe", "direction",
      "confidence", "p_up", "p_down", "volatility_override", "volatility_reason"
    ];
    
    const csvRows = rows.map(row => [
      new Date((row.timestamp as number) * 1000).toISOString(),
      row.session_id,
      row.symbol,
      row.timeframe,
      row.direction,
      row.confidence,
      row.p_up,
      row.p_down,
      row.volatility_override,
      row.volatility_reason || ""
    ].join(","));
    
    return [headers.join(","), ...csvRows].join("\n");
  }

  close(): void {
    this.db.close();
  }
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private signals: SignalResult[] = [];
  private candles: Map<string, Candle[]> = new Map();
  private sessions: Map<string, Session> = new Map();

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async saveSignal(signal: SignalResult): Promise<void> {
    this.signals.push(signal);
    if (this.signals.length > 10000) {
      this.signals = this.signals.slice(-5000);
    }
  }

  async getSignals(sessionId: string, limit: number = 100): Promise<SignalResult[]> {
    return this.signals
      .filter(s => s.sessionId === sessionId)
      .slice(-limit)
      .reverse();
  }

  async getRecentSignals(limit: number = 50): Promise<SignalResult[]> {
    return this.signals.slice(-limit).reverse();
  }

  async saveCandle(candle: Candle): Promise<void> {
    const key = `${candle.symbol}:${candle.timeframe}`;
    if (!this.candles.has(key)) {
      this.candles.set(key, []);
    }
    const arr = this.candles.get(key)!;
    arr.push(candle);
    if (arr.length > 1000) {
      this.candles.set(key, arr.slice(-500));
    }
  }

  async getCandles(symbol: string, timeframe: number, limit: number = 500): Promise<Candle[]> {
    const key = `${symbol}:${timeframe}`;
    const arr = this.candles.get(key) || [];
    return arr.slice(-limit);
  }

  async saveSession(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    return this.sessions.get(sessionId);
  }

  async updateSessionStatus(sessionId: string, status: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status as "active" | "stopped";
    }
  }

  async getActiveSessions(): Promise<Session[]> {
    return Array.from(this.sessions.values()).filter(s => s.status === "active");
  }
}

let storageInstance: IStorage;

export function initStorage(useSQLite: boolean = true, dbPath?: string): IStorage {
  if (useSQLite) {
    storageInstance = new SQLiteStorage(dbPath);
  } else {
    storageInstance = new MemStorage();
  }
  return storageInstance;
}

export const storage = new MemStorage();
