import { z } from 'zod';

// Branded field-type system for the schema-driven UI (ARCHITECTURE.md §3).
//
// Every analysis function declares its inputs with these helpers. Each helper
// returns a Field = { schema, meta }: a zod schema plus the UI metadata that
// SchemaForm needs to render and populate the right input. Metadata is carried
// on the wrapper object (not a WeakMap) so it survives zod modifiers like
// `.optional()`. defineParams() assembles the fields into a zod object plus an
// ordered metadata list that drives rendering.

export type FieldKind =
  | 'text'
  | 'number'
  | 'bool'
  | 'enum'
  | 'binSelect'
  | 'binMultiSelect'
  | 'datasetSelect'
  | 'datasetMultiSelect'
  | 'genomeSelect'
  | 'statColumn';

export type DatasetType = 'pangenome' | 'contrast' | 'phylogenies';

// Where SchemaForm sources a field's options.
//  - 'static'      options are on meta.options (enum, statColumn)
//  - 'datasets'    GET /api/datasets?type=meta.datasetType
//  - 'bins'        GET /api/datasets/{dependsOn}/bins
//  - 'genomes'     GET /api/datasets/{dependsOn}/genomes
export type OptionsSource = 'static' | 'datasets' | 'bins' | 'genomes';

export interface Option {
  value: string;
  label: string;
}

export interface FieldMeta {
  label: string;
  kind: FieldKind;
  optional: boolean;
  multiple: boolean;
  optionsSource?: OptionsSource;
  datasetType?: DatasetType;
  /** Name of another field this field's options depend on (e.g. pangenomeId). */
  dependsOn?: string;
  /** Static options for enum / statColumn. */
  options?: Option[];
  min?: number;
  max?: number;
  step?: number;
  default?: unknown;
}

export interface Field<S extends z.ZodTypeAny = z.ZodTypeAny> {
  schema: S;
  meta: FieldMeta;
}

// Association stat columns available to statColumn() (ARCHITECTURE.md §3).
export const STAT_COLUMNS = [
  'Estimate',
  'signed_log10_qvalue',
  'pvalue',
  'qvalue',
  'neg_log10_qvalue',
] as const;

interface Opt {
  optional?: boolean;
  default?: unknown;
}

function maybeOptional<S extends z.ZodTypeAny>(schema: S, opts?: Opt) {
  return opts?.optional ? schema.optional() : schema;
}

export function text(label: string, opts?: Opt): Field {
  return {
    schema: maybeOptional(z.string(), opts),
    meta: { label, kind: 'text', optional: !!opts?.optional, multiple: false, default: opts?.default },
  };
}

export function number(
  label: string,
  opts?: Opt & { min?: number; max?: number; step?: number },
): Field {
  let base = z.number();
  if (opts?.min !== undefined) base = base.min(opts.min);
  if (opts?.max !== undefined) base = base.max(opts.max);
  return {
    schema: maybeOptional(base, opts),
    meta: {
      label,
      kind: 'number',
      optional: !!opts?.optional,
      multiple: false,
      min: opts?.min,
      max: opts?.max,
      step: opts?.step,
      default: opts?.default,
    },
  };
}

export function bool(label: string, opts?: Opt): Field {
  return {
    schema: maybeOptional(z.boolean(), opts),
    meta: { label, kind: 'bool', optional: !!opts?.optional, multiple: false, default: opts?.default ?? false },
  };
}

export function enumSelect(label: string, options: readonly string[], opts?: Opt): Field {
  const tuple = options as unknown as [string, ...string[]];
  return {
    schema: maybeOptional(z.enum(tuple), opts),
    meta: {
      label,
      kind: 'enum',
      optional: !!opts?.optional,
      multiple: false,
      optionsSource: 'static',
      options: options.map((v) => ({ value: v, label: v })),
      default: opts?.default,
    },
  };
}

export function statColumn(label: string, opts?: Opt): Field {
  return {
    schema: maybeOptional(z.enum(STAT_COLUMNS as unknown as [string, ...string[]]), opts),
    meta: {
      label,
      kind: 'statColumn',
      optional: !!opts?.optional,
      multiple: false,
      optionsSource: 'static',
      options: STAT_COLUMNS.map((v) => ({ value: v, label: v })),
      default: opts?.default ?? STAT_COLUMNS[0],
    },
  };
}

export function binSelect(label: string, opts: Opt & { dependsOn: string }): Field {
  return {
    schema: maybeOptional(z.string(), opts),
    meta: {
      label,
      kind: 'binSelect',
      optional: !!opts.optional,
      multiple: false,
      optionsSource: 'bins',
      dependsOn: opts.dependsOn,
      default: opts.default,
    },
  };
}

export function binMultiSelect(label: string, opts: Opt & { dependsOn: string }): Field {
  return {
    schema: maybeOptional(z.array(z.string()), opts),
    meta: {
      label,
      kind: 'binMultiSelect',
      optional: !!opts.optional,
      multiple: true,
      optionsSource: 'bins',
      dependsOn: opts.dependsOn,
      default: opts.default ?? [],
    },
  };
}

export function datasetSelect(label: string, type: DatasetType, opts?: Opt): Field {
  return {
    schema: maybeOptional(z.string(), opts),
    meta: {
      label,
      kind: 'datasetSelect',
      optional: !!opts?.optional,
      multiple: false,
      optionsSource: 'datasets',
      datasetType: type,
      default: opts?.default,
    },
  };
}

export function datasetMultiSelect(label: string, type: DatasetType, opts?: Opt): Field {
  return {
    schema: maybeOptional(z.array(z.string()), opts),
    meta: {
      label,
      kind: 'datasetMultiSelect',
      optional: !!opts?.optional,
      multiple: true,
      optionsSource: 'datasets',
      datasetType: type,
      default: opts?.default ?? [],
    },
  };
}

export function genomeSelect(label: string, opts: Opt & { dependsOn: string }): Field {
  return {
    schema: maybeOptional(z.string(), opts),
    meta: {
      label,
      kind: 'genomeSelect',
      optional: !!opts.optional,
      multiple: false,
      optionsSource: 'genomes',
      dependsOn: opts.dependsOn,
      default: opts.default,
    },
  };
}

export interface FieldEntry {
  name: string;
  meta: FieldMeta;
}

export interface ParamsDef {
  schema: z.ZodObject<z.ZodRawShape>;
  fields: FieldEntry[];
}

// Build a zod object schema + an ordered metadata list from named fields.
// Insertion order of the record is preserved and drives form layout.
export function defineParams(fields: Record<string, Field>): ParamsDef {
  const shape: z.ZodRawShape = {};
  const list: FieldEntry[] = [];
  for (const [name, f] of Object.entries(fields)) {
    shape[name] = f.schema;
    list.push({ name, meta: f.meta });
  }
  return { schema: z.object(shape), fields: list };
}

function defaultValue(meta: FieldMeta): unknown {
  if (meta.default !== undefined) return meta.default;
  switch (meta.kind) {
    case 'bool':
      return false;
    case 'number':
      return meta.min ?? 0;
    case 'binMultiSelect':
    case 'datasetMultiSelect':
      return [];
    case 'enum':
    case 'statColumn':
      return meta.options?.[0]?.value ?? '';
    default:
      return '';
  }
}

// Initial form value for a params definition (used when a function is selected).
export function defaultsFor(def: ParamsDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { name, meta } of def.fields) out[name] = defaultValue(meta);
  return out;
}

// Drop empty optional values so the JSON sent to the backend / stored in a
// figure record omits fields the user left blank, then validate against the schema.
export function cleanAndParse(def: ParamsDef, value: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  const byName = new Map(def.fields.map((f) => [f.name, f.meta]));
  for (const [name, v] of Object.entries(value)) {
    const meta = byName.get(name);
    if (!meta) continue;
    const empty = v === '' || v === undefined || (Array.isArray(v) && v.length === 0);
    if (meta.optional && empty) continue;
    cleaned[name] = v;
  }
  return def.schema.parse(cleaned) as Record<string, unknown>;
}
