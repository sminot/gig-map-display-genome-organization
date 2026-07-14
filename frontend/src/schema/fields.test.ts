import { describe, it, expect } from 'vitest';
import {
  defineParams,
  defaultsFor,
  cleanAndParse,
  text,
  number,
  bool,
  enumSelect,
  statColumn,
  binSelect,
  binMultiSelect,
  datasetSelect,
  datasetMultiSelect,
  genomeSelect,
  STAT_COLUMNS,
} from './fields';

describe('field metadata', () => {
  it('attaches kind, label and optional flag', () => {
    expect(text('Name').meta).toMatchObject({ label: 'Name', kind: 'text', optional: false });
    expect(text('Name', { optional: true }).meta.optional).toBe(true);
    expect(bool('Flag').meta.kind).toBe('bool');
  });

  it('records numeric constraints', () => {
    const f = number('Threshold', { min: 0, max: 1, step: 0.01, default: 0.9 });
    expect(f.meta).toMatchObject({ kind: 'number', min: 0, max: 1, step: 0.01, default: 0.9 });
  });

  it('carries static options for enum and statColumn', () => {
    const e = enumSelect('Color', ['bin', 'pident']);
    expect(e.meta.optionsSource).toBe('static');
    expect(e.meta.options).toEqual([
      { value: 'bin', label: 'bin' },
      { value: 'pident', label: 'pident' },
    ]);
    const s = statColumn('Stat');
    expect(s.meta.options?.map((o) => o.value)).toEqual([...STAT_COLUMNS]);
    expect(s.meta.default).toBe(STAT_COLUMNS[0]);
  });

  it('records optionsSource / datasetType / dependsOn for data-backed kinds', () => {
    expect(datasetSelect('P', 'pangenome').meta).toMatchObject({
      kind: 'datasetSelect',
      optionsSource: 'datasets',
      datasetType: 'pangenome',
    });
    expect(datasetMultiSelect('C', 'contrast').meta).toMatchObject({
      kind: 'datasetMultiSelect',
      multiple: true,
      datasetType: 'contrast',
    });
    expect(binSelect('Bin', { dependsOn: 'pangenomeId' }).meta).toMatchObject({
      kind: 'binSelect',
      optionsSource: 'bins',
      dependsOn: 'pangenomeId',
    });
    expect(binMultiSelect('Bins', { dependsOn: 'pangenomeId' }).meta.multiple).toBe(true);
    expect(genomeSelect('G', { dependsOn: 'pangenomeId' }).meta).toMatchObject({
      kind: 'genomeSelect',
      optionsSource: 'genomes',
      dependsOn: 'pangenomeId',
    });
  });
});

describe('defineParams', () => {
  const def = defineParams({
    pangenomeId: datasetSelect('Pangenome', 'pangenome'),
    bin: binSelect('Bin', { dependsOn: 'pangenomeId' }),
    threshold: number('Threshold', { min: 0, max: 1, default: 0.9 }),
    note: text('Note', { optional: true }),
  });

  it('preserves field order', () => {
    expect(def.fields.map((f) => f.name)).toEqual(['pangenomeId', 'bin', 'threshold', 'note']);
  });

  it('produces defaults for each field', () => {
    expect(defaultsFor(def)).toEqual({
      pangenomeId: '',
      bin: '',
      threshold: 0.9,
      note: '',
    });
  });

  it('validates and serializes to JSON', () => {
    const parsed = cleanAndParse(def, {
      pangenomeId: 'p1',
      bin: 'Bin 4',
      threshold: 0.9,
      note: '',
    });
    // Optional empty `note` is dropped; result is plain JSON.
    expect(parsed).toEqual({ pangenomeId: 'p1', bin: 'Bin 4', threshold: 0.9 });
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
  });

  it('rejects invalid values', () => {
    expect(() =>
      cleanAndParse(def, { pangenomeId: 'p1', bin: 'Bin 4', threshold: 2 }),
    ).toThrow();
    expect(() =>
      cleanAndParse(def, { pangenomeId: 123, bin: 'Bin 4', threshold: 0.5 }),
    ).toThrow();
  });

  it('enforces enum membership', () => {
    const d = defineParams({ stat: statColumn('Stat') });
    expect(() => cleanAndParse(d, { stat: 'not_a_stat' })).toThrow();
    expect(cleanAndParse(d, { stat: 'pvalue' })).toEqual({ stat: 'pvalue' });
  });
});
