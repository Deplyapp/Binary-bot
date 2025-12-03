import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { initTelegramBot, setRenderService, setSQLiteStorage } from "./telegram/bot";
import { initRenderService, renderService } from "./services/renderService";
import { SQLiteStorage } from "./storage";
import { sessionManager } from "./services/sessionManager";
import { derivFeed } from "./services/derivFeed";
import { createLogger } from "./utils/logger";

const logger = createLogger("Server");

const DATA_DIR = "./data";
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number }).status || (err as { statusCode?: number }).statusCode || 500;
    const message = (err as { message?: string }).message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    async () => {
      log(`Server running on port ${port}`);
      
      try {
        const sqliteStorage = new SQLiteStorage(path.join(DATA_DIR, "signals.db"));
        setSQLiteStorage(sqliteStorage);
        logger.info("SQLite storage initialized");
      } catch (error) {
        logger.error("Failed to initialize SQLite storage", error);
      }
      
      try {
        await initRenderService();
        setRenderService(renderService);
        logger.info("Chart render service initialized");
      } catch (error) {
        logger.warn("Chart render service not available - will send text-only signals", error);
      }
      
      const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
      if (telegramToken) {
        const bot = initTelegramBot(telegramToken);
        if (bot) {
          logger.info("Telegram bot started and polling");
        }
      } else {
        logger.warn("TELEGRAM_BOT_TOKEN not set - bot will not start");
        logger.info("Set TELEGRAM_BOT_TOKEN environment variable to enable the Telegram bot");
      }
      
      logger.info("All services initialized successfully");
    },
  );

  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received - shutting down gracefully");
    sessionManager.cleanup();
    derivFeed.disconnect();
    await renderService.close();
    httpServer.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info("SIGINT received - shutting down gracefully");
    sessionManager.cleanup();
    derivFeed.disconnect();
    await renderService.close();
    httpServer.close();
    process.exit(0);
  });
})();
