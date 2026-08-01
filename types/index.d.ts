/**
 * Public types for gig-map-display-genome-organization.
 *
 * `schema/genome-display-config.schema.json` is the normative definition of
 * GenomeDisplayConfig; these declarations mirror it for TypeScript callers.
 */

/** One row of a gig-map alignment table. Extra columns are carried through. */
export interface AlignmentRow {
  /** Contig or chromosome id within the genome. */
  qseqid: string;
  /** Gene or protein id. */
  sseqid: string;
  /** Percent identity of the alignment. */
  pident: number;
  /** Alignment length, in bases. */
  length: number;
  /** Gene start on the contig. */
  qstart: number;
  /** Gene end on the contig. */
  qend: number;
  /** Total contig length. */
  qlen: number;
  /** Alignment start within the gene. */
  sstart: number;
  /** Alignment end within the gene. */
  send: number;
  /** Total gene length. */
  slen: number;
  /** Genome identifier. */
  genome: string;
  /** Percent of the gene covered by the alignment. */
  coverage: number;
  [column: string]: string | number | null | undefined;
}

/** A row of gene or genome annotation. The identifier is the first key. */
export type AnnotationRow = Record<string, string | number | null | undefined>;

export type Theme = 'dark' | 'light';
export type GeneDisplayMode = 'bars' | 'arrows';
export type PaletteName =
  | 'Tableau10' | 'Pastel1' | 'Set1' | 'Set2' | 'Set3' | 'Accent' | 'Dark2' | 'Paired';

/**
 * Which data to display. Rows win over URLs, so a host whose backend has already
 * subset the alignment never triggers a fetch.
 */
export interface GenomeDisplayData {
  alignmentUrl?: string | null;
  geneAnnotationUrl?: string | null;
  genomeAnnotationUrl?: string | null;
  rows?: AlignmentRow[] | null;
  geneAnnotationRows?: AnnotationRow[] | null;
  genomeAnnotationRows?: AnnotationRow[] | null;
}

export interface GeneAnnotationConfig {
  /** Column driving the gene highlight track. Null disables the track. */
  categoryColumn?: string | null;
  /** Column shown as the gene name in the tooltip. */
  labelColumn?: string | null;
  /** Highlighted category values. Empty highlights nothing. */
  selectedCategories?: string[];
  /** Per-category colour overrides, as `#rrggbb`. */
  customColors?: Record<string, string>;
  displayMode?: GeneDisplayMode;
}

export interface GenomeAnnotationConfig {
  colorColumn?: string | null;
  /** Groups and sorts rings; overrides colorColumn for colour and sortColumn for order. */
  groupColumn?: string | null;
  labelColumn?: string | null;
  tooltipColumns?: string[];
  sortColumn?: string | null;
  sortAscending?: boolean;
  palette?: PaletteName;
}

/**
 * The magnifying wedge. These are spring targets, not a mid-animation sample:
 * applying a config snaps to them, so a rehydrated display reproduces the view.
 */
export interface ZoomConfig {
  /** Genome angle at the wedge centre, radians clockwise from 12 o'clock. 0 to 2π. */
  focusAngle?: number;
  /** Angular magnification, 1 to 50. 1 hides the wedge. */
  zoomLevel?: number;
  /** Wedge width as a fraction of the circle, 0.1 to 0.5. */
  wedgeSpan?: number;
  /** Pixel gap between the circle and the wedge, 0 to 80. */
  wedgeGap?: number;
  /** Radial share of the viewport given to the wedge, 2 to 10. */
  wedgeHeightScale?: number;
}

/**
 * Everything needed to reproduce a display, except the data itself, which is
 * referenced rather than embedded.
 *
 * Not present because it is derived: the d3 colour scales, the wedge's radius
 * scale, and the canvas pixel size (the display follows its container).
 * Not present because it is transient: hover state, tooltip visibility, combobox
 * open state, and the sidebar filter boxes.
 */
export interface GenomeDisplayConfig {
  /** Config schema version. A newer version than the build understands is rejected. */
  version?: number;
  data?: GenomeDisplayData;
  /** Genome drawn as the outer contig ring. Null picks the first alphabetically. */
  referenceGenome?: string | null;
  /** Genomes drawn as inner rings. Null means all except the reference. */
  visibleGenomes?: string[] | null;
  /** Input-only alias for the complement of `visibleGenomes`. Ignored when that is set. */
  hiddenGenomes?: string[] | null;
  /** Explicit ring order, as produced by the gene-content sort. */
  genomeOrder?: string[] | null;
  geneAnnotation?: GeneAnnotationConfig;
  genomeAnnotation?: GenomeAnnotationConfig;
  zoom?: ZoomConfig;
  theme?: Theme;
  /** Render the built-in sidebar. False mounts the figure alone. */
  controls?: boolean;
  /** Start with the sidebar collapsed. Ignored when `controls` is false. */
  controlsCollapsed?: boolean;
}

export interface DisplayHandle {
  /**
   * Re-render in place. Never remounts: the DOM subtree, the canvas and the WebGL
   * context are all preserved. Throws if `controls` differs from the mounted value,
   * since that would require rebuilding the DOM.
   */
  update(config: GenomeDisplayConfig): void;

  /** Serialise the current figure as SVG. Every layer is vector; nothing is rasterised. */
  toSVG(): string;

  /**
   * Raster snapshot of the composited layers, for thumbnails. A `scale` above 1
   * resamples rather than re-rendering; use `toSVG` when output has to scale.
   */
  toPNG(scale?: number): Promise<Blob>;

  /**
   * Release the WebGL context, all listeners, and both resize observers, and empty
   * the container. Required on unmount: a browser allows only a handful of live
   * WebGL contexts and silently drops the oldest beyond that.
   */
  destroy(): void;

  /** The config that reproduces what is on screen, including sidebar changes. */
  getConfig(): Required<GenomeDisplayConfig>;

  /** Subscribe to config changes. Returns an unsubscribe function. */
  onChange(listener: (config: Required<GenomeDisplayConfig>) => void): () => void;

  /**
   * Subscribe to data-loading failures. Returns an unsubscribe function. Only
   * relevant when the config references data by URL. With no sidebar to show the
   * error in and no listener subscribed, the error is thrown instead of swallowed.
   */
  onError(listener: (error: Error) => void): () => void;
}

/**
 * Mount a display into `el`, replacing its contents. Returns synchronously; when
 * the config references data by URL, the figure appears once the fetch completes.
 */
export function mount(el: HTMLElement, config?: GenomeDisplayConfig): DisplayHandle;

export const CONFIG_VERSION: number;
export function defaultConfig(): Required<GenomeDisplayConfig>;
/** Throw on the first schema violation, otherwise return the config unchanged. */
export function validateConfig<T extends GenomeDisplayConfig>(config: T): T;
export const PALETTE_NAMES: PaletteName[];
/** WebGL contexts this module currently holds open. Diagnostic for leak tests. */
export function liveContextCount(): number;
