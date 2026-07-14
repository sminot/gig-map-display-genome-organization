// ===========================================================================
// RENDERER PLUGIN CONTRACT  (read this before touching a renderer, Wave-2)
// ===========================================================================
//
// Each analysis function is a FunctionModule (see ./types.ts):
//
//   interface FunctionModule {
//     id: string;            // matches the backend functionId (POST /api/run/{id})
//     title: string;         // shown in the launcher
//     category: string;      // launcher grouping
//     description: string;
//     family: 'webgl' | 'mosaic' | 'svg';
//     params: ParamsDef;     // from defineParams(); rendered by the single SchemaForm
//     Renderer: React.FC<RendererProps>;
//   }
//
//   interface RendererProps {
//     params: Record<string, unknown>;  // the validated params that produced `result`
//     result: RunResult;                 // { kind:'arrow', table } | { kind:'json', data }
//                                         //   | { kind:'plotly', figure }
//   }
//
// A Renderer is a pure React component. It receives the run `result` and the
// `params`. It may register export handlers with useRegisterExport(handlers, deps)
// from ../session/exports (png/svg/csv/json) — the App's export bar and the
// backend `?format=` fallback do the actual download plumbing.
//
// Wave-2 rule: replace ONLY the `Renderer` field of the modules assigned to your
// family. Do not change id/title/category/params (the API contract depends on
// them) and do not edit the SchemaForm or the field system.
//   - Family C (webgl):  genome_organization                         -> render/webgl/
//   - Family D (mosaic): compare_contrasts, bin_to_genomes,
//                        bin_set_heatmap (+ volcano/box, bonus)       -> render/mosaic/
//   - Family E (svg):    synteny_layout, phylogeny_vs_core,
//                        core_genome                                  -> render/svg/
// To swap in a real renderer, import it here and set `Renderer` on the module,
// or replace the module's own Renderer export in its file.
// ===========================================================================

import type { FunctionModule } from './types';
import { genomeOrganization } from './genomeOrganization';
import { compareContrasts } from './compareContrasts';
import { binToGenomes } from './binToGenomes';
import { binSetHeatmap } from './binSetHeatmap';
import { syntenyLayout } from './syntenyLayout';
import { phylogenyVsCore } from './phylogenyVsCore';
import { coreGenome } from './coreGenome';
import { rarefaction, binSizeHistogram, enrichedTerms, binStats } from './bonus';

export type { FunctionModule, RendererProps, Renderer, RendererFamily } from './types';

export const functionModules: FunctionModule[] = [
  genomeOrganization,
  compareContrasts,
  binToGenomes,
  binSetHeatmap,
  syntenyLayout,
  phylogenyVsCore,
  coreGenome,
  rarefaction,
  binSizeHistogram,
  enrichedTerms,
  binStats,
];

export function getFunctionModule(id: string): FunctionModule | undefined {
  return functionModules.find((m) => m.id === id);
}
