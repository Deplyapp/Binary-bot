import type { Candle, IndicatorValues, PsychologyAnalysis, Vote, SignalResult, SessionOptions } from "@shared/schema";
import { predictWithFormingCandle } from "./predictionEngine";
import { getIndicatorWeight, isIndicatorEnabled, SIGNAL_CONFIG, VOLATILITY_CONFIG } from "../config/indicators";
import { createLogger } from "../utils/logger";

const logger = createLogger("SignalEngine");

function voteFromEMACross(
  indicators: IndicatorValues,
  fastKey: keyof IndicatorValues,
  slowKey: keyof IndicatorValues,
  lastClose: number,
  name: string
): Vote | null {
  const fast = indicators[fastKey] as number | undefined;
  const slow = indicators[slowKey] as number | undefined;
  
  if (fast === undefined || slow === undefined) return null;
  
  if (fast > slow && lastClose > fast) {
    return { indicator: name, direction: "UP", weight: 1, reason: `${fastKey} > ${slowKey as string}, price above` };
  }
  if (fast < slow && lastClose < fast) {
    return { indicator: name, direction: "DOWN", weight: 1, reason: `${fastKey} < ${slowKey as string}, price below` };
  }
  return { indicator: name, direction: "NEUTRAL", weight: 0.3, reason: "No clear cross" };
}

function voteFromSMATrend(
  indicators: IndicatorValues,
  smaKey: keyof IndicatorValues,
  lastClose: number,
  name: string
): Vote | null {
  const sma = indicators[smaKey] as number | undefined;
  if (sma === undefined) return null;
  
  const diff = (lastClose - sma) / sma;
  if (diff > 0.001) {
    return { indicator: name, direction: "UP", weight: 1, reason: `Price above ${smaKey as string}` };
  }
  if (diff < -0.001) {
    return { indicator: name, direction: "DOWN", weight: 1, reason: `Price below ${smaKey as string}` };
  }
  return { indicator: name, direction: "NEUTRAL", weight: 0.5, reason: `Near ${smaKey as string}` };
}

function voteFromMACD(indicators: IndicatorValues): Vote[] {
  const votes: Vote[] = [];
  const macd = indicators.macd;
  
  if (!macd) return votes;
  
  if (macd.macd > macd.signal) {
    votes.push({ indicator: "macd_signal", direction: "UP", weight: 1, reason: "MACD above signal" });
  } else {
    votes.push({ indicator: "macd_signal", direction: "DOWN", weight: 1, reason: "MACD below signal" });
  }
  
  if (macd.histogram > 0 && macd.histogram > 0.00001) {
    votes.push({ indicator: "macd_histogram", direction: "UP", weight: 1, reason: "Positive histogram" });
  } else if (macd.histogram < 0 && macd.histogram < -0.00001) {
    votes.push({ indicator: "macd_histogram", direction: "DOWN", weight: 1, reason: "Negative histogram" });
  } else {
    votes.push({ indicator: "macd_histogram", direction: "NEUTRAL", weight: 0.3 });
  }
  
  return votes;
}

function voteFromRSI(indicators: IndicatorValues): Vote[] {
  const votes: Vote[] = [];
  const rsi = indicators.rsi14;
  
  if (rsi === undefined) return votes;
  
  if (rsi < 30) {
    votes.push({ indicator: "rsi_oversold", direction: "UP", weight: 1, reason: `RSI oversold: ${rsi.toFixed(1)}` });
  } else if (rsi > 70) {
    votes.push({ indicator: "rsi_overbought", direction: "DOWN", weight: 1, reason: `RSI overbought: ${rsi.toFixed(1)}` });
  } else if (rsi > 50) {
    votes.push({ indicator: "rsi_trend", direction: "UP", weight: 0.5, reason: `RSI bullish: ${rsi.toFixed(1)}` });
  } else {
    votes.push({ indicator: "rsi_trend", direction: "DOWN", weight: 0.5, reason: `RSI bearish: ${rsi.toFixed(1)}` });
  }
  
  return votes;
}

function voteFromStochastic(indicators: IndicatorValues): Vote[] {
  const votes: Vote[] = [];
  const stoch = indicators.stochastic;
  
  if (!stoch) return votes;
  
  if (stoch.k > stoch.d && stoch.k < 80) {
    votes.push({ indicator: "stochastic_cross", direction: "UP", weight: 1, reason: "Bullish stochastic cross" });
  } else if (stoch.k < stoch.d && stoch.k > 20) {
    votes.push({ indicator: "stochastic_cross", direction: "DOWN", weight: 1, reason: "Bearish stochastic cross" });
  }
  
  if (stoch.k < 20) {
    votes.push({ indicator: "stochastic_extreme", direction: "UP", weight: 1, reason: "Stochastic oversold" });
  } else if (stoch.k > 80) {
    votes.push({ indicator: "stochastic_extreme", direction: "DOWN", weight: 1, reason: "Stochastic overbought" });
  }
  
  return votes;
}

function voteFromBollinger(indicators: IndicatorValues, lastClose: number): Vote[] {
  const votes: Vote[] = [];
  const bb = indicators.bollingerBands;
  
  if (!bb) return votes;
  
  const bandwidth = (bb.upper - bb.lower) / bb.middle;
  if (bandwidth < 0.02) {
    votes.push({ indicator: "bollinger_squeeze", direction: "NEUTRAL", weight: 0.8, reason: "Bollinger squeeze - expect breakout" });
  }
  
  if (lastClose > bb.upper) {
    votes.push({ indicator: "bollinger_breakout", direction: "UP", weight: 1, reason: "Price broke above upper band" });
  } else if (lastClose < bb.lower) {
    votes.push({ indicator: "bollinger_breakout", direction: "DOWN", weight: 1, reason: "Price broke below lower band" });
  }
  
  return votes;
}

function voteFromSuperTrend(indicators: IndicatorValues): Vote | null {
  const st = indicators.superTrend;
  if (!st) return null;
  
  if (st.direction === "up") {
    return { indicator: "supertrend_signal", direction: "UP", weight: 1, reason: "SuperTrend bullish" };
  }
  return { indicator: "supertrend_signal", direction: "DOWN", weight: 1, reason: "SuperTrend bearish" };
}

function voteFromPSAR(indicators: IndicatorValues, lastClose: number): Vote | null {
  const psar = indicators.psar;
  if (psar === undefined) return null;
  
  if (lastClose > psar) {
    return { indicator: "psar_signal", direction: "UP", weight: 1, reason: "Price above PSAR" };
  }
  return { indicator: "psar_signal", direction: "DOWN", weight: 1, reason: "Price below PSAR" };
}

function voteFromADX(indicators: IndicatorValues): Vote | null {
  const adx = indicators.adx;
  if (adx === undefined) return null;
  
  if (adx < 25) {
    return { indicator: "adx_trend_strength", direction: "NEUTRAL", weight: 0.5, reason: `Weak trend ADX: ${adx.toFixed(1)}` };
  }
  return { indicator: "adx_trend_strength", direction: "NEUTRAL", weight: 1, reason: `Strong trend ADX: ${adx.toFixed(1)}` };
}

function voteFromCCI(indicators: IndicatorValues): Vote | null {
  const cci = indicators.cci;
  if (cci === undefined) return null;
  
  if (cci > 100) {
    return { indicator: "cci_signal", direction: "UP", weight: 1, reason: `CCI bullish: ${cci.toFixed(1)}` };
  }
  if (cci < -100) {
    return { indicator: "cci_signal", direction: "DOWN", weight: 1, reason: `CCI bearish: ${cci.toFixed(1)}` };
  }
  return { indicator: "cci_signal", direction: "NEUTRAL", weight: 0.3 };
}

function voteFromWilliamsR(indicators: IndicatorValues): Vote | null {
  const wr = indicators.williamsR;
  if (wr === undefined) return null;
  
  if (wr < -80) {
    return { indicator: "williams_r", direction: "UP", weight: 1, reason: "Williams %R oversold" };
  }
  if (wr > -20) {
    return { indicator: "williams_r", direction: "DOWN", weight: 1, reason: "Williams %R overbought" };
  }
  return { indicator: "williams_r", direction: "NEUTRAL", weight: 0.3 };
}

function voteFromHullMA(indicators: IndicatorValues, lastClose: number): Vote | null {
  const hull = indicators.hullMA;
  if (hull === undefined) return null;
  
  if (lastClose > hull) {
    return { indicator: "hull_ma_trend", direction: "UP", weight: 1, reason: "Price above Hull MA" };
  }
  return { indicator: "hull_ma_trend", direction: "DOWN", weight: 1, reason: "Price below Hull MA" };
}

function voteFromMeanReversion(indicators: IndicatorValues): Vote | null {
  const z = indicators.meanReversionZ;
  if (z === undefined) return null;
  
  if (z < -2) {
    return { indicator: "mean_reversion", direction: "UP", weight: 1, reason: `Strong mean reversion signal (z=${z.toFixed(2)})` };
  }
  if (z > 2) {
    return { indicator: "mean_reversion", direction: "DOWN", weight: 1, reason: `Strong mean reversion signal (z=${z.toFixed(2)})` };
  }
  return null;
}

function voteFromPsychology(psychology: PsychologyAnalysis): Vote[] {
  const votes: Vote[] = [];
  
  for (const pattern of psychology.patterns) {
    let vote: Vote;
    if (pattern.type === "bullish") {
      vote = { indicator: pattern.name.toLowerCase().replace(/\s+/g, "_"), direction: "UP", weight: pattern.strength, reason: pattern.description };
      if (pattern.name.includes("Engulfing")) vote.indicator = "engulfing_pattern";
      if (pattern.name.includes("Hammer")) vote.indicator = "hammer_pattern";
    } else if (pattern.type === "bearish") {
      vote = { indicator: pattern.name.toLowerCase().replace(/\s+/g, "_"), direction: "DOWN", weight: pattern.strength, reason: pattern.description };
      if (pattern.name.includes("Engulfing")) vote.indicator = "engulfing_pattern";
      if (pattern.name.includes("Shooting")) vote.indicator = "shooting_star";
    } else {
      vote = { indicator: "doji_pattern", direction: "NEUTRAL", weight: pattern.strength * 0.5, reason: pattern.description };
    }
    votes.push(vote);
  }
  
  if (psychology.orderBlockProbability > 0.6) {
    const direction = psychology.bias === "bullish" ? "UP" : psychology.bias === "bearish" ? "DOWN" : "NEUTRAL";
    votes.push({ indicator: "order_block", direction, weight: psychology.orderBlockProbability, reason: "Order block detected" });
  }
  
  if (psychology.fvgDetected) {
    votes.push({ indicator: "fvg_signal", direction: psychology.bias === "bullish" ? "UP" : "DOWN", weight: 0.8, reason: "Fair Value Gap detected" });
  }
  
  if (psychology.upperWickRatio > 0.6) {
    votes.push({ indicator: "wick_rejection", direction: "DOWN", weight: psychology.upperWickRatio, reason: "Upper wick rejection" });
  }
  if (psychology.lowerWickRatio > 0.6) {
    votes.push({ indicator: "wick_rejection", direction: "UP", weight: psychology.lowerWickRatio, reason: "Lower wick rejection" });
  }
  
  return votes;
}

function collectVotes(
  indicators: IndicatorValues,
  psychology: PsychologyAnalysis,
  lastClose: number,
  options?: SessionOptions
): Vote[] {
  const votes: Vote[] = [];
  const enabledIndicators = options?.enabledIndicators;
  const customWeights = options?.customWeights;
  
  const addVote = (vote: Vote | null, name: string) => {
    if (vote && isIndicatorEnabled(name, enabledIndicators)) {
      vote.weight *= getIndicatorWeight(name, customWeights);
      votes.push(vote);
    }
  };
  
  const addVotes = (voteList: Vote[], prefix: string = "") => {
    for (const vote of voteList) {
      const name = prefix || vote.indicator;
      if (isIndicatorEnabled(name, enabledIndicators)) {
        vote.weight *= getIndicatorWeight(name, customWeights);
        votes.push(vote);
      }
    }
  };
  
  addVote(voteFromEMACross(indicators, "ema5", "ema21", lastClose, "ema_cross_5_21"), "ema_cross_5_21");
  addVote(voteFromEMACross(indicators, "ema9", "ema21", lastClose, "ema_cross_9_21"), "ema_cross_9_21");
  addVote(voteFromEMACross(indicators, "ema12", "ema50", lastClose, "ema_cross_12_50"), "ema_cross_12_50");
  
  addVote(voteFromSMATrend(indicators, "sma20", lastClose, "sma_trend_20"), "sma_trend_20");
  addVote(voteFromSMATrend(indicators, "sma50", lastClose, "sma_trend_50"), "sma_trend_50");
  addVote(voteFromSMATrend(indicators, "sma200", lastClose, "sma_trend_200"), "sma_trend_200");
  
  addVotes(voteFromMACD(indicators));
  addVotes(voteFromRSI(indicators));
  addVotes(voteFromStochastic(indicators));
  addVotes(voteFromBollinger(indicators, lastClose));
  
  addVote(voteFromSuperTrend(indicators), "supertrend_signal");
  addVote(voteFromPSAR(indicators, lastClose), "psar_signal");
  addVote(voteFromADX(indicators), "adx_trend_strength");
  addVote(voteFromCCI(indicators), "cci_signal");
  addVote(voteFromWilliamsR(indicators), "williams_r");
  addVote(voteFromHullMA(indicators, lastClose), "hull_ma_trend");
  addVote(voteFromMeanReversion(indicators), "mean_reversion");
  
  addVotes(voteFromPsychology(psychology));
  
  return votes;
}

function calculateScores(votes: Vote[]): { finalUp: number; finalDown: number; pUp: number } {
  let finalUp = 0;
  let finalDown = 0;
  
  for (const vote of votes) {
    if (vote.direction === "UP") {
      finalUp += vote.weight;
    } else if (vote.direction === "DOWN") {
      finalDown += vote.weight;
    }
  }
  
  const total = finalUp + finalDown + 1e-9;
  const pUp = finalUp / total;
  
  return { finalUp, finalDown, pUp };
}

function determineDirection(pUp: number, confidence: number): "CALL" | "PUT" | "NO_TRADE" {
  if (confidence < SIGNAL_CONFIG.minConfidence) {
    return "NO_TRADE";
  }
  return pUp > 0.5 ? "CALL" : "PUT";
}

export function generateSignal(
  sessionId: string,
  symbol: string,
  timeframe: number,
  closedCandles: Candle[],
  formingCandle: Candle | null,
  candleCloseTime: number,
  options?: SessionOptions
): SignalResult {
  const timestamp = Math.floor(Date.now() / 1000);
  
  if (closedCandles.length < VOLATILITY_CONFIG.minCandlesForSignal) {
    logger.warn(`Not enough candles for signal: ${closedCandles.length} < ${VOLATILITY_CONFIG.minCandlesForSignal}`);
    return {
      sessionId,
      symbol,
      timeframe,
      timestamp,
      candleCloseTime,
      direction: "NO_TRADE",
      confidence: 0,
      pUp: 0.5,
      pDown: 0.5,
      votes: [],
      indicators: {},
      psychology: {
        bodyRatio: 0,
        upperWickRatio: 0,
        lowerWickRatio: 0,
        isDoji: false,
        patterns: [],
        bias: "neutral",
        orderBlockProbability: 0,
        fvgDetected: false,
      },
      volatilityOverride: false,
      closedCandlesCount: closedCandles.length,
      formingCandle: formingCandle || undefined,
    };
  }
  
  const prediction = predictWithFormingCandle(closedCandles, formingCandle);
  
  if (prediction.volatility.isVolatile) {
    logger.info(`Volatility override for ${symbol}: ${prediction.volatility.reason}`);
    return {
      sessionId,
      symbol,
      timeframe,
      timestamp,
      candleCloseTime,
      direction: "NO_TRADE",
      confidence: 0,
      pUp: 0.5,
      pDown: 0.5,
      votes: [],
      indicators: prediction.indicators,
      psychology: prediction.psychology,
      volatilityOverride: true,
      volatilityReason: prediction.volatility.reason,
      closedCandlesCount: closedCandles.length,
      formingCandle: formingCandle || undefined,
    };
  }
  
  const lastClose = prediction.estimatedClose;
  const votes = collectVotes(prediction.indicators, prediction.psychology, lastClose, options);
  const { finalUp, finalDown, pUp } = calculateScores(votes);
  
  const confidence = Math.round(Math.max(pUp, 1 - pUp) * 100);
  const direction = determineDirection(pUp, confidence);
  
  logger.info(`Signal generated for ${symbol}: ${direction} (${confidence}% confidence, pUp=${pUp.toFixed(3)})`);
  
  return {
    sessionId,
    symbol,
    timeframe,
    timestamp,
    candleCloseTime,
    direction,
    confidence,
    pUp,
    pDown: 1 - pUp,
    votes,
    indicators: prediction.indicators,
    psychology: prediction.psychology,
    volatilityOverride: false,
    closedCandlesCount: closedCandles.length,
    formingCandle: formingCandle || undefined,
  };
}
