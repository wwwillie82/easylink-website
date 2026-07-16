import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeNetworkVisualItems, normalizeNetworkVisualConfig, validateNetworkVisualConfig } from '../src/lib/content/network-visual.mjs';
import { blockForm, pageEditorJs, serializeEditorItems, movedBlockOrder } from '../src/lib/admin/render/blocks.mjs';

const sample = { version: 1, layout: 'hub', showLegend: true, nodes: [
  { id: 'easylink', label: 'EasyLink ERP', kind: 'core' },
  { id: 'crm', label: 'CRM', kind: 'module' },
  { id: 'nav', label: 'NAV', kind: 'external' },
], edges: [
  { from: 'easylink', to: 'crm', direction: 'both', label: 'Ügyféladatok' },
  { from: 'crm', to: 'nav', direction: 'forward', label: 'Online számla' },
  { from: 'nav', to: 'crm', direction: 'backward' },
  { from: 'easylink', to: 'nav', direction: 'none' },
] };

assert.equal(normalizeNetworkVisualConfig({ layout: 'bad', nodes: [{ id: ' a ', label: 'A', kind: 'bad' }], edges: [] }).layout, 'hub');
assert.equal(normalizeNetworkVisualConfig({ nodes: [{ id: 'a', label: 'A', kind: 'bad' }] }).nodes[0].kind, 'core');
assert.equal(normalizeNetworkVisualConfig({ nodes: sample.nodes, edges: [{ from: 'x', to: 'crm' }, { from: 'crm', to: 'crm' }, { from: 'easylink', to: 'crm', direction: 'bad' }] }).edges[0].direction, 'forward');
assert.equal(validateNetworkVisualConfig({ nodes: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }], edges: [] }).ok, false);
assert.match(validateNetworkVisualConfig({ nodes: [{ id: 'a', label: 'A' }], edges: [{ from: 'a', to: 'b' }] }).errors.join(' '), /hiányzik/);
assert.match(validateNetworkVisualConfig({ nodes: [{ id: 'a', label: 'A' }], edges: [{ from: 'a', to: 'a' }] }).errors.join(' '), /Self-edge/);
assert.equal(normalizeNetworkVisualItems(['Régi lista']).isLegacy, true);
assert.equal(normalizeNetworkVisualItems([sample]).config.edges.length, 4);

assert.deepEqual(serializeEditorItems({ type: 'network-visual', rows: sample }), [normalizeNetworkVisualConfig(sample)]);
assert.throws(() => serializeEditorItems({ type: 'network-visual', rows: { nodes: [{ id: 'a', label: '' }], edges: [] } }), /kötelező/);

const tooManyNodes = { ...sample, nodes: Array.from({ length: 13 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, kind: i === 0 ? 'core' : 'module' })), edges: [] };
assert.throws(() => serializeEditorItems({ type: 'network-visual', rows: tooManyNodes }), /Legfeljebb 12 csomópont/);
const manyEdges = { ...sample, edges: Array.from({ length: 21 }, (_, i) => ({ from: i % 2 ? 'crm' : 'easylink', to: i % 2 ? 'nav' : 'crm', direction: 'forward', label: `Edge ${i}` })) };
assert.throws(() => serializeEditorItems({ type: 'network-visual', rows: manyEdges }), /Legfeljebb 20 kapcsolat/);
const duplicateEdge = { ...sample, edges: [sample.edges[1], sample.edges[1]] };
assert.throws(() => serializeEditorItems({ type: 'network-visual', rows: duplicateEdge }), /Duplikált kapcsolat/);

const component = await readFile('src/components/NetworkVisualBlock.astro', 'utf8');
assert.match(component, /data-network-visual-block/);
assert.match(component, /data-network-layout=\{config.layout\}/);
assert.match(component, /role="img"/);
assert.match(component, /data-network-accessible-list/);
assert.match(component, /@media\(max-width:900px\)/);
assert.match(component, /data-network-legacy-fallback/);

assert.match(component, /const width = isFlow \? 1200 : 1120/);
assert.match(component, /const height = isFlow \? 560 : 680/);
assert.match(component, /const flowColumns = \[150, 370, 590, 810, 1030\]/);
assert.match(component, /const flowLanes = \[145, 280, 415\]/);
assert.match(component, /const flowRoleColumn = \{ user: 0, 'data-source': 0, core: 1, module: 2, external: 3, ai: 4 \}/);
assert.match(component, /flowRoleColumn\[n\.kind\] \?\? Math\.min/);
assert.doesNotMatch(component, /const lanes = \[-128, 0, 128\]/);
assert.doesNotMatch(component, /i % lanes\.length/);
assert.doesNotMatch(component, /180 \+ \(\(i % 2\) \? 58 : -58\)/);
assert.match(component, /splitLabelLines/);
assert.match(component, /truncateLabel/);
assert.match(component, /safeSvgText/);
assert.match(component, /<rect class="node-card"/);
assert.match(component, /<tspan x=\{p\.x\} dy=\{index === 0 \? 0 : 17\}>/);
assert.match(component, /const denseEdgeLabelMax = 16/);
assert.match(component, /const denseEdgeLabelLimit = 3/);
assert.match(component, /config\.edges\.length < 5 \|\| i < denseEdgeLabelLimit/);
assert.match(component, /config\.edges\.length >= 5 \? denseEdgeLabelMax : 22/);
assert.match(component, /class="edge-label"/);
assert.match(component, /e\.label \|\| 'kapcsolat'/);
assert.match(component, /edgePath/);
assert.match(component, /const towardOuter = fromNode\.id === core\?\.id \? 0\.8 : toNode\.id === core\?\.id \? 0\.2 : 0\.64/);
assert.doesNotMatch(component, /0\.68 : toNode\.id === core\?\.id \? 0\.32/);
assert.match(component, /C \$\{c1x\}/);
assert.doesNotMatch(component, /Math\.random/);
assert.match(component, /const stableId = stableSource/);
assert.match(component, /const arrowId = `network-\$\{stableId\}-arrow`/);
assert.match(component, /const arrowStartId = `network-\$\{stableId\}-arrow-start`/);
assert.match(component, /<path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/);
assert.match(component, /<path d="M 10 0 L 0 5 L 10 10 z" fill="context-stroke"/);
assert.doesNotMatch(component, /id=\"network-arrow/);
assert.doesNotMatch(component, /url\(#network-arrow/);
assert.match(component, /marker-end=\{markerEnd/);
assert.match(component, /marker-start=\{markerStart/);
assert.match(component, /data-edge-direction=\{e.direction\}/);
assert.doesNotMatch(component, /<ul>\{items\.map/);

const contentBlocks = await readFile('src/components/ContentBlocks.astro', 'utf8');
assert.match(contentBlocks, /import NetworkVisualBlock/);
assert.match(contentBlocks, /type === 'network-visual'/);
assert.match(contentBlocks, /<NetworkVisualBlock block=\{block\}/);

const adminHtml = blockForm({ id: 1, page_id: 1, type: 'network-visual', title: 'Net', body: '', items: [sample], status: 'published', sort_order: 1 });
assert.match(adminHtml, /data-network-visual-editor/);
assert.match(adminHtml, /data-network-node-id/);
assert.match(adminHtml, /data-network-edge-from/);
assert.match(adminHtml, /data-network-json/);
assert.match(adminHtml, /<summary>Haladó JSON export<\/summary>/);
assert.match(adminHtml, /<textarea data-network-json readonly>/);
assert.doesNotMatch(adminHtml, /Haladó JSON import/);
assert.doesNotMatch(adminHtml, /data-ai-preview-editor/);
const legacyHtml = blockForm({ id: 2, page_id: 1, type: 'network-visual', title: 'Legacy', body: '', items: ['Régi'], status: 'published', sort_order: 2 });
assert.match(legacyHtml, /Régi listás formátum/);

const runtime = pageEditorJs(1);
assert.match(runtime, /data-add-network-node/);
assert.match(runtime, /data-remove-network-node/);
assert.match(runtime, /data-move-network-node/);
assert.match(runtime, /data-add-network-edge/);
assert.match(runtime, /data-remove-network-edge/);

assert.match(runtime, /function safeSerializeNetworkItems\(f\)\{try\{serializeItems\(f\);return true;\}catch\(error\)\{const message=String\(error\?\.message\|\|'A hálózati vizualizáció hibás\.'\);setNetworkError\(f,message\);msg\(message,false\);return false;\}\}/);
assert.match(runtime, /if\(f\.querySelectorAll\('\[data-network-node\]'\)\.length>=12\)\{setNetworkError\(f,message\);msg\(message,false\);return;\}/);
assert.match(runtime, /Legfeljebb 12 csomópont adható hozzá\./);
assert.match(runtime, /if\(f\.querySelectorAll\('\[data-network-edge\]'\)\.length>=20\)\{setNetworkError\(f,'Legfeljebb 20 kapcsolat adható hozzá\.'\);msg\('Legfeljebb 20 kapcsolat adható hozzá\.',false\);return '';\}/);
assert.match(runtime, /if\(safeSerializeNetworkItems\(f\)\)f\.dispatchEvent\(new Event\('input'\)\)/);
assert.doesNotMatch(runtime, /insertAdjacentHTML\('beforeend',networkNodeHtml\(f\)\);serializeItems\(f\)/);
assert.doesNotMatch(runtime, /insertAdjacentHTML\('beforeend',edgeHtml\);serializeItems\(f\)/);
assert.doesNotMatch(runtime, /insertAdjacentHTML\('afterend',networkNodeHtml\(f,values\)\);serializeItems\(f\)/);

assert.match(runtime, /function networkNodeIds\(f\)/);
assert.match(runtime, /function uniqueNetworkNodeId\(f,base='node'\)/);
assert.match(runtime, /escapeOptionValue\(id\)/);
assert.match(runtime, /label=values.label\|\|\('Új csomópont '\+\(existingCount\+1\)\)/);
assert.match(runtime, /base=\(nr.querySelector\('\[data-network-node-id\]'\)\?\.value\|\|'node'\)\+'-copy'/);
assert.match(runtime, /id:uniqueNetworkNodeId\(f,base\)/);
assert.match(runtime, /A csomópont kapcsolatokban szerepel\. Előbb töröld a kapcsolatait\./);
assert.match(runtime, /function networkNodesForOptions\(f\)/);
assert.match(runtime, /function existingNetworkEdgeKeys\(f\)/);
assert.match(runtime, /function defaultNetworkEdgePair\(f,nodes\)/);
assert.match(runtime, /function networkEdgeHtml\(f\)\{if\(f.querySelectorAll\('\[data-network-edge\]'\).length>=20\)/);
assert.match(runtime, /const nodes=networkNodesForOptions\(f\);if\(nodes.length<2\)\{setNetworkError\(f,'Kapcsolat létrehozásához legalább két csomópont szükséges\.'\);return '';/);
assert.match(runtime, /const key=\[from.id,to.id,'forward',''\]\.join\('->'\);if\(!existing.has\(key\)\)return \{fromId:from.id,toId:to.id\}/);
assert.match(runtime, /Nincs hozzáadható új kapcsolat\. Módosíts vagy törölj egy meglévő kapcsolatot\./);
assert.match(runtime, /const fromId=pair.fromId;const toId=pair.toId/);
assert.match(runtime, /networkNodeOptions\(nodes,fromId\)/);
assert.match(runtime, /networkNodeOptions\(nodes,toId\)/);
assert.match(runtime, /const edgeHtml=networkEdgeHtml\(f\);if\(edgeHtml\)\{f\.querySelector/);
assert.match(runtime, /<select data-network-edge-from>/);
assert.match(runtime, /<select data-network-edge-to>/);
assert.doesNotMatch(runtime, /<label>From<input data-network-edge-from/);
assert.doesNotMatch(runtime, /Haladó JSON import/);
assert.match(runtime, /setNetworkError\(f,shown\)/);
assert.match(runtime, /if\(rawType==='network-visual'\)\{const shown=message\|\|'A hálózati vizualizáció hibás\.';setNetworkError\(f,shown\);msg\(shown,false\);\}else msg\(message.includes\('sort_order'\)\?message:'Az items JSON hibás/);
assert.match(runtime, /rawType==='network-visual'\?'network-visual'/);
assert.match(runtime, /data-ai-preview-json-export/);
assert.doesNotMatch(runtime, /rawType==='network-visual'\?'raw'/);
assert.ok(movedBlockOrder([{ sortOrder: 10 }, { sortOrder: 20 }], 0, 'down').sortOrder > 10);

console.log('network-visual smoke ok');
