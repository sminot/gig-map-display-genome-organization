import type { FC } from 'react';
import type { RunResult } from '../api/client';
import type { ParamsDef } from '../schema/fields';

export type RendererFamily = 'webgl' | 'mosaic' | 'svg';

// Props every Renderer receives: the validated params that produced the result,
// and the result itself (arrow | json | plotly). Renderers may register export
// handlers via useRegisterExport() (see session/exports.tsx).
export interface RendererProps {
  params: Record<string, unknown>;
  result: RunResult;
}

export type Renderer = FC<RendererProps>;

// A single analysis function. Wave-2 agents replace ONLY `Renderer` for the
// modules assigned to their family; everything else here is fixed by the contract.
export interface FunctionModule {
  id: string;
  title: string;
  category: string;
  description: string;
  /** Which renderer family owns this module (informational; drives the placeholder banner). */
  family: RendererFamily;
  /** Input schema built with defineParams(); rendered by the single SchemaForm. */
  params: ParamsDef;
  Renderer: Renderer;
}
