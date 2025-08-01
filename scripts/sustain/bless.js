// Bless sustain behavior

// Handle Bless sustain - increases aura counter, NOT rounds
export async function handleBlessSustain(sustainingEffect, caster) {
  console.log(`[PF2e Spell Sustainer] Handling Bless sustain`);
  
  const sustainedSpellData = sustainingEffect.flags?.world?.sustainedSpell;
  const currentAuraCounter = sustainedSpellData?.auraCounter || 1;
  const maxAuraCounter = 10; // Maximum aura size
  
  if (currentAuraCounter >= maxAuraCounter) {
    ui.notifications.warn('Bless aura is already at maximum size (105 feet).');
    return;
  }
  
  const newAuraCounter = currentAuraCounter + 1;
  const newAuraSize = 5 + (newAuraCounter * 10);
  
  // Update the sustaining effect with new aura counter
  await sustainingEffect.update({
    'flags.world.sustainedSpell.auraCounter': newAuraCounter,
    'flags.world.sustainedThisTurn': true
  });
  
  console.log(`[PF2e Spell Sustainer] Bless aura increased to ${newAuraSize} feet (counter: ${newAuraCounter})`);
  
  // Note: The actual aura effect is handled by the GrantItem rule in the sustaining effect
  // The aura-bless effect automatically adjusts based on the sustaining effect's presence
}