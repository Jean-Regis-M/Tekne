/**
 * Comfort and accessibility settings, toggled by poking engraved tiles on
 * the tray rim and remembered on this device.
 */

export interface Settings {
  /** Paint by hovering just above the water (no precise dipping needed). */
  hoverPaint: boolean;
  /** High-contrast pigments on a darker ground. */
  highContrast: boolean;
  sound: boolean;
}

const KEY = 'tekne.settings.v1';
const DEFAULTS: Settings = { hoverPaint: false, highContrast: false, sound: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  settings[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage blocked: the setting lasts for this session */
  }
}

/** Water depth (m) at which a fingertip counts as touching. */
export const touchDepth = () => (settings.hoverPaint ? 0.03 : 0.008);
