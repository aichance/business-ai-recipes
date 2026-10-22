// Dependency-free, data-layer relationship check. Does not compare record values.
class InvalidGraph extends Error {}
const invalid = message => { throw new InvalidGraph(message); };
const text = (value, where) => {
  if (typeof value !== 'string' || !value.trim()) invalid(`${where}: expected a nonempty string`);
  return value; // Never trim, coerce IDs, or combine keys with a delimiter.
};
const list = (value, where) => {
  if (!Array.isArray(value)) invalid(`${where}: expected an array`);
  return value;
};
const record = (value, where) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${where}: expected an object`);
};
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function graph(input, actual) {
  const side = actual ? 'actual' : 'expected';
  record(input, side);
  const nodes = list(input.nodes, `${side}.nodes`);
  const edges = list(input.edges, `${side}.edges`);
  if (!actual && (!nodes.length || !edges.length)) invalid('expected: baseline must contain nodes and at least one reviewed relationship');
  const keys = new Set();
  const identities = new Map();
  for (const [index, node] of nodes.entries()) {
    const where = `${side}.nodes[${index}]`;
    if (actual) record(node, where);
    const key = text(actual ? node.key : node, `${where}.key`);
    if (keys.has(key)) invalid(`${where}: duplicate semantic key ${JSON.stringify(key)}`);
    keys.add(key);
    if (actual) {
      const id = text(node.id, `${where}.id`);
      if (identities.has(id)) invalid(`${where}: duplicate record id ${JSON.stringify(id)}`);
      identities.set(id, key);
    }
  }
  const counts = new Map();
  for (const [index, edge] of edges.entries()) {
    const where = `${side}.edges[${index}]`;
    record(edge, where);
    const type = text(edge.type, `${where}.type`);
    const resolve = field => {
      const value = text(edge[field], `${where}.${field}`);
      if (actual) {
        if (!identities.has(value)) invalid(`${where}.${field}: unresolved record id ${JSON.stringify(value)}`);
        return identities.get(value);
      }
      if (!keys.has(value)) invalid(`${where}.${field}: unknown semantic key ${JSON.stringify(value)}`);
      return value;
    };
    const key = JSON.stringify([type, resolve(actual ? 'fromId' : 'from'), resolve(actual ? 'toId' : 'to')]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return { keys, counts };
}

function difference(wanted, found) {
  const result = [];
  for (const [key, count] of wanted) {
    const missing = count - (found.get(key) || 0);
    if (missing > 0) {
      const [type, from, to] = JSON.parse(key);
      result.push({ type, from, to, count: missing });
    }
  }
  return result.sort((a, b) => order(JSON.stringify(a), JSON.stringify(b)));
}

/** Compare reviewed semantic nodes/edges with current API IDs. Values need separate assertions. */
export function compareRelations(expected, actual) {
  let baseline, observed;
  try {
    baseline = graph(expected, false);
    observed = graph(actual, true);
  } catch (error) {
    if (!(error instanceof InvalidGraph)) throw error;
    return { status: 'INCONCLUSIVE', error: error.message };
  }
  const missingNodes = [...baseline.keys].filter(key => !observed.keys.has(key)).sort(order);
  const unexpectedNodes = [...observed.keys].filter(key => !baseline.keys.has(key)).sort(order);
  const missingEdges = difference(baseline.counts, observed.counts);
  const unexpectedEdges = difference(observed.counts, baseline.counts);
  return {
    status: missingNodes.length || unexpectedNodes.length || missingEdges.length || unexpectedEdges.length ? 'FAIL' : 'PASS',
    missingNodes, unexpectedNodes, missingEdges, unexpectedEdges,
  };
}
