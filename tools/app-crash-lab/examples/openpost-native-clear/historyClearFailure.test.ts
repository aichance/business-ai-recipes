// App Crash Lab — MIT. Copy into OpenPost's existing tests/ directory.
// This exercises the real store with a mocked Tauri IPC boundary, not SQLite
// or an actual desktop/WebView. All records below are synthetic; no HTTP runs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHistoryStore, type HistoryEntry } from '../src/stores/historyStore';
import { useToastStore } from '../src/stores/toastStore';

const rpc = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: rpc.invoke }));

const baseline: HistoryEntry[] = [
  {
    id: 'crash-lab-history-newer', timestamp: 1710000002000,
    method: 'POST', url: 'https://example.test/synthetic/newer',
    headersJson: '{"Accept":"application/json"}',
    body: '{"record":"synthetic-newer"}', bodyType: 'json',
    responseStatus: 201, responseStatusText: 'Created',
    responseDurationMs: 21, responseSizeBytes: 73,
    error: 'synthetic diagnostic, not a credential',
  },
  {
    id: 'crash-lab-history-older', timestamp: 1710000001000,
    method: 'GET', url: 'https://example.test/synthetic/older',
    headersJson: '{"Accept":"text/plain"}',
    body: 'synthetic-older', bodyType: 'text',
    responseStatus: 200, responseStatusText: 'OK',
    responseDurationMs: 15, responseSizeBytes: 42, error: '',
  },
];

function backendRecord(entry: HistoryEntry) {
  return {
    id: entry.id, timestamp: entry.timestamp, method: entry.method,
    url: entry.url, headers_json: entry.headersJson,
    body: entry.body, body_type: entry.bodyType,
    response_status: entry.responseStatus,
    response_status_text: entry.responseStatusText,
    response_duration_ms: entry.responseDurationMs,
    response_size_bytes: entry.responseSizeBytes, error: entry.error,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const previousTauri = Object.getOwnPropertyDescriptor(window, '__TAURI_INTERNALS__');
let stored = baseline.map(backendRecord);
let clearResult: () => Promise<void>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true, value: {},
  });
  useHistoryStore.setState({
    entries: structuredClone(baseline), searchQuery: '', isLoading: false,
  });
  useToastStore.setState({ toasts: [] });
  stored = baseline.map(backendRecord);
  clearResult = async () => { stored = []; };
  rpc.invoke.mockReset();
  rpc.invoke.mockImplementation(async (command: string) => {
    if (command === 'clear_history') return clearResult();
    if (command === 'get_history') return structuredClone(stored);
    throw new Error(`Unexpected IPC command in this test: ${command}`);
  });
});

afterEach(() => {
  if (previousTauri) {
    Object.defineProperty(window, '__TAURI_INTERNALS__', previousTauri);
  } else {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  }
  useHistoryStore.setState({ entries: [], searchQuery: '', isLoading: false });
  useToastStore.setState({ toasts: [] });
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('history clear completion contract at the Tauri IPC boundary', () => {
  it('control: successful clear remains empty after the real loadHistory path', async () => {
    await useHistoryStore.getState().clearHistory();
    expect(rpc.invoke).toHaveBeenCalledWith('clear_history');
    expect(useHistoryStore.getState().entries).toEqual([]);
    expect(useToastStore.getState().toasts.map((item) => item.title))
      .toContain('History Cleared');
    await useHistoryStore.getState().loadHistory();
    expect(rpc.invoke).toHaveBeenCalledWith('get_history');
    expect(useHistoryStore.getState().entries).toEqual([]);
  });

  it('control: a pending clear does not announce completion', async () => {
    const entered = deferred();
    const release = deferred();
    clearResult = async () => {
      entered.resolve();
      await release.promise;
      stored = [];
    };
    const running = useHistoryStore.getState().clearHistory();
    await entered.promise;
    try {
      expect(useToastStore.getState().toasts.map((item) => item.title))
        .not.toContain('History Cleared');
      expect(stored).toEqual(baseline.map(backendRecord));
    } finally {
      release.resolve();
      await running;
    }
  });

  it('rejected clear keeps full visible history and never claims it was cleared', async () => {
    clearResult = async () => { throw new Error('synthetic clear_history refusal'); };
    await useHistoryStore.getState().clearHistory();
    expect(rpc.invoke).toHaveBeenCalledWith('clear_history');
    expect.soft(useHistoryStore.getState().entries, 'full history after rejected clear')
      .toEqual(baseline);
    expect.soft(useToastStore.getState().toasts.map((item) => item.title),
      'completion notice after rejected clear').not.toContain('History Cleared');
    // Re-read the unchanged mock backend through the original mapper. This is
    // store rehydration, not browser reload or a real SQLite persistence proof.
    await useHistoryStore.getState().loadHistory();
    expect(rpc.invoke).toHaveBeenCalledWith('get_history');
    expect(useHistoryStore.getState().entries).toEqual(baseline);
  });
});
