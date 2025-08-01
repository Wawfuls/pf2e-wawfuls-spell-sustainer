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
  
  // Update the description to show current aura size (like legacy Bless)
  const originalDescription = sustainingEffect.system?.description?.value || '';
  const updatedDescription = originalDescription.replace(
    /<strong>Current Aura:<\/strong> \d+ Feet/,
    `<strong>Current Aura:</strong> ${newAuraSize} Feet`
  );
  
  // Update the sustaining effect with new aura counter and description
  await sustainingEffect.update({
    'flags.world.sustainedSpell.auraCounter': newAuraCounter,
    'flags.world.sustainedThisTurn': true,
    'system.description.value': updatedDescription
  });
  
  // Find and update the granted aura effect's badge value (like legacy Bless)
  const auraEffects = caster.itemTypes.effect.filter(e => 
    e.name?.toLowerCase().includes(spellName.toLowerCase()) && 
    e.system?.badge?.value !== undefined
  );
  
  console.log(`[PF2e Spell Sustainer] Found ${auraEffects.length} ${spellName} aura effects`);
  
  for (const auraEffect of auraEffects) {
    try {
      await auraEffect.update({
        'system.badge.value': newAuraCounter
      });
      console.log(`[PF2e Spell Sustainer] Updated ${spellName} aura badge to ${newAuraCounter} on ${caster.name}`);
    } catch (error) {
      console.log(`[PF2e Spell Sustainer] Could not update badge on ${auraEffect.name}:`, error);
    }
  }
  
  // If no aura found, log for debugging
  if (auraEffects.length === 0) {
    console.log(`[PF2e Spell Sustainer] No ${spellName} aura items found. Available effects:`, 
      caster.itemTypes.effect.map(e => ({ name: e.name, slug: e.slug, hasBadge: !!e.system?.badge }))
    );
  }
  
  console.log(`[PF2e Spell Sustainer] Increased ${spellName} aura counter to ${newAuraCounter} (${newAuraSize} feet) on ${caster.name}`);
}