// Generic sustain behavior dispatcher
import { getSpellConfig } from '../spells/configs/index.js';

export async function dispatchSustainBehavior(spellType, sustainingEffect, caster) {
  console.log(`[PF2e Spell Sustainer] Dispatching sustain behavior for spell type: ${spellType}`);
  
  // Try to get spell config by conventional naming
  let spellConfig = null;
  
  // For self-aura types, try "bless" first (our current aura spell)
  if (spellType === 'self-aura') {
    spellConfig = await getSpellConfig('bless');
  } else {
    // Try direct lookup by spellType
    spellConfig = await getSpellConfig(spellType);
  }
  
  if (!spellConfig) {
    console.warn(`[PF2e Spell Sustainer] No config found for spell type: ${spellType}`);
    return await handleStandardSustain(sustainingEffect, caster);
  }
  
  const sustainBehavior = spellConfig.sustainBehavior || 'standard';
  
  switch (sustainBehavior) {
    case 'aura':
      const { handleAuraSustain } = await import('./sustain-aura.js');
      return await handleAuraSustain(sustainingEffect, caster, spellConfig);
      
    case 'templated':
      const { handleTemplatedSustain } = await import('./sustain-templated.js');
      return await handleTemplatedSustain(caster, sustainingEffect, spellConfig);
      
    case 'standard':
    default:
      return await handleStandardSustain(sustainingEffect, caster);
  }
}

// Standard sustain behavior - just increment rounds
async function handleStandardSustain(sustainingEffect, caster) {
  console.log(`[PF2e Spell Sustainer] Handling standard sustain behavior`);
  
  const maxRounds = sustainingEffect.flags?.world?.sustainedSpell?.maxSustainRounds || 10;
  const curRounds = sustainingEffect.system?.duration?.value || 0;
  
  // Update the sustaining effect
  await sustainingEffect.update({
    'system.duration.value': Math.min(curRounds + 1, maxRounds),
    'flags.world.sustainedThisTurn': true
  });
  
  console.log(`[PF2e Spell Sustainer] Standard sustain: incremented rounds to ${Math.min(curRounds + 1, maxRounds)}`);
}