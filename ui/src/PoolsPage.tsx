import { MiningPoolsPanel } from "@tetherto/mdk-react-devkit/domain";
import type { MiningPoolRow } from "@tetherto/mdk-react-devkit/domain";

// Overview is loaded before this renders — empty rows means no pool stats yet.
export function PoolsPage({ poolRows }: { poolRows: MiningPoolRow[] }) {
  return (
    <MiningPoolsPanel
      rows={poolRows}
      isLoading={false}
      emptyMessage="No pool stats yet — the pool worker reports once the configured pool account has activity."
    />
  );
}
