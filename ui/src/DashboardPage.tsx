import {
  ActiveIncidentsCard,
  getHashrateString,
  getHashrateUnit,
  LineChartCard,
  MiningPoolsPanel,
  type LineChartCardData,
  type MiningPoolRow,
  type TIncidentRowProps,
} from "@tetherto/mdk-react-devkit/domain";
import { Divider, formatHashrateUnit, HASHRATE_LABEL_DIVISOR } from "@tetherto/mdk-react-devkit/primitives";

import {
  DASHBOARD_TIMELINE_OPTIONS,
  HASH_SERIES_COLORS,
  HS_PER_MHS,
} from "./constants";
import type { History } from "./types";
import { flatLine, historyToPoints, type XYPoint } from "./utils";

const HALF_HOUR_MS = 30 * 60 * 1000;

// x-range for flat reference lines: span the real history when present,
// otherwise a 30-min window ending "now" so the line still renders.
function xRange(points: { x: number }[], nowTs: number): [number, number] {
  if (points.length) return [points[0].x, points[points.length - 1].x];
  return [nowTs - HALF_HOUR_MS, nowTs];
}

function hashChartData(
  hashHistory: History | undefined,
  siteHashHistory: History | undefined,
  siteMhs: number,
  nominalMhs: number,
  nowTs: number,
): LineChartCardData {
  // site-hashrate history is MH/s; pool histories are H/s.
  const siteSeries = historyToPoints(siteHashHistory);
  const siteLatest = siteSeries.length ? siteSeries[siteSeries.length - 1].y : siteMhs;
  const aggrPool = historyToPoints(hashHistory, HS_PER_MHS);
  const [x0, x1] = xRange(siteSeries.length ? siteSeries : aggrPool, nowTs);
  const aggrLatest = aggrPool.length ? aggrPool[aggrPool.length - 1].y : 0;

  // One dynamic axis unit picked from the chart's largest magnitude.
  const maxMhs = [siteMhs, nominalMhs, ...siteSeries.map((p) => p.y), ...aggrPool.map((p) => p.y)]
    .reduce((max, v) => Math.max(max, v), 0);
  const axisUnit = getHashrateUnit(maxMhs).unit;
  const divisor = HASHRATE_LABEL_DIVISOR[axisUnit as keyof typeof HASHRATE_LABEL_DIVISOR] ?? 1;
  const toAxis = (points: XYPoint[]) => points.map((p) => ({ x: p.x, y: p.y / divisor }));
  const currentValue = (mhs: number) => {
    const u = getHashrateUnit(mhs, 2);
    return { value: u.value ?? 0, unit: u.unit };
  };

  return {
    datasets: [
      {
        label: "Site Hash Rate",
        borderColor: HASH_SERIES_COLORS.mdkFullSite,
        data: siteSeries.length ? toAxis(siteSeries) : flatLine(x0, x1, siteMhs / divisor),
        currentValue: currentValue(siteLatest),
      },
      {
        label: "Aggr Pool Hash Rate",
        borderColor: HASH_SERIES_COLORS.aggrPool,
        data: toAxis(aggrPool),
        currentValue: currentValue(aggrLatest),
      },
      {
        label: "F2pool Hash Rate",
        borderColor: HASH_SERIES_COLORS.f2pool,
        data: flatLine(x0, x1, 0),
        currentValue: currentValue(0),
      },
      {
        label: "Nominal Hash Rate",
        borderColor: HASH_SERIES_COLORS.nominal,
        data: flatLine(x0, x1, nominalMhs / divisor),
        currentValue: currentValue(nominalMhs),
      },
    ],
    minMaxAvg: {
      min: getHashrateString(siteSeries.length ? Math.min(...siteSeries.map((p) => p.y)) : siteMhs),
      max: getHashrateString(siteSeries.length ? Math.max(...siteSeries.map((p) => p.y)) : siteMhs),
      avg: getHashrateString(siteSeries.length ? siteSeries.reduce((s, p) => s + p.y, 0) / siteSeries.length : siteMhs),
    },
    yTicksFormatter: (v: number) => formatHashrateUnit({ value: v, unit: axisUnit }),
  };
}

export function DashboardPage({
  hashHistory,
  siteHashHistory,
  siteMhs,
  nominalMhs,
  nowTs,
  incidents,
  incidentsLoading,
  poolRows,
  poolsLoading,
}: {
  hashHistory: History | undefined;
  siteHashHistory: History | undefined;
  siteMhs: number;
  nominalMhs: number;
  nowTs: number;
  incidents: TIncidentRowProps[];
  incidentsLoading: boolean;
  poolRows: MiningPoolRow[];
  poolsLoading: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <LineChartCard
        title="Hash Rate"
        data={hashChartData(hashHistory, siteHashHistory, siteMhs, nominalMhs, nowTs)}
        timelineOptions={DASHBOARD_TIMELINE_OPTIONS}
        defaultTimeline="5m"
        detailLegends
        isLoading={hashHistory === undefined}
        minHeight={280}
      />

      <Divider />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
        <ActiveIncidentsCard label="Active Alerts" items={incidents} isLoading={incidentsLoading} emptyMessage="No active alerts" />
        <MiningPoolsPanel rows={poolRows} isLoading={poolsLoading} />
      </div>
    </div>
  );
}
