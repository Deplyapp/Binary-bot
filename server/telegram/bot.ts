import TelegramBot from "node-telegram-bot-api";
import { sessionManager } from "../services/sessionManager";
import { handleStart, handleCallback, sendSignalToChat, setRenderService, setSQLiteStorage } from "./handlers";
import { createLogger } from "../utils/logger";
import { SQLiteStorage } from "../storage";
import type { Session, SignalResult } from "@shared/schema";

const logger = createLogger("TelegramBot");

let bot: TelegramBot | null = null;
let isInitialized = false;

export function initTelegramBot(token: string): TelegramBot | null {
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not provided - bot will not be started");
    return null;
  }

  try {
    bot = new TelegramBot(token, { polling: true });
    
    bot.on("message", async (msg) => {
      if (msg.text === "/start") {
        await handleStart(bot!, msg);
      } else if (msg.text === "/stop") {
        const chatId = msg.chat.id;
        const session = sessionManager.getSessionByChatId(chatId);
        if (session) {
          await sessionManager.stopSession(session.id);
          await bot!.sendMessage(chatId, "Session stopped. Use /start to begin a new session.");
        } else {
          await bot!.sendMessage(chatId, "No active session. Use /start to begin.");
        }
      } else if (msg.text === "/status") {
        const chatId = msg.chat.id;
        const session = sessionManager.getSessionByChatId(chatId);
        if (session) {
          await bot!.sendMessage(
            chatId,
            `Active session: ${session.symbol} (${session.timeframe}s)\nStatus: ${session.status}`
          );
        } else {
          await bot!.sendMessage(chatId, "No active session. Use /start to begin.");
        }
      } else if (msg.text === "/help") {
        const helpText = `*Trading Signal Bot Commands*

/start - Start a new trading session
/stop - Stop the current session
/status - View current session status
/help - Show this help message

*How it works:*
1. Tap /start and select an asset
2. Choose a timeframe
3. Start the session
4. Receive signals 3-4 seconds before each candle closes

*Signal Types:*
CALL - Predicted upward movement
PUT - Predicted downward movement
NO TRADE - Uncertain or volatile market`;
        
        await bot!.sendMessage(chatId, helpText, { parse_mode: "Markdown" });
      }
    });
    
    bot.on("callback_query", async (query) => {
      await handleCallback(bot!, query);
    });
    
    bot.on("polling_error", (error) => {
      logger.error("Telegram polling error", error);
    });
    
    sessionManager.on("preCloseSignal", async (session: Session, signal: SignalResult) => {
      if (bot && session.status === "active") {
        try {
          await sendSignalToChat(bot, session.chatId, session, signal);
        } catch (error) {
          logger.error(`Failed to send signal to chat ${session.chatId}`, error);
        }
      }
    });
    
    isInitialized = true;
    logger.info("Telegram bot initialized and polling");
    
    return bot;
  } catch (error) {
    logger.error("Failed to initialize Telegram bot", error);
    return null;
  }
}

export function getTelegramBot(): TelegramBot | null {
  return bot;
}

export function isBotInitialized(): boolean {
  return isInitialized;
}

export function stopTelegramBot(): void {
  if (bot) {
    bot.stopPolling();
    bot = null;
    isInitialized = false;
    logger.info("Telegram bot stopped");
  }
}

export { setRenderService, setSQLiteStorage };
