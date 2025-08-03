// Generic aura sustain behavior

// Handle aura spell sustain - increases aura counter based on spell config
export async function handleAuraSustain(sustainingEffect, caster, spellConfig) {
  const spellName = spellConfig?.name || sustainingEffect.flags?.world?.sustainedSpell?.spellName || 'Unknown Spell';
  console.log(`[PF2e Spell Sustainer] Handling ${spellName} aura sustain`);
  
  const sustainedSpellData = sustainingEffect.flags?.world?.sustainedSpell;
  const currentAuraCounter = sustainedSpellData?.auraCounter || 1;
  const maxAuraCounter = spellConfig?.aura?.maxCounter || 10;
  const baseSize = spellConfig?.aura?.baseSize || 5;
  const increment = spellConfig?.aura?.increment || 10;
  
  if (currentAuraCounter >= maxAuraCounter) {
    const maxSize = baseSize + (maxAuraCounter * increment);
    ui.notifications.warn(`${spellName} aura is already at maximum size (${maxSize} feet).`);
    return;
  }
  
  const newAuraCounter = currentAuraCounter + 1;
  const newAuraSize = baseSize + (newAuraCounter * increment);
  
  // Update the sustaining effect with new aura counter
  await sustainingEffect.update({
    'flags.world.sustainedSpell.auraCounter': newAuraCounter,
    'flags.world.sustainedThisTurn': true
  });
  
  console.log(`[PF2e Spell Sustainer] ${spellName} aura increased to ${newAuraSize} feet (counter: ${newAuraCounter})`);
  
  // Note: The actual aura effect is handled by the GrantItem rule in the sustaining effect
  // The aura effect automatically adjusts based on the sustaining effect's presence
}