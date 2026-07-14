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

// Per-name registration queue. Concurrent registrations of the SAME table name
// (e.g. React StrictMode double-invoking an effect in dev) would otherwise race:
// two DROP IF EXISTS both see nothing, then the two inserts collide with
// "table already exists". Chaining per name serializes them so the last write wins.
const registerQueue = new Map<string, Promise<void>>();

// Register an Arrow table under `name`, replacing any prior table of that name so
// re-runs with new params overwrite cleanly. Serializing through the app's
// apache-arrow avoids version skew with DuckDB-WASM's bundled Arrow.
export function registerArrow(name: string, table: Table): Promise<void> {
  const prior = registerQueue.get(name) ?? Promise.resolve();
  const next = prior
    .catch(() => {})
    .then(async () => {
      const { connector } = await getMosaic();
      const con = await connector.getConnection();
      // Load into a staging table, then swap atomically. CREATE OR REPLACE never
      // leaves `name` momentarily absent, so vgplot clients still querying an
      // earlier build (e.g. a StrictMode-cancelled render) never see a missing table.
      const staging = `__load_${name}`;
      await con.query(`DROP TABLE IF EXISTS "${staging}"`);
      await con.insertArrowFromIPCStream(tableToIPC(table), { name: staging });
      await con.query(`CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM "${staging}"`);
      await con.query(`DROP TABLE IF EXISTS "${staging}"`);
    });
  registerQueue.set(name, next);
  return next;
}
