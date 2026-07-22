export const MAX_CTA_BUTTONS = 4;

const clean = (value) => String(value ?? '').trim();
const booleanValue = (value, fallback = false) => value === undefined || value === null ? fallback : value === true || value === 1 || value === '1' || value === 'true';

function normalizeButton(button = {}, index = 0) {
  const source = button && typeof button === 'object' && !Array.isArray(button) ? button : {};
  const normalized = {
    label: clean(source.label),
    url: clean(source.url ?? source.href),
    showInHeader: booleanValue(source.showInHeader, index === 0),
  };
  for (const key of ['analyticsIntent', 'analyticsId', 'analyticsSlot']) if (clean(source[key])) normalized[key] = clean(source[key]);
  return normalized;
}

function compact(buttons = []) {
  return buttons.map(normalizeButton).filter((button) => button.label || button.url).slice(0, MAX_CTA_BUTTONS);
}

export function defaultCtaButtons(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (Array.isArray(source.buttons)) return compact(source.buttons);
  return compact([
    { label: source.primaryLabel, url: source.primaryUrl, showInHeader: true, analyticsIntent: 'demo', analyticsId: 'site-header-demo' },
    { label: source.secondaryLabel, url: source.secondaryUrl, showInHeader: false, analyticsIntent: 'trial' },
  ]);
}

export function itemCtaButtons(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (Array.isArray(source.buttons)) return compact(source.buttons);
  return compact([
    {
      label: source.label,
      url: source.url,
      showInHeader: true,
      analyticsIntent: source.primaryAnalyticsIntent ?? source.analyticsIntent,
      analyticsId: source.primaryAnalyticsId ?? source.analyticsId,
      analyticsSlot: source.analyticsSlot,
    },
    {
      label: source.secondaryLabel,
      url: source.secondaryUrl,
      showInHeader: false,
      analyticsIntent: source.secondaryAnalyticsIntent,
      analyticsId: source.secondaryAnalyticsId,
      analyticsSlot: source.analyticsSlot,
    },
  ]);
}

export function withLegacyDefaultFields(value = {}, buttons = defaultCtaButtons(value)) {
  const first = buttons[0] || {};
  const second = buttons[1] || {};
  return {
    ...value,
    buttons,
    primaryLabel: first.label || '',
    primaryUrl: first.url || '',
    secondaryLabel: second.label || '',
    secondaryUrl: second.url || '',
  };
}

export function withLegacyItemFields(value = {}, buttons = itemCtaButtons(value)) {
  const first = buttons[0] || {};
  const second = buttons[1] || {};
  return {
    ...value,
    buttons,
    label: first.label || '',
    url: first.url || '',
    secondaryLabel: second.label || '',
    secondaryUrl: second.url || '',
  };
}

export function hasTooManyCtaButtons(value = {}) {
  return Array.isArray(value?.buttons) && value.buttons.length > MAX_CTA_BUTTONS;
}

export function incompleteCtaButton(button = {}) {
  return Boolean(clean(button.label)) !== Boolean(clean(button.url));
}
