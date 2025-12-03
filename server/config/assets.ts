import type { Asset } from "@shared/schema";

export const SUPPORTED_ASSETS: Asset[] = [
  { id: "frxEURUSD", name: "EUR / USD", category: "forex" },
  { id: "frxGBPUSD", name: "GBP / USD", category: "forex" },
  { id: "frxUSDJPY", name: "USD / JPY", category: "forex" },
  { id: "frxAUDUSD", name: "AUD / USD", category: "forex" },
  { id: "frxUSDINR", name: "USD / INR", category: "forex" },
  { id: "frxUSDCAD", name: "USD / CAD", category: "forex" },
  { id: "frxEURGBP", name: "EUR / GBP", category: "forex" },
  { id: "frxEURJPY", name: "EUR / JPY", category: "forex" },
  { id: "R_10", name: "Volatility 10 Index", category: "synthetic" },
  { id: "R_25", name: "Volatility 25 Index", category: "synthetic" },
  { id: "R_50", name: "Volatility 50 Index", category: "synthetic" },
  { id: "R_75", name: "Volatility 75 Index", category: "synthetic" },
  { id: "R_100", name: "Volatility 100 Index", category: "synthetic" },
  { id: "1HZ10V", name: "Volatility 10 (1s) Index", category: "synthetic" },
  { id: "1HZ25V", name: "Volatility 25 (1s) Index", category: "synthetic" },
  { id: "1HZ50V", name: "Volatility 50 (1s) Index", category: "synthetic" },
  { id: "1HZ75V", name: "Volatility 75 (1s) Index", category: "synthetic" },
  { id: "1HZ100V", name: "Volatility 100 (1s) Index", category: "synthetic" },
  { id: "cryBTCUSD", name: "Bitcoin / USD", category: "crypto" },
  { id: "cryETHUSD", name: "Ethereum / USD", category: "crypto" },
];

export const TIMEFRAMES = [
  { value: 60, label: "1m" },
  { value: 120, label: "2m" },
  { value: 300, label: "5m" },
  { value: 900, label: "15m" },
  { value: 1800, label: "30m" },
  { value: 3600, label: "1h" },
];

export function getAssetById(id: string): Asset | undefined {
  return SUPPORTED_ASSETS.find(asset => asset.id === id);
}

export function getTimeframeLabel(seconds: number): string {
  const tf = TIMEFRAMES.find(t => t.value === seconds);
  return tf?.label || `${seconds}s`;
}
