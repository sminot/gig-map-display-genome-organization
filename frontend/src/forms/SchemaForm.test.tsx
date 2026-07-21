import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SchemaForm } from './SchemaForm';
import {
  defineParams,
  defaultsFor,
  text,
  number,
  bool,
  enumSelect,
  datasetSelect,
  binSelect,
} from '../schema/fields';
import type { ParamsDef } from '../schema/fields';
import * as api from '../api/client';

vi.mock('../api/client', () => ({
  getDatasets: vi.fn(),
  getBins: vi.fn(),
  getGenomes: vi.fn(),
}));

const mockApi = vi.mocked(api);

function Harness({ def }: { def: ParamsDef }) {
  const [value, setValue] = useState<Record<string, unknown>>(() => defaultsFor(def));
  return <SchemaForm def={def} value={value} onChange={setValue} />;
}

function AutoHarness({
  def,
  onSubmit,
  initial,
}: {
  def: ParamsDef;
  onSubmit: (params: Record<string, unknown>) => void;
  initial?: Record<string, unknown>;
}) {
  const [value, setValue] = useState<Record<string, unknown>>(() => initial ?? defaultsFor(def));
  return <SchemaForm def={def} value={value} onChange={setValue} onSubmit={onSubmit} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.getDatasets.mockResolvedValue([
    { id: 'p1', name: 'P1', type: 'pangenome', organism: 'o', path: '', source: '' },
    { id: 'p2', name: 'P2', type: 'pangenome', organism: 'o', path: '', source: '' },
  ]);
  mockApi.getBins.mockImplementation(async (id: string) => [
    { bin: `${id}-Bin 4`, n_genes: 374, n_genomes: 28 },
  ]);
});

describe('SchemaForm input rendering', () => {
  it('renders a native input per plain field kind', () => {
    const def = defineParams({
      note: text('Note'),
      threshold: number('Threshold', { min: 0, max: 1, step: 0.01 }),
      flag: bool('Flag'),
      colorBy: enumSelect('Color', ['bin', 'pident']),
    });
    render(<Harness def={def} />);

    expect(screen.getByLabelText('Note')).toHaveProperty('type', 'text');
    expect(screen.getByLabelText('Threshold')).toHaveProperty('type', 'number');
    expect(screen.getByLabelText('Flag')).toHaveProperty('type', 'checkbox');
    const enumSelectEl = screen.getByLabelText('Color') as HTMLSelectElement;
    expect(enumSelectEl.tagName).toBe('SELECT');
    expect([...enumSelectEl.options].map((o) => o.value)).toEqual(['', 'bin', 'pident']);
  });
});

describe('SchemaForm data-backed fields', () => {
  it('lazily loads dataset options from the API', async () => {
    const def = defineParams({ pangenomeId: datasetSelect('Pangenome', 'pangenome') });
    render(<Harness def={def} />);

    await waitFor(() => expect(mockApi.getDatasets).toHaveBeenCalledWith('pangenome'));
    await waitFor(() => expect(screen.getByRole('option', { name: 'P1' })).toBeDefined());
  });

  it('does not query bins until the pangenome dependency is set, then reloads on change', async () => {
    const def = defineParams({
      pangenomeId: datasetSelect('Pangenome', 'pangenome'),
      bin: binSelect('Bin', { dependsOn: 'pangenomeId' }),
    });
    render(<Harness def={def} />);

    // No dependency value yet -> bins not fetched.
    await waitFor(() => expect(mockApi.getDatasets).toHaveBeenCalled());
    expect(mockApi.getBins).not.toHaveBeenCalled();

    // Select p1 -> bins fetched for p1.
    fireEvent.change(screen.getByLabelText('Pangenome'), { target: { value: 'p1' } });
    await waitFor(() => expect(mockApi.getBins).toHaveBeenCalledWith('p1'));

    // Change to p2 -> bins reloaded for p2 (dependsOn re-load).
    fireEvent.change(screen.getByLabelText('Pangenome'), { target: { value: 'p2' } });
    await waitFor(() => expect(mockApi.getBins).toHaveBeenCalledWith('p2'));
    expect(mockApi.getBins).toHaveBeenCalledTimes(2);
  });
});

describe('SchemaForm auto-run', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires onSubmit after the debounce once params are valid', () => {
    const onSubmit = vi.fn();
    const def = defineParams({ threshold: number('Threshold', { min: 0 }) });
    render(<AutoHarness def={def} onSubmit={onSubmit} initial={{ threshold: 0 }} />);

    expect(onSubmit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ threshold: 0 });
  });

  it('does not fire while a required field is missing, then fires once valid', () => {
    const onSubmit = vi.fn();
    const def = defineParams({ threshold: number('Threshold', { min: 0 }) });
    render(<AutoHarness def={def} onSubmit={onSubmit} initial={{ threshold: '' }} />);

    vi.advanceTimersByTime(300);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '5' } });
    vi.advanceTimersByTime(300);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ threshold: 5 });
  });

  it('cancels a pending run so only the latest value fires', () => {
    const onSubmit = vi.fn();
    const def = defineParams({ threshold: number('Threshold', { min: 0 }) });
    render(<AutoHarness def={def} onSubmit={onSubmit} initial={{ threshold: 1 }} />);

    // Two edits before the debounce elapses -> earlier schedules are cancelled.
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '9' } });
    vi.advanceTimersByTime(300);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ threshold: 9 });
  });
});
