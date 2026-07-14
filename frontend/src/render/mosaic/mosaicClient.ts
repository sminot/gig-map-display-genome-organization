import { Coordinator, wasmConnector } from '@uwdata/mosaic-core';
import { createAPIContext } from '@uwdata/vgplot';
import { tableToIPC, type Table } from 'apache-arrow';

// Shared Mosaic + DuckDB-WASM bootstrap for the mosaic renderer family.
// A single DuckDB-WASM instance + Mosaic coordinator is created lazily and
// reused across renderers. Arrow tables produced by the API client are pushed
// into DuckDB by name; vgplot marks then query them through the coordinator.

// The vgplot API context (bound to our coordinator). Untyped upstream.
export type VG = ReturnType<typeof createAPIContext>;

interface MosaicRuntime {
  vg: VG;
  connector: ReturnType<typeof wasmConnector>;
}

let runtime: Promise<MosaicRuntime> | null = null;

export function getMosaic(): Promise<MosaicRuntime> {
  if (!runtime) {
    runtime = (async () => {
      const connector = wasmConnector();
      const coordinator = new Coordinator(connector);
      const vg = createAPIContext({ coordinator });
      return { vg, connector };
    })();
  }
  return runtime;
}

// Register an Arrow table under `name`, replacing any prior table of that name so
// re-runs with new params overwrite cleanly. Serializing through the app's
// apache-arrow avoids version skew with DuckDB-WASM's bundled Arrow.
export async function registerArrow(name: string, table: Table): Promise<void> {
  const { connector } = await getMosaic();
  const con = await connector.getConnection();
  await con.query(`DROP TABLE IF EXISTS "${name}"`);
  await con.insertArrowFromIPCStream(tableToIPC(table), { name });
}
