// Generic sustain behavior dispatcher
import { getSpellConfig } from '../spells/configs/index.js';

export async function dispatchSustainBehavior(spellType, sustainingEffect, caster) {
  // Dispatching sustain behavior
  
  // Get the actual spell name from the sustaining effect
  const spellName = sustainingEffect.flags?.world?.sustainedSpell?.spellName;
  let spellConfig = null;
  
  // First try to get config by actual spell name
  if (spellName) {
    spellConfig = await getSpellConfig(spellName.toLowerCase());
  }
  
  // Fallback to spellType if no spell name or config found (but skip some types)
  if (!spellConfig && spellType && !['self-aura', 'standard', 'self-only'].includes(spellType)) {
    spellConfig = await getSpellConfig(spellType);
  }
  
  if (!spellConfig) {
    // No config found, use standard sustain behavior
    return await handleStandardSustain(sustainingEffect, caster, null);
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
      return await handleStandardSustain(sustainingEffect, caster, spellConfig);
  }
}

// Standard sustain behavior - just increment rounds
async function handleStandardSustain(sustainingEffect, caster, spellConfig = null) {
  // Handling standard sustain behavior
  
  const allowMultiple = spellConfig?.allowMultipleSustainsPerTurn || false;
  const alreadySustained = sustainingEffect.flags?.world?.sustainedThisTurn;
  
  // Check if sustain should be blocked
  if (alreadySustained && !allowMultiple) {
    const spellName = sustainingEffect.flags?.world?.sustainedSpell?.spellName || 'this spell';
    ui.notifications.warn(`${spellName} has already been sustained this turn.`);
    return false; // Indicate sustain was blocked
  }
  
  // Only increment duration if not already sustained this turn
  if (!alreadySustained) {
    const maxRounds = sustainingEffect.flags?.world?.sustainedSpell?.maxSustainRounds || 10;
    const curRounds = sustainingEffect.system?.duration?.value || 0;
    
    // Update the sustaining effect
    await sustainingEffect.update({
      'system.duration.value': Math.min(curRounds + 1, maxRounds),
      'flags.world.sustainedThisTurn': true
    });
  }
  
  // Incremented sustain rounds (or allowed multiple sustain)
  return true; // Indicate successful sustain
}