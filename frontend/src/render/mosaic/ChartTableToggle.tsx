export type ChartTableView = 'chart' | 'table';

export interface ChartTableToggleProps {
  value: ChartTableView;
  onChange: (v: ChartTableView) => void;
}

// The Chart/Table switch shared by tabular Mosaic renderers.
export function ChartTableToggle({ value, onChange }: ChartTableToggleProps) {
  return (
    <div className="mosaic-toolbar">
      <button type="button" className={value === 'chart' ? 'active' : ''} onClick={() => onChange('chart')}>
        Chart
      </button>
      <button type="button" className={value === 'table' ? 'active' : ''} onClick={() => onChange('table')}>
        Table
      </button>
    </div>
  );
}
