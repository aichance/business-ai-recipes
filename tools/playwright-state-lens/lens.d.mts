/** Types only; the runtime remains the common lens.mjs. MIT. */
export type StateLensProbe =
  | ({ name: string; source: 'localStorage' | 'sessionStorage'; key: string }
      & ({ json?: boolean; pointer?: never } | { json: true; pointer: string }))
  | { name: string; source: 'indexedDB'; database: string; store: string; key: string | number; pointer?: string };
export interface StateLensOptions {
  /** Runtime validation still requires 1–16 valid probes, including when options are omitted. */
  probes?: readonly StateLensProbe[];
  timeoutMs?: number;
  screenshots?: boolean;
  title?: string;
}
export type StateLensObservation =
  | { status: 'OBSERVED'; exists: boolean; value: unknown;
      /** exists above describes the storage key; this describes the selected JSON pointer. */
      selection?: { pointer: string; exists: boolean };
      valueEncoding?: 'json-with-undefined-paths-v1' | 'json-with-type-paths-v1';
      undefinedPaths?: string[]; datePaths?: string[] }
  | { status: 'INCONCLUSIVE'; reason: string };
export interface StateLensDifference { path: string; before: unknown; after: unknown }
export interface StateLensCheckpoint {
  index: number;
  label: string;
  observedAt: string;
  url: string;
  endURL: string;
  origin: string | null;
  selectedOrigin: string | null;
  scopeStatus: 'SELECTED_ORIGIN' | 'OUTSIDE_ORIGIN';
  action: { status: 'BEFORE' | 'COMPLETED' | 'FAILED' | 'CHECKPOINT'; error?: string };
  values: Record<string, StateLensObservation>;
  changes: StateLensDifference[];
  screenshot: string | null;
  screenshotError: string | null;
}
export interface StateLensReport {
  schema: 4;
  libraryVersion: string;
  title: string;
  probes: StateLensProbe[];
  checkpoints: StateLensCheckpoint[];
}
export interface StateLens {
  checkpoint(label: string): Promise<StateLensCheckpoint>;
  step<T>(label: string, action: () => T): Promise<Awaited<T>>;
  report(): StateLensReport;
  writeHTML(path: string): Promise<void>;
}
/** The caller supplies its existing Page; no Playwright type package is imported here. */
export function createStateLens(page: any, options?: StateLensOptions): StateLens;
export function differences(before: unknown, after: unknown, path?: string, output?: StateLensDifference[]): StateLensDifference[];
/** The renderer also accepts earlier report shapes; this is its common display surface. */
export function renderTimeline(report: {
  title: string; schema?: number; libraryVersion?: string;
  checkpoints: readonly {
    label: string; action: { status: string; error?: string };
    values: Record<string, unknown>; changes: readonly unknown[];
    observedAt?: string; origin?: string | null; scopeStatus?: string;
    screenshot?: string | null; screenshotError?: string | null;
  }[];
}): string;
