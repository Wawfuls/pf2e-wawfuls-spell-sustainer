// Generic aura sustain behavior

// Handle aura spell sustain - increases aura counter based on spell config
export async function handleAuraSustain(sustainingEffect, caster, spellConfig) {
  const spellName = spellConfig?.name || sustainingEffect.flags?.world?.sustainedSpell?.spellName || 'Unknown Spell';
  // Handling aura sustain
  
  const allowMultiple = spellConfig?.allowMultipleSustainsPerTurn || false;
  const alreadySustained = sustainingEffect.flags?.world?.sustainedThisTurn;
  
  // Check if sustain should be blocked
  if (alreadySustained && !allowMultiple) {
    ui.notifications.warn(`${spellName} has already been sustained this turn.`);
    return false; // Indicate sustain was blocked
  }
  
  // Only increment aura if not already sustained this turn
  if (!alreadySustained) {
    const sustainedSpellData = sustainingEffect.flags?.world?.sustainedSpell;
    const currentAuraCounter = sustainedSpellData?.auraCounter || 1;
    const maxAuraCounter = spellConfig?.aura?.maxCounter || 10;
    const baseSize = spellConfig?.aura?.baseSize || 5;
    const increment = spellConfig?.aura?.increment || 10;
    
    if (currentAuraCounter >= maxAuraCounter) {
      const maxSize = baseSize + (maxAuraCounter * increment);
      ui.notifications.warn(`${spellName} aura is already at maximum size (${maxSize} feet).`);
      return false; // Indicate sustain was blocked
    }
    
    const newAuraCounter = currentAuraCounter + 1;
    const newAuraSize = baseSize + (newAuraCounter * increment);
    
    // Update the description to show current aura size (like legacy Bless)
    const updatedDescription = `<p>You are sustaining a ${spellName} spell.</p><p><strong>Current aura size:</strong> ${newAuraSize} feet</p>`;
    
    // Update sustaining effect with new aura size
    const updateData = {
      'system.description.value': updatedDescription,
      'system.duration.value': Math.min(sustainingEffect.system?.duration?.value + 1 || 1, 10),
      'flags.world.sustainedSpell.auraCounter': newAuraCounter,
      'flags.world.sustainedSpell.auraIncrement': increment,
      'flags.world.sustainedThisTurn': true
    };
    
    try {
      await sustainingEffect.update(updateData);
    } catch (updateError) {
      console.warn(`[PF2e Spell Sustainer] Could not update aura sustaining effect directly, requesting GM assistance:`, updateError);
      // Use socket to request GM update the effect
      game.socket.emit('module.pf2e-wawfuls-spell-sustainer', {
        type: 'updateSustainingEffect',
        effectUuid: sustainingEffect.uuid,
        updateData: updateData
      });
    }
    
    // Find and update the granted aura effect's badge value (like legacy Bless)
    const auraEffects = caster.itemTypes.effect.filter(e => 
      e.name?.toLowerCase().includes(spellName.toLowerCase()) && 
      e.system?.badge?.value !== undefined
    );
    
        // Found aura effects
    
    for (const auraEffect of auraEffects) {
      try {
        await auraEffect.update({
          'system.badge.value': newAuraCounter
        });
        // Updated aura badge
      } catch (error) {
        console.warn(`[PF2e Spell Sustainer] Could not update aura badge directly, requesting GM assistance:`, error);
        // Use socket to request GM update the aura effect badge
        game.socket.emit('module.pf2e-wawfuls-spell-sustainer', {
          type: 'updateAuraEffect',
          effectUuid: auraEffect.uuid,
          badgeValue: newAuraCounter
        });
      }
    }
    
    // If no aura found, log for debugging
    if (auraEffects.length === 0) {
      // No aura items found
    }
  } else {
    // Already sustained this turn, just mark as sustained but don't increment
    const updateData = {
      'flags.world.sustainedThisTurn': true
    };
    
    try {
      await sustainingEffect.update(updateData);
    } catch (updateError) {
      console.warn(`[PF2e Spell Sustainer] Could not update aura sustaining effect (sustained flag), requesting GM assistance:`, updateError);
      // Use socket to request GM update the effect
      game.socket.emit('module.pf2e-wawfuls-spell-sustainer', {
        type: 'updateSustainingEffect',
        effectUuid: sustainingEffect.uuid,
        updateData: updateData
      });
    }
  }
  
  return true; // Indicate successful sustain
}