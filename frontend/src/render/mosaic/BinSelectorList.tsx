import type { CSSProperties } from 'react';

// Amber selection highlight, shared by this list and the in-chart selection marks.
export const SELECT_STROKE = '#f59e0b';

const listStyle = (maxHeight: number): CSSProperties => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  maxHeight,
  overflowY: 'auto',
});

function buttonStyle(selected: boolean): CSSProperties {
  return {
    border: `1px solid ${selected ? SELECT_STROKE : 'var(--border)'}`,
    background: selected ? SELECT_STROKE : 'var(--panel)',
    color: selected ? '#1a1d24' : 'var(--text)',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  };
}

export interface BinSelectorListProps {
  bins: string[];
  selectedBin?: string | null;
  onSelectBin?: (bin: string | null) => void;
  maxHeight?: number;
}

// A wrap-flowing list of clickable bins driving linked selection, used where a
// Mosaic mark can't emit a per-bin click. Clicking the selected bin clears it.
export function BinSelectorList({ bins, selectedBin, onSelectBin, maxHeight = 96 }: BinSelectorListProps) {
  return (
    <div style={listStyle(maxHeight)} role="listbox" aria-label="Select a bin">
      {bins.map((bin) => (
        <button
          key={bin}
          type="button"
          role="option"
          aria-selected={bin === selectedBin}
          style={buttonStyle(bin === selectedBin)}
          onClick={() => onSelectBin?.(bin === selectedBin ? null : bin)}
        >
          {bin}
        </button>
      ))}
    </div>
  );
}
