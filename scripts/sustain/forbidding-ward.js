// Forbidding Ward sustain behavior

// Handle Forbidding Ward sustain - adds 1 round to target effects
export async function handleForbiddingWardSustain(sustainingEffect, caster) {
  console.log(`[PF2e Spell Sustainer] Handling Forbidding Ward sustain`);
  
  const maxRounds = sustainingEffect.flags?.world?.sustainedSpell?.maxSustainRounds || 10;
  const curRounds = sustainingEffect.system?.duration?.value || 0;
  
  // Update the sustaining effect
  await sustainingEffect.update({
    'system.duration.value': Math.min(curRounds + 1, maxRounds),
    'flags.world.sustainedThisTurn': true
  });
  
  // Note: Child effects on allies/enemies have full duration and don't need updating
  // Only the sustaining effect on the caster tracks rounds
}