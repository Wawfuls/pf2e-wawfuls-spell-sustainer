// Convention-based spell config loader
// To add a new spell: just drop the JSON file in this directory!
// The filename should match the spell name (lowercase, spaces to hyphens)

// Cache for loaded configs to avoid repeated fetches
const configCache = new Map();

// Load a specific spell config by name
export async function getSpellConfig(spellName) {
  const key = spellName.toLowerCase().replace(/\s+/g, '-');
  
  // Return from cache if already loaded
  if (configCache.has(key)) {
    return configCache.get(key);
  }
  
  try {
    const response = await fetch(`./modules/pf2e-wawfuls-spell-sustainer/scripts/spells/configs/${key}.json`);
    if (response.ok) {
      const config = await response.json();
      configCache.set(key, config); // Cache the result
      return config;
    }
  } catch (error) {
    // Config doesn't exist - that's fine, not all spells need configs
    console.debug(`[PF2e Spell Sustainer] No config found for spell: ${spellName}`);
  }
  
  // Cache null result to avoid repeated attempts
  configCache.set(key, null);
  return null;
}