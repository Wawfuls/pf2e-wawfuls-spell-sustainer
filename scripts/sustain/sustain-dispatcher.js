// Generic sustain behavior dispatcher
import { spellConfigs } from '../spells/configs/index.js';

export async function dispatchSustainBehavior(spellType, sustainingEffect, caster) {
  console.log(`[PF2e Spell Sustainer] Dispatching sustain behavior for spell type: ${spellType}`);
  
  // Get the spell config
  const spellConfig = Object.values(spellConfigs).find(config => 
    config.sustainingEffect?.spellType === spellType || 
    config.spellType === spellType
  );
  
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