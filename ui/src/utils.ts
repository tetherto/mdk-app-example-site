import { MdkFetchError, passwordAuth } from "@tetherto/mdk-ui-foundation";

import { MINER_POWER_MODES, type MinerFamily } from "./constants";
import type { History, Miner } from "./types";

// Password sign-in through the Gateway (/auth/login): under spec.rbac every app
// route needs a signed-in user. The access token is renewed from an httpOnly
// refresh cookie, on a timer and on a 401.
export const auth = passwordAuth();

export function get<T>(base: string, path: string) {
  return auth.fetcher<T>(`${base}${path}`);
}

export function post<T>(base: string, path: string, body: unknown) {
  return auth.fetcher<T>(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// The Gateway and app runtime answer `{ message: "ERR_…" }`.
export function errorMessage(err: unknown): string {
  const message = err instanceof MdkFetchError ? (err.body as { message?: unknown } | undefined)?.message : undefined;
  return typeof message === "string" ? message : ((err as Error)?.message ?? String(err));
}

// deviceIds are UUIDs — the worker-assigned type (miner-wm/-am/-av…) is the
// only family signal the overview carries.
export function minerFamilyFromType(type: string): MinerFamily | null {
  if (type.startsWith("miner-wm")) return "whatsminer";
  if (type.startsWith("miner-am")) return "antminer";
  if (type.startsWith("miner-av")) return "avalon";
  return null;
}

// Contract-only workers (whatsminer-/antminer-/sealminer-mdk-worker) report no device
// type, so fall back to the owning workerId, which names the brand.
export function minerFamily(miner: Pick<Miner, "type" | "workerId">): MinerFamily | null {
  const fromType = minerFamilyFromType(miner.type);
  if (fromType) return fromType;
  const workerId = miner.workerId.toLowerCase();
  if (workerId.includes("whatsminer")) return "whatsminer";
  if (workerId.includes("antminer")) return "antminer";
  if (workerId.includes("sealminer")) return "sealminer";
  if (workerId.includes("avalon")) return "avalon";
  return null;
}

export function powerModesForMiner(miner: Pick<Miner, "type" | "workerId"> | undefined): readonly string[] {
  const family = miner ? minerFamily(miner) : null;
  return family ? MINER_POWER_MODES[family] : ["normal"];
}

// Group miners into PDU columns by the prefix of info.pos ("<pdu>_<socket>").
export function groupByPdu(miners: Miner[]) {
  const groups: Record<string, Miner[]> = {};
  for (const m of miners) {
    const sep = m.pos.lastIndexOf("_");
    const pdu = sep === -1 ? m.pos : m.pos.slice(0, sep);
    (groups[pdu] ||= []).push(m);
  }
  for (const pdu of Object.keys(groups)) {
    groups[pdu].sort((a, b) => Number(a.pos.split("_").pop()) - Number(b.pos.split("_").pop()));
  }
  return groups;
}

export type XYPoint = { x: number; y: number };

// Collapse a history log into de-duplicated, time-sorted {x, y} points,
// dividing each raw value by `scale` (e.g. H/s → PH/s).
export function historyToPoints(history: History | undefined, scale = 1): XYPoint[] {
  const bySecond = new Map<number, XYPoint>();
  for (const p of history?.log ?? []) bySecond.set(Math.floor(p.ts / 1000), { x: p.ts, y: p.value / scale });
  return [...bySecond.values()].sort((a, b) => a.x - b.x);
}

// A flat horizontal series held at `value` across [xStart, xEnd].
export function flatLine(xStart: number, xEnd: number, value: number): XYPoint[] {
  return [
    { x: xStart, y: value },
    { x: xEnd, y: value },
  ];
}
