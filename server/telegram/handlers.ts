import TelegramBot from "node-telegram-bot-api";
import { sessionManager } from "../services/sessionManager";
import { SUPPORTED_ASSETS, getAssetById, getTimeframeLabel } from "../config/assets";
import { storage, initStorage, SQLiteStorage } from "../storage";
import { createLogger } from "../utils/logger";
import { formatTimestamp, formatDuration, nowEpoch } from "../utils/time";
import type { SignalResult, Session } from "@shared/schema";
import {
  createStartKeyboard,
  createAssetKeyboard,
  createTimeframeKeyboard,
  createConfirmSessionKeyboard,
  createSessionControlKeyboard,
  createSignalActionKeyboard,
  createStoppedSessionKeyboard,
} from "./keyboards";

const logger = createLogger("TelegramHandlers");

interface UserState {
  selectedAsset?: string;
  selectedTimeframe?: number;
  activeSessionId?: string;
}

const userStates: Map<number, UserState> = new Map();
let renderService: { renderChart: (data: unknown) => Promise<Buffer> } | null = null;
let sqliteStorage: SQLiteStorage | null = null;

export function setRenderService(service: { renderChart: (data: unknown) => Promise<Buffer> }): void {
  renderService = service;
}

export function setSQLiteStorage(storage: SQLiteStorage): void {
  sqliteStorage = storage;
}

function getUserState(chatId: number): UserState {
  if (!userStates.has(chatId)) {
    userStates.set(chatId, {});
  }
  return userStates.get(chatId)!;
}

export async function handleStart(bot: TelegramBot, msg: TelegramBot.Message): Promise<void> {
  const chatId = msg.chat.id;
  
  const existingSession = sessionManager.getSessionByChatId(chatId);
  if (existingSession) {
    const asset = getAssetById(existingSession.symbol);
    const tfLabel = getTimeframeLabel(existingSession.timeframe);
    
    await bot.sendMessage(
      chatId,
      `You have an active session:\n*${asset?.name || existingSession.symbol}* - ${tfLabel}\n\nWould you like to continue or start a new session?`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "View Session", callback_data: `view:${existingSession.id}` },
              { text: "Stop Session", callback_data: `stop:${existingSession.id}` }
            ],
            [{ text: "Start New Session", callback_data: "begin" }]
          ]
        }
      }
    );
    return;
  }
  
  await bot.sendMessage(
    chatId,
    "Welcome to the *Trading Signal Bot*\n\nReceive algorithmic trading signals with 35+ technical indicators and candlestick pattern analysis.\n\nTap the button below to begin:",
    {
      parse_mode: "Markdown",
      reply_markup: createStartKeyboard()
    }
  );
}

export async function handleCallback(bot: TelegramBot, query: TelegramBot.CallbackQuery): Promise<void> {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const data = query.data;
  
  if (!chatId || !messageId || !data) {
    await bot.answerCallbackQuery(query.id);
    return;
  }
  
  const state = getUserState(chatId);
  
  try {
    if (data === "begin") {
      await handleBegin(bot, chatId, messageId);
    } else if (data.startsWith("asset:")) {
      const assetId = data.replace("asset:", "");
      await handleAssetSelection(bot, chatId, messageId, assetId, state);
    } else if (data.startsWith("timeframe:")) {
      const [, assetId, tf] = data.split(":");
      await handleTimeframeSelection(bot, chatId, messageId, assetId, parseInt(tf), state);
    } else if (data.startsWith("start_session:")) {
      const [, assetId, tf] = data.split(":");
      await handleStartSession(bot, chatId, messageId, assetId, parseInt(tf), state, query.id);
    } else if (data.startsWith("stop:")) {
      const sessionId = data.replace("stop:", "");
      await handleStopSession(bot, chatId, messageId, sessionId, state);
    } else if (data.startsWith("view:")) {
      const sessionId = data.replace("view:", "");
      await handleViewSession(bot, chatId, sessionId);
    } else if (data.startsWith("rerun:")) {
      const sessionId = data.replace("rerun:", "");
      await handleRerunSignal(bot, chatId, sessionId);
    } else if (data === "cancel") {
      await handleCancel(bot, chatId, messageId, state);
    } else if (data.startsWith("header_")) {
    }
    
    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    logger.error("Error handling callback", error);
    await bot.answerCallbackQuery(query.id, { text: "An error occurred" });
  }
}

async function handleBegin(bot: TelegramBot, chatId: number, messageId: number): Promise<void> {
  await bot.editMessageText(
    "Select a trading pair:",
    {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: createAssetKeyboard(SUPPORTED_ASSETS)
    }
  );
}

async function handleAssetSelection(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  assetId: string,
  state: UserState
): Promise<void> {
  const asset = getAssetById(assetId);
  if (!asset) {
    await bot.editMessageText("Asset not found. Please try again.", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: createAssetKeyboard(SUPPORTED_ASSETS)
    });
    return;
  }
  
  state.selectedAsset = assetId;
  
  await bot.editMessageText(
    `Selected: *${asset.name}*\n\nChoose a timeframe:`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: createTimeframeKeyboard(assetId)
    }
  );
}

async function handleTimeframeSelection(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  assetId: string,
  timeframe: number,
  state: UserState
): Promise<void> {
  const asset = getAssetById(assetId);
  if (!asset) return;
  
  state.selectedAsset = assetId;
  state.selectedTimeframe = timeframe;
  
  const tfLabel = getTimeframeLabel(timeframe);
  
  await bot.editMessageText(
    `*Ready to start trading session*\n\nPair: *${asset.name}*\nTimeframe: *${tfLabel}*\n\nSignals will be sent ${3}-${4} seconds before each candle closes.`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: createConfirmSessionKeyboard(assetId, timeframe)
    }
  );
}

async function handleStartSession(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  assetId: string,
  timeframe: number,
  state: UserState,
  queryId: string
): Promise<void> {
  const asset = getAssetById(assetId);
  if (!asset) return;
  
  const existingSession = sessionManager.getSessionByChatId(chatId);
  if (existingSession) {
    await sessionManager.stopSession(existingSession.id);
  }
  
  const sessionId = `${chatId}_${Date.now()}`;
  
  try {
    const session = await sessionManager.startSession(
      sessionId,
      chatId,
      assetId,
      timeframe
    );
    
    state.activeSessionId = sessionId;
    
    const tfLabel = getTimeframeLabel(timeframe);
    
    await bot.editMessageText(
      `*Session Started*\n\nPair: *${asset.name}*\nTimeframe: *${tfLabel}*\nStatus: Active\n\nYou will receive signals before each candle closes. Use the buttons below to control your session.`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: createSessionControlKeyboard(sessionId)
      }
    );
    
    if (sqliteStorage) {
      await sqliteStorage.saveSession(session);
    }
    
    logger.info(`Session started: ${sessionId} for chat ${chatId}`);
  } catch (error) {
    logger.error("Failed to start session", error);
    await bot.answerCallbackQuery(queryId, { 
      text: "Failed to start session. Please try again.",
      show_alert: true
    });
  }
}

async function handleStopSession(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  sessionId: string,
  state: UserState
): Promise<void> {
  const session = sessionManager.getSession(sessionId);
  
  await sessionManager.stopSession(sessionId);
  
  if (state.activeSessionId === sessionId) {
    state.activeSessionId = undefined;
  }
  
  if (sqliteStorage) {
    await sqliteStorage.updateSessionStatus(sessionId, "stopped");
  }
  
  const asset = session ? getAssetById(session.symbol) : null;
  const tfLabel = session ? getTimeframeLabel(session.timeframe) : "";
  
  await bot.editMessageText(
    `*Session Stopped*\n\nPair: ${asset?.name || "Unknown"}\nTimeframe: ${tfLabel}\n\nYou can start a new session anytime.`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: createStoppedSessionKeyboard()
    }
  );
}

async function handleViewSession(
  bot: TelegramBot,
  chatId: number,
  sessionId: string
): Promise<void> {
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    await bot.sendMessage(chatId, "Session not found or has expired.");
    return;
  }
  
  const asset = getAssetById(session.symbol);
  const tfLabel = getTimeframeLabel(session.timeframe);
  const duration = formatDuration(nowEpoch() - session.startedAt);
  const { closed, forming } = sessionManager.getSessionCandles(sessionId);
  
  let statusText = `*Session Status*\n\n`;
  statusText += `Pair: *${asset?.name || session.symbol}*\n`;
  statusText += `Timeframe: *${tfLabel}*\n`;
  statusText += `Status: *${session.status === "active" ? "Active" : "Stopped"}*\n`;
  statusText += `Duration: ${duration}\n`;
  statusText += `Candles collected: ${closed.length}\n`;
  
  if (forming) {
    statusText += `\nCurrent candle:\n`;
    statusText += `O: ${forming.open.toFixed(5)} H: ${forming.high.toFixed(5)}\n`;
    statusText += `L: ${forming.low.toFixed(5)} C: ${forming.close.toFixed(5)}`;
  }
  
  if (session.lastSignalAt) {
    statusText += `\n\nLast signal: ${formatTimestamp(session.lastSignalAt)}`;
  }
  
  await bot.sendMessage(chatId, statusText, {
    parse_mode: "Markdown",
    reply_markup: createSessionControlKeyboard(sessionId)
  });
}

async function handleRerunSignal(
  bot: TelegramBot,
  chatId: number,
  sessionId: string
): Promise<void> {
  const session = sessionManager.getSession(sessionId);
  
  if (!session || session.status !== "active") {
    await bot.sendMessage(chatId, "Session is not active.");
    return;
  }
  
  const signal = sessionManager.getDebugSignal(session.symbol, session.timeframe);
  
  if (!signal) {
    await bot.sendMessage(chatId, "Not enough data for signal generation yet.");
    return;
  }
  
  await sendSignalToChat(bot, chatId, session, signal);
}

async function handleCancel(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  state: UserState
): Promise<void> {
  state.selectedAsset = undefined;
  state.selectedTimeframe = undefined;
  
  await bot.editMessageText(
    "Operation cancelled. Tap /start to begin again.",
    {
      chat_id: chatId,
      message_id: messageId
    }
  );
}

export async function sendSignalToChat(
  bot: TelegramBot,
  chatId: number,
  session: Session,
  signal: SignalResult
): Promise<void> {
  const asset = getAssetById(signal.symbol);
  const tfLabel = getTimeframeLabel(signal.timeframe);
  
  let directionEmoji = "";
  let directionText = "";
  
  switch (signal.direction) {
    case "CALL":
      directionEmoji = "";
      directionText = "CALL (UP)";
      break;
    case "PUT":
      directionEmoji = "";
      directionText = "PUT (DOWN)";
      break;
    case "NO_TRADE":
      directionEmoji = "";
      directionText = "NO TRADE";
      break;
  }
  
  let caption = `${directionEmoji} *${directionText}*\n\n`;
  caption += `Pair: *${asset?.name || signal.symbol}*\n`;
  caption += `Timeframe: *${tfLabel}*\n`;
  caption += `Confidence: *${signal.confidence}%*\n`;
  caption += `Time: ${formatTimestamp(signal.timestamp)}\n`;
  
  if (signal.volatilityOverride && signal.volatilityReason) {
    caption += `\nVolatility Alert: ${signal.volatilityReason}\n`;
  }
  
  const topVotes = signal.votes
    .filter(v => v.direction !== "NEUTRAL")
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);
  
  if (topVotes.length > 0) {
    caption += `\n*Key Signals:*\n`;
    for (const vote of topVotes) {
      const arrow = vote.direction === "UP" ? "+" : "-";
      caption += `${arrow} ${vote.indicator.replace(/_/g, " ")}\n`;
    }
  }
  
  if (signal.psychology.patterns.length > 0) {
    const patterns = signal.psychology.patterns.slice(0, 3);
    caption += `\n*Patterns:* ${patterns.map(p => p.name).join(", ")}\n`;
  }
  
  if (sqliteStorage) {
    await sqliteStorage.saveSignal(signal);
  }
  
  if (renderService) {
    try {
      const { closed, forming } = sessionManager.getSessionCandles(session.id);
      const chartCandles = closed.slice(-100);
      
      const chartBuffer = await renderService.renderChart({
        candles: chartCandles,
        formingCandle: forming,
        indicators: signal.indicators,
        signal,
        overlays: ["ema21", "ema50", "sma20", "bollingerBands"],
      });
      
      await bot.sendPhoto(chatId, chartBuffer, {
        caption,
        parse_mode: "Markdown",
        reply_markup: createSignalActionKeyboard(session.id)
      });
      
      return;
    } catch (error) {
      logger.error("Failed to render chart", error);
    }
  }
  
  await bot.sendMessage(chatId, caption, {
    parse_mode: "Markdown",
    reply_markup: createSignalActionKeyboard(session.id)
  });
}
