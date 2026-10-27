export type MinerFamily = "whatsminer" | "antminer" | "sealminer" | "avalon";

// Per-family setPowerMode support in this demo (sleep omitted — it powers the miner down).
export const MINER_POWER_MODES: Record<MinerFamily, readonly string[]> = {
  whatsminer: ["low", "normal", "high"],
  antminer: ["normal"],
  sealminer: ["normal", "high_performance"],
  avalon: ["normal", "high"],
};

export const HS_PER_MHS = 1e6; // H/s per MH/s (pool and site histories report hashrate in H/s)
export const HS_PER_THS = 1e12; // H/s per TH/s

// Nominal (installed) hashrate per miner, used to draw the "Nominal Hash Rate"
// reference line on the dashboard. ~450 TH/s ≈ a modern air-cooled unit.
export const NOMINAL_MHS_PER_MINER = 450e6;

// Dashboard chart palette — matches the MDK full site visual treatment.
export const HASH_SERIES_COLORS = {
  mdkFullSite: "#2fd4bf",
  aggrPool: "#8aa0b5",
  f2pool: "#a855f7",
  nominal: "#f5c518",
} as const;

// Dashboard timeline range options (display-only for this example).
export const DASHBOARD_TIMELINE_OPTIONS = [
  { label: "5 Min", value: "5m" },
  { label: "30 Min", value: "30m" },
  { label: "3 H", value: "3h" },
  { label: "1 D", value: "1d" },
];
