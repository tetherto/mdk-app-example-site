import { useMemo } from "react";

import { HS_PER_MHS, HS_PER_THS } from "./constants";
import type { Miner } from "./types";
import { minerFamily } from "./utils";

export type MinerRow = Miner & { family: string; efficiencyWth: number | null };

export type MinerFilters = { search: string; family: string; status: string; container: string };

export const ALL = "all";
export const HEALTHY = new Set(["online", "mining", "active", "normal", "running"]);
const IDLE = new Set(["sleeping", "standby"]);

/** Badge colour for a miner status: healthy (online, mining, …) green, idle amber, unknown grey, anything else red. */
export function statusBadge(status: string): "success" | "warning" | "error" | "default" {
  const s = status.toLowerCase();
  if (HEALTHY.has(s)) return "success";
  if (IDLE.has(s)) return "warning";
  if (s === "unknown") return "default";
  return "error";
}

const MHS_PER_THS = HS_PER_THS / HS_PER_MHS;

// Shape miners into table rows, derive the filter options, apply the active
// filters and summarise what's left.
export function useMinerRows(miners: Miner[], { search, family, status, container }: MinerFilters) {
  const rows = useMemo<MinerRow[]>(
    () =>
      miners.map((m) => {
        const ths = m.hashrateMhs / MHS_PER_THS;
        return {
          ...m,
          family: minerFamily(m) ?? "unknown",
          efficiencyWth: ths > 0 && m.powerW > 0 ? m.powerW / ths : null,
        };
      }),
    [miners],
  );

  const options = useMemo(() => {
    const uniq = (pick: (r: MinerRow) => string) => [...new Set(rows.map(pick).filter(Boolean))].sort();
    return {
      family: uniq((r) => r.family),
      status: uniq((r) => r.status),
      container: uniq((r) => r.container),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (family === ALL || r.family === family) &&
        (status === ALL || r.status === status) &&
        (container === ALL || r.container === container) &&
        (!q || [r.code, r.deviceId, r.workerId, r.container].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [rows, search, family, status, container]);

  const summary = useMemo(() => {
    const online = filtered.filter((r) => HEALTHY.has(r.status.toLowerCase())).length;
    const hashrateMhs = filtered.reduce((sum, r) => sum + r.hashrateMhs, 0);
    const powerW = filtered.reduce((sum, r) => sum + r.powerW, 0);
    return { online, hashrateMhs, powerW };
  }, [filtered]);

  return { rows, options, filtered, summary };
}
