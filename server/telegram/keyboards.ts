import type { Asset } from "@shared/schema";
import { TIMEFRAMES } from "../config/assets";

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboard {
  inline_keyboard: InlineButton[][];
}

export function createStartKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: "Begin Trading Session", callback_data: "begin" }]
    ]
  };
}

export function createAssetKeyboard(assets: Asset[]): InlineKeyboard {
  const rows: InlineButton[][] = [];
  
  const forexAssets = assets.filter(a => a.category === "forex");
  const syntheticAssets = assets.filter(a => a.category === "synthetic");
  const cryptoAssets = assets.filter(a => a.category === "crypto");
  
  if (forexAssets.length > 0) {
    rows.push([{ text: "FOREX", callback_data: "header_forex" }]);
    for (let i = 0; i < forexAssets.length; i += 2) {
      const row: InlineButton[] = [];
      row.push({ 
        text: forexAssets[i].name, 
        callback_data: `asset:${forexAssets[i].id}` 
      });
      if (forexAssets[i + 1]) {
        row.push({ 
          text: forexAssets[i + 1].name, 
          callback_data: `asset:${forexAssets[i + 1].id}` 
        });
      }
      rows.push(row);
    }
  }
  
  if (syntheticAssets.length > 0) {
    rows.push([{ text: "SYNTHETIC INDICES", callback_data: "header_synthetic" }]);
    for (let i = 0; i < syntheticAssets.length; i += 2) {
      const row: InlineButton[] = [];
      row.push({ 
        text: syntheticAssets[i].name, 
        callback_data: `asset:${syntheticAssets[i].id}` 
      });
      if (syntheticAssets[i + 1]) {
        row.push({ 
          text: syntheticAssets[i + 1].name, 
          callback_data: `asset:${syntheticAssets[i + 1].id}` 
        });
      }
      rows.push(row);
    }
  }
  
  if (cryptoAssets.length > 0) {
    rows.push([{ text: "CRYPTO", callback_data: "header_crypto" }]);
    for (let i = 0; i < cryptoAssets.length; i += 2) {
      const row: InlineButton[] = [];
      row.push({ 
        text: cryptoAssets[i].name, 
        callback_data: `asset:${cryptoAssets[i].id}` 
      });
      if (cryptoAssets[i + 1]) {
        row.push({ 
          text: cryptoAssets[i + 1].name, 
          callback_data: `asset:${cryptoAssets[i + 1].id}` 
        });
      }
      rows.push(row);
    }
  }
  
  rows.push([{ text: "Cancel", callback_data: "cancel" }]);
  
  return { inline_keyboard: rows };
}

export function createTimeframeKeyboard(assetId: string): InlineKeyboard {
  const rows: InlineButton[][] = [];
  
  const mainTimeframes = TIMEFRAMES.slice(0, 3);
  rows.push(
    mainTimeframes.map(tf => ({
      text: tf.label,
      callback_data: `timeframe:${assetId}:${tf.value}`
    }))
  );
  
  const otherTimeframes = TIMEFRAMES.slice(3);
  if (otherTimeframes.length > 0) {
    rows.push(
      otherTimeframes.map(tf => ({
        text: tf.label,
        callback_data: `timeframe:${assetId}:${tf.value}`
      }))
    );
  }
  
  rows.push([
    { text: "Back to Assets", callback_data: "begin" },
    { text: "Cancel", callback_data: "cancel" }
  ]);
  
  return { inline_keyboard: rows };
}

export function createConfirmSessionKeyboard(assetId: string, timeframe: number): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ 
        text: "Start Session", 
        callback_data: `start_session:${assetId}:${timeframe}` 
      }],
      [
        { text: "Change Timeframe", callback_data: `asset:${assetId}` },
        { text: "Change Asset", callback_data: "begin" }
      ],
      [{ text: "Cancel", callback_data: "cancel" }]
    ]
  };
}

export function createSessionControlKeyboard(sessionId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "View Status", callback_data: `view:${sessionId}` },
        { text: "Stop Session", callback_data: `stop:${sessionId}` }
      ]
    ]
  };
}

export function createSignalActionKeyboard(sessionId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "View Session", callback_data: `view:${sessionId}` },
        { text: "Re-run Signal", callback_data: `rerun:${sessionId}` }
      ],
      [
        { text: "Stop Session", callback_data: `stop:${sessionId}` }
      ]
    ]
  };
}

export function createStoppedSessionKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: "Start New Session", callback_data: "begin" }]
    ]
  };
}
