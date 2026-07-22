export const blockContracts = Object.freeze([
  { type: 'text', label: 'Szövegblokk', canonicalType: 'text', aliases: [], allowedPageContexts: ['*'], capabilities: { listItems: false, cardTarget: false, sectionAction: false, media: false, reorder: true }, validator: 'plain', publicContractVersion: 1 },
  { type: 'feature-list', label: 'Felsorolás / lista', canonicalType: 'feature-list', aliases: ['list'], allowedPageContexts: ['*'], capabilities: { listItems: true, cardTarget: false, sectionAction: false, media: false, reorder: true }, validator: 'list', publicContractVersion: 1 },
  { type: 'list', label: 'Lista', canonicalType: 'feature-list', aliases: [], allowedPageContexts: ['*'], capabilities: { listItems: true, cardTarget: false, sectionAction: false, media: false, reorder: true }, validator: 'list', publicContractVersion: 1 },
  { type: 'cards', label: 'Kártyasor', canonicalType: 'cards', aliases: [], allowedPageContexts: ['*'], capabilities: { listItems: true, cardTarget: true, sectionAction: true, media: false, reorder: true }, validator: 'cards-v2', publicContractVersion: 2 },
  { type: 'card-grid', label: 'Kártyarács', canonicalType: 'cards', aliases: [], allowedPageContexts: ['*'], capabilities: { listItems: true, cardTarget: true, sectionAction: true, media: false, reorder: true }, validator: 'cards-v2', publicContractVersion: 2 },
  { type: 'cta', label: 'CTA blokk', canonicalType: 'cta', aliases: [], allowedPageContexts: ['*'], capabilities: { listItems: false, cardTarget: false, sectionAction: false, media: false, reorder: true }, validator: 'cta', publicContractVersion: 1 },
  { type: 'image-text', label: 'Kép + szöveg blokk', canonicalType: 'image-text', aliases: [], allowedPageContexts: ['*'], capabilities: { listItems: false, cardTarget: false, sectionAction: false, media: true, reorder: true }, validator: 'image-text', publicContractVersion: 1 },
  { type: 'video', label: 'Videó blokk', canonicalType: 'video', aliases: [], allowedPageContexts: ['*'], capabilities: { listItems: false, cardTarget: false, sectionAction: false, media: true, reorder: true }, validator: 'video', publicContractVersion: 1 },
  { type: 'faq', label: 'FAQ blokk', canonicalType: 'faq', aliases: [], allowedPageContexts: ['*'], capabilities: { listItems: true, cardTarget: false, sectionAction: false, media: false, reorder: true }, validator: 'faq', publicContractVersion: 1 },
  { type: 'ai-preview', label: 'AI előnézet', canonicalType: 'ai-preview', aliases: [], allowedPageContexts: ['*'], capabilities: { listItems: true, cardTarget: false, sectionAction: false, media: false, reorder: true }, validator: 'ai-preview', publicContractVersion: 1 },
  { type: 'network-visual', label: 'Hálózati vizualizáció', canonicalType: 'network-visual', aliases: [], allowedPageContexts: ['*'], capabilities: { listItems: true, cardTarget: false, sectionAction: false, media: false, reorder: true }, validator: 'network-visual', publicContractVersion: 1 },
  { type: 'split-text', label: 'Kétoszlopos szöveg', canonicalType: 'split-text', aliases: [], allowedPageContexts: ['*'], capabilities: { listItems: false, cardTarget: false, sectionAction: false, media: false, reorder: true }, validator: 'split-text', publicContractVersion: 1 },
  { type: 'ai-assistant-preview', label: 'AI asszisztens előnézet', canonicalType: 'ai-assistant-preview', aliases: [], allowedPageContexts: ['*'], capabilities: { listItems: true, cardTarget: false, sectionAction: false, media: false, reorder: true }, validator: 'ai-assistant-preview', publicContractVersion: 1 },
  { type: 'related-links', label: 'Kapcsolódó oldalak', canonicalType: 'related-links', aliases: [], allowedPageContexts: ['*'], capabilities: { listItems: true, cardTarget: true, sectionAction: false, media: false, reorder: true }, validator: 'related-links', publicContractVersion: 1 },
  { type: 'integrations-strip', label: 'Integrációs sáv', canonicalType: 'integrations-strip', aliases: [], allowedPageContexts: ['*'], capabilities: { listItems: true, cardTarget: false, sectionAction: false, media: false, reorder: true }, validator: 'integrations-strip', publicContractVersion: 1 },
]);

export const blockContractByType = new Map(blockContracts.map((contract) => [contract.type, contract]));
export const supportedBlockTypes = new Set(blockContracts.map((contract) => contract.type));
export const blockTypeLabels = Object.fromEntries(blockContracts.map((contract) => [contract.type, contract.label]));
export function blockCanonicalType(type) { return blockContractByType.get(String(type || ''))?.canonicalType || String(type || 'text'); }
export function blockTypeOptionsForContext(context = '*') {
  return blockContracts.filter((contract) => contract.allowedPageContexts.includes('*') || contract.allowedPageContexts.includes(context)).map((contract) => [contract.type, contract.label]);
}
export function isSupportedBlockType(type) { return supportedBlockTypes.has(String(type || '')); }
