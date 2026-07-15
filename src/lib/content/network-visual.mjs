export const networkNodeKinds = ['core','module','external','data-source','ai','user'];
export const networkEdgeDirections = ['none','forward','backward','both'];
export const networkLayouts = ['hub','flow'];
const clean = (v) => String(v ?? '').trim();
const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function isNetworkVisualConfig(value) {
  return obj(value) && (Array.isArray(value.nodes) || Array.isArray(value.edges) || value.version === 1) && !('title' in value && !Array.isArray(value.nodes));
}

export function networkVisualLegacyItems(items) {
  if (!Array.isArray(items)) return [];
  if (isNetworkVisualConfig(items[0])) return [];
  return items.map((item) => typeof item === 'string' ? { label: item } : obj(item) ? { ...item, label: item.label || item.title || item.text || '' } : { label: clean(item) }).filter((item) => clean(item.label));
}

export function normalizeNetworkVisualConfig(value = {}) {
  const source = obj(value) ? value : {};
  const seen = new Set();
  const nodes = (Array.isArray(source.nodes) ? source.nodes : []).map((node, index) => {
    const n = obj(node) ? node : {};
    const label = clean(n.label || n.title || n.text);
    const id = clean(n.id || label.toLowerCase().replace(/[^a-z0-9áéíóöőúüű]+/gi, '-').replace(/^-|-$/g, '') || `node-${index + 1}`);
    if (!label || seen.has(id)) return null;
    seen.add(id);
    const kind = networkNodeKinds.includes(n.kind) ? n.kind : (index === 0 ? 'core' : 'module');
    return { id, label, kind, ...(clean(n.description) ? { description: clean(n.description) } : {}), ...(clean(n.href || n.url) ? { href: clean(n.href || n.url) } : {}), ...(n.order !== undefined && n.order !== '' ? { order: n.order } : {}) };
  }).filter(Boolean).slice(0, 12);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edgeSeen = new Set();
  const edges = (Array.isArray(source.edges) ? source.edges : []).map((edge) => {
    const e = obj(edge) ? edge : {};
    const from = clean(e.from);
    const to = clean(e.to);
    const direction = networkEdgeDirections.includes(e.direction) ? e.direction : 'forward';
    if (!nodeIds.has(from) || !nodeIds.has(to) || from === to) return null;
    const sig = `${from}->${to}:${direction}:${clean(e.label)}`;
    if (edgeSeen.has(sig)) return null;
    edgeSeen.add(sig);
    return { from, to, direction, ...(clean(e.label) ? { label: clean(e.label) } : {}) };
  }).filter(Boolean).slice(0, 20);
  return { version: Number(source.version) || 1, layout: networkLayouts.includes(source.layout) ? source.layout : 'hub', showLegend: source.showLegend !== false, nodes, edges };
}

export function validateNetworkVisualConfig(value = {}) {
  const errors = [];
  const warnings = [];
  const source = obj(value) ? value : {};
  const ids = new Set();
  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  rawNodes.forEach((node, index) => {
    const id = clean(node?.id);
    const label = clean(node?.label);
    if (!label) errors.push(`A(z) ${index + 1}. csomópont neve kötelező.`);
    if (!id) errors.push(`A(z) ${index + 1}. csomópont ID kötelező.`);
    if (id && ids.has(id)) errors.push(`Duplikált csomópont ID: ${id}`);
    ids.add(id);
    if (node?.kind && !networkNodeKinds.includes(node.kind)) warnings.push(`Ismeretlen csomópont típus: ${node.kind}`);
  });
  if (rawNodes.length > 12) warnings.push('Legfeljebb 12 csomópont javasolt.');
  const edgeSigs = new Set();
  const rawEdges = Array.isArray(source.edges) ? source.edges : [];
  rawEdges.forEach((edge, index) => {
    const from = clean(edge?.from), to = clean(edge?.to);
    if (!ids.has(from)) errors.push(`A(z) ${index + 1}. kapcsolat forrása hiányzik: ${from}`);
    if (!ids.has(to)) errors.push(`A(z) ${index + 1}. kapcsolat célja hiányzik: ${to}`);
    if (from && to && from === to) errors.push(`Self-edge nem engedélyezett: ${from}`);
    if (edge?.direction && !networkEdgeDirections.includes(edge.direction)) warnings.push(`Ismeretlen kapcsolat irány: ${edge.direction}`);
    const sig = `${from}->${to}:${edge?.direction || 'forward'}:${clean(edge?.label)}`;
    if (edgeSigs.has(sig)) warnings.push(`Duplikált kapcsolat: ${sig}`);
    edgeSigs.add(sig);
  });
  if (rawEdges.length > 20) warnings.push('Legfeljebb 20 kapcsolat javasolt.');
  return { ok: errors.length === 0, errors, warnings, config: normalizeNetworkVisualConfig(source) };
}

export function normalizeNetworkVisualItems(items) {
  const list = Array.isArray(items) ? items : [];
  if (!isNetworkVisualConfig(list[0])) return { config: null, legacyItems: networkVisualLegacyItems(list), isLegacy: true };
  return { config: normalizeNetworkVisualConfig(list[0]), legacyItems: [], isLegacy: false };
}
