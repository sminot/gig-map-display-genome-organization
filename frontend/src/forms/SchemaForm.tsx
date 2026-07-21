import { useEffect, useRef, useState } from 'react';
import type { FieldEntry, FieldMeta, Option, ParamsDef } from '../schema/fields';
import { cleanAndParse } from '../schema/fields';
import * as api from '../api/client';

// The ONE common form engine (ARCHITECTURE.md §3). Given a ParamsDef it renders
// one input per field kind. Plain kinds (text/number/bool/enum/statColumn) use
// native inputs; the data-backed kinds (bin/genome/dataset selects) lazily fetch
// their options from the API, resolving `dependsOn` against the current form
// value and re-loading when that dependency changes.

export interface SchemaFormProps {
  def: ParamsDef;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  onSubmit?: (params: Record<string, unknown>) => void;
}

// Resolve a field's options against the current form value.
async function loadOptions(
  meta: FieldMeta,
  form: Record<string, unknown>,
): Promise<Option[]> {
  switch (meta.optionsSource) {
    case 'static':
      return meta.options ?? [];
    case 'datasets': {
      const rows = await api.getDatasets(meta.datasetType);
      return rows.map((d) => ({ value: d.id, label: d.name }));
    }
    case 'bins': {
      const pid = meta.dependsOn ? (form[meta.dependsOn] as string) : undefined;
      if (!pid) return [];
      const rows = await api.getBins(pid);
      return rows.map((b) => ({
        value: b.bin,
        label: `${b.bin} (${b.n_genes} genes, ${b.n_genomes} genomes)`,
      }));
    }
    case 'genomes': {
      const pid = meta.dependsOn ? (form[meta.dependsOn] as string) : undefined;
      if (!pid) return [];
      const rows = await api.getGenomes(pid);
      return rows.map((g) => ({ value: g.genome, label: g.genome }));
    }
    default:
      return [];
  }
}

const DATA_KINDS: FieldMeta['kind'][] = [
  'binSelect',
  'binMultiSelect',
  'datasetSelect',
  'datasetMultiSelect',
  'genomeSelect',
];

function FieldControl({
  entry,
  form,
  onField,
}: {
  entry: FieldEntry;
  form: Record<string, unknown>;
  onField: (name: string, v: unknown) => void;
}) {
  const { name, meta } = entry;
  const [options, setOptions] = useState<Option[]>(meta.options ?? []);
  const [loading, setLoading] = useState(false);
  const dependencyValue = meta.dependsOn ? form[meta.dependsOn] : undefined;

  const isDataKind = DATA_KINDS.includes(meta.kind);

  // Lazy-load options for data-backed kinds; re-run when the dependency changes.
  useEffect(() => {
    if (!isDataKind) return;
    let cancelled = false;
    setLoading(true);
    loadOptions(meta, form)
      .then((opts) => {
        if (!cancelled) setOptions(opts);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // form is intentionally not a dep; only the resolved dependency value is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.optionsSource, meta.datasetType, meta.dependsOn, dependencyValue]);

  const labelId = `field-${name}`;

  if (meta.kind === 'bool') {
    return (
      <label className="sf-field" htmlFor={labelId}>
        <span className="sf-label">{meta.label}</span>
        <input
          id={labelId}
          type="checkbox"
          checked={!!form[name]}
          onChange={(e) => onField(name, e.target.checked)}
        />
      </label>
    );
  }

  if (meta.kind === 'number') {
    return (
      <label className="sf-field" htmlFor={labelId}>
        <span className="sf-label">{meta.label}</span>
        <input
          id={labelId}
          type="number"
          min={meta.min}
          max={meta.max}
          step={meta.step ?? 'any'}
          value={form[name] as number | string}
          onChange={(e) => onField(name, e.target.value === '' ? '' : Number(e.target.value))}
        />
      </label>
    );
  }

  if (meta.kind === 'text') {
    return (
      <label className="sf-field" htmlFor={labelId}>
        <span className="sf-label">{meta.label}</span>
        <input
          id={labelId}
          type="text"
          value={(form[name] as string) ?? ''}
          onChange={(e) => onField(name, e.target.value)}
        />
      </label>
    );
  }

  // Multi-select (bins / datasets sets).
  if (meta.multiple) {
    const selected = (form[name] as string[]) ?? [];
    return (
      <fieldset className="sf-field sf-multi" aria-labelledby={labelId}>
        <legend id={labelId} className="sf-label">
          {meta.label}
          {loading ? ' (loading…)' : ''}
        </legend>
        {options.length === 0 && !loading ? (
          <span className="sf-empty">No options</span>
        ) : (
          options.map((o) => (
            <label key={o.value} className="sf-check">
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, o.value]
                    : selected.filter((v) => v !== o.value);
                  onField(name, next);
                }}
              />
              {o.label}
            </label>
          ))
        )}
      </fieldset>
    );
  }

  // Single-select (enum, statColumn, and single data-backed selects).
  return (
    <label className="sf-field" htmlFor={labelId}>
      <span className="sf-label">
        {meta.label}
        {loading ? ' (loading…)' : ''}
      </span>
      <select
        id={labelId}
        value={(form[name] as string) ?? ''}
        onChange={(e) => onField(name, e.target.value)}
      >
        <option value="">{meta.optional ? '(none)' : '(select…)'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const DEBOUNCE_MS = 300;

// A required field left empty ('' / undefined / empty array) still passes zod
// (z.string() accepts ''), so cleanAndParse alone isn't enough to know the form
// is ready — auto-run must also confirm every non-optional field is filled.
function requiredFieldMissing(def: ParamsDef, value: Record<string, unknown>): boolean {
  return def.fields.some(({ name, meta }) => {
    if (meta.optional) return false;
    const v = value[name];
    return v === '' || v === undefined || v === null || (Array.isArray(v) && v.length === 0);
  });
}

export function SchemaForm({ def, value, onChange, onSubmit }: SchemaFormProps) {
  const onField = (name: string, v: unknown) => {
    const next = { ...value, [name]: v };
    // Clear dependent fields when their dependency changes so stale ids aren't submitted.
    for (const f of def.fields) {
      if (f.meta.dependsOn === name) next[f.name] = f.meta.multiple ? [] : '';
    }
    onChange(next);
  };

  // Auto-run: whenever the value (or function) changes and the params validate,
  // fire onSubmit debounced. Incomplete/invalid params just don't run. The pending
  // call is cancelled on the next change, when the function changes, and on unmount.
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  useEffect(() => {
    const submit = onSubmitRef.current;
    if (!submit) return;
    if (requiredFieldMissing(def, value)) return;
    let params: Record<string, unknown>;
    try {
      params = cleanAndParse(def, value);
    } catch {
      return;
    }
    const timer = setTimeout(() => submit(params), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [def, value]);

  return (
    <form className="schema-form" onSubmit={(e) => e.preventDefault()}>
      {def.fields.map((entry) => (
        <FieldControl key={entry.name} entry={entry} form={value} onField={onField} />
      ))}
    </form>
  );
}
