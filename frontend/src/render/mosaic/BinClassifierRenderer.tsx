import { useState } from 'react';
import { tableFromJSON } from 'apache-arrow';
import type { RendererProps } from '../../figures/types';
import { useRegisterExport } from '../../session/exports';
import { registerArrow, type VG } from './mosaicClient';
import { MosaicChart } from './MosaicChart';
import { domainByMetric, recordsToCsv, type Row } from './dataShaping';
import './mosaic.css';

const ROC = 'bin_classifier_roc';
const ROC_DIAGONAL = 'bin_classifier_roc_diag';
const IMPORTANCE = 'bin_classifier_importance';

type ImportanceMetric = 'gain' | 'meanAbsShap';

const METRIC_LABEL: Record<ImportanceMetric, string> = {
  gain: 'gain',
  meanAbsShap: 'mean|SHAP|',
};

interface ClassifierMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number;
  cvRocAucMean: number;
  cvRocAucStd: number;
}

interface FeatureImportance extends Row {
  feature: string;
  gain: number;
  meanAbsShap: number;
}

interface BinClassifierResult {
  label: string;
  task: 'binary';
  nSamples: number;
  nFeatures: number;
  nPositive: number;
  nNegative: number;
  metrics: ClassifierMetrics;
  roc: { fpr: number; tpr: number }[];
  confusion: { tn: number; fp: number; fn: number; tp: number };
  importance: FeatureImportance[];
}

function fmt(v: number): string {
  return Number.isFinite(v) ? v.toFixed(3) : 'n/a';
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="metric-tile">
      <div className="metric-tile-value">{value}</div>
      <div className="metric-tile-label">{label}</div>
      {sub && <div className="metric-tile-sub">{sub}</div>}
    </div>
  );
}

export function BinClassifierRenderer({ result }: RendererProps) {
  const data = result.kind === 'json' ? (result.data as BinClassifierResult) : null;
  const [metric, setMetric] = useState<ImportanceMetric>('gain');

  useRegisterExport(
    {
      json: () => data,
      csv: () => recordsToCsv(data?.importance ?? [], ['feature', 'gain', 'meanAbsShap']),
    },
    [data],
  );

  const buildRoc = (vg: VG) => {
    const rocTable = tableFromJSON(
      (data?.roc ?? []).map((p) => ({ fpr: Number(p.fpr), tpr: Number(p.tpr) })),
    );
    const diagTable = tableFromJSON([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    return Promise.all([
      registerArrow(ROC, rocTable),
      registerArrow(ROC_DIAGONAL, diagTable),
    ]).then(() =>
      vg.plot(
        vg.line(vg.from(ROC_DIAGONAL), { x: 'x', y: 'y', stroke: '#9aa2b1', strokeDasharray: '4,4' }),
        vg.line(vg.from(ROC), { x: 'fpr', y: 'tpr', stroke: '#2f6feb', strokeWidth: 2 }),
        vg.xDomain([0, 1]),
        vg.yDomain([0, 1]),
        vg.xLabel('false positive rate'),
        vg.yLabel('true positive rate'),
        vg.width(420),
        vg.height(420),
      ),
    );
  };

  const buildImportance = (vg: VG) => {
    const rows = data?.importance ?? [];
    const order = domainByMetric(rows, 'feature', metric, true);
    const importanceTable = tableFromJSON(
      rows.map((r) => ({ feature: String(r.feature), value: Number(r[metric]) })),
    );
    return registerArrow(IMPORTANCE, importanceTable).then(() =>
      vg.plot(
        vg.barX(vg.from(IMPORTANCE), { x: 'value', y: 'feature', fill: '#2f6feb' }),
        vg.yDomain(order),
        vg.xLabel(METRIC_LABEL[metric]),
        vg.yLabel('feature'),
        vg.marginLeft(180),
        vg.width(760),
        vg.height(Math.max(160, order.length * 20 + 60)),
      ),
    );
  };

  if (!data) return <div className="mosaic-error">expected JSON result</div>;

  const { metrics, confusion } = data;

  return (
    <div className="mosaic-view bin-classifier">
      <div className="classifier-metrics">
        <Tile label="ROC-AUC" value={fmt(metrics.rocAuc)} />
        <Tile
          label="CV ROC-AUC"
          value={`${fmt(metrics.cvRocAucMean)} ± ${fmt(metrics.cvRocAucStd)}`}
        />
        <Tile label="accuracy" value={fmt(metrics.accuracy)} />
        <Tile label="F1" value={fmt(metrics.f1)} />
        <Tile
          label="samples"
          value={String(data.nSamples)}
          sub={`${data.nPositive} pos / ${data.nNegative} neg`}
        />
      </div>

      <section>
        <h4>ROC curve</h4>
        <MosaicChart build={buildRoc} deps={[data]} />
      </section>

      <section>
        <h4>Feature importance</h4>
        <div className="mosaic-toolbar">
          {(['gain', 'meanAbsShap'] as ImportanceMetric[]).map((m) => (
            <button
              key={m}
              type="button"
              className={metric === m ? 'active' : ''}
              onClick={() => setMetric(m)}
            >
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
        <MosaicChart build={buildImportance} deps={[data, metric]} />
      </section>

      <section>
        <h4>Confusion matrix (predicted × actual)</h4>
        <table className="mosaic-table confusion-matrix">
          <thead>
            <tr>
              <th />
              <th>actual +</th>
              <th>actual −</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>predicted +</th>
              <td>{confusion.tp}</td>
              <td>{confusion.fp}</td>
            </tr>
            <tr>
              <th>predicted −</th>
              <td>{confusion.fn}</td>
              <td>{confusion.tn}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
