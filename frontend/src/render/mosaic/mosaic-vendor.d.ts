// The installed @uwdata/mosaic-* packages ship no type declarations (plain ESM
// source). Declare the surface we use as `any`; runtime behavior is exercised in
// the browser, and the pure data-shaping helpers (dataShaping.ts) are typed.

declare module '@uwdata/mosaic-core' {
  export const Coordinator: new (connector?: unknown, options?: unknown) => unknown;
  export function wasmConnector(options?: unknown): {
    getConnection(): Promise<{
      query(sql: string): Promise<unknown>;
      insertArrowFromIPCStream(buffer: Uint8Array, options: { name: string }): Promise<void>;
    }>;
    getDuckDB(): Promise<unknown>;
  };
}

declare module '@uwdata/vgplot' {
  export function createAPIContext(options?: Record<string, unknown>): any;
}
