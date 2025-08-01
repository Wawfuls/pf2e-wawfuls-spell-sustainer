// Core message handling functions for PF2e Spell Sustainer

import { parseSaveResult, checkIfSpellRequiresSave } from './utils.js';

// Handle sustained spell casting logic
export async function handleSustainedSpellCast(msg, options, userId) {
  // Only let the GM handle effect creation to avoid duplicate processing
  if (!game.user.isGM) {
    console.log(`[PF2e Spell Sustainer] Non-GM user skipping spell processing to avoid duplicates`);
    return;
  }
  
  console.log(`[PF2e Spell Sustainer] Processing chat message:`, {
    messageId: msg.id,
    speaker: msg.speaker,
    hasFlags: !!msg.flags?.pf2e,
    content: msg.content?.substring(0, 100) + '...'
  });
  
  // Only proceed if this is a spell cast message (not damage or other effects)
  const ctx = msg.flags?.pf2e?.context;
  const origin = msg.flags?.pf2e?.origin;
  
  console.log(`[PF2e Spell Sustainer] Message analysis:`, {
    contextType: ctx?.type,
    contextAction: ctx?.action,
    originType: origin?.type,
    hasContext: !!ctx,
    hasOrigin: !!origin
  });
  
  // Check if this is actually a spell cast (not damage, saves, or other effects)
  const isSpellCast = (ctx?.type === 'spell-cast') || 
                     (ctx?.type === 'spell' && ctx?.action === 'cast') ||
                     (origin?.type === 'spell' && !ctx?.type); // Initial spell cast without specific context type
  
  console.log(`[PF2e Spell Sustainer] Is spell cast: ${isSpellCast}`);
  if (!isSpellCast) {
    console.log(`[PF2e Spell Sustainer] Not a spell cast, returning`);
    return;
  }
  
  // Additional filter: Skip if this is a damage roll or save result
  if (msg.rolls?.length > 0) {
    // Check if any roll is a damage roll
    const hasDamageRoll = msg.rolls.some(roll => 
      roll.formula?.includes('d') && // Has dice
      (roll.formula?.includes('+') || roll.formula?.includes('-')) && // Has modifiers typical of damage
      !roll.formula?.includes('d20') // Not a d20 roll (which would be an attack or save)
    );
    if (hasDamageRoll) {
      console.log(`[PF2e Spell Sustainer] Skipping damage roll message for spell`);
      return;
    }
  }
  
  // Skip if this is a saving throw result
  if (ctx?.type === 'saving-throw' || msg.flags?.pf2e?.modifierMessage) {
    console.log(`[PF2e Spell Sustainer] Skipping saving throw message`);
    return;
  }

  // Try to get the spell item UUID from the message
  const spellUuid = ctx?.item?.uuid || origin?.uuid;
  if (!spellUuid) return;
  const spell = await fromUuid(spellUuid);
  if (!spell || spell.type !== 'spell') return;

  // Check for the 'sustain' trait
  // if (!spell.system?.duration?.sustained) return;

  // Get the caster
  const casterId = msg.speaker?.actor;
  const caster = game.actors.get(casterId);
  if (!caster) return;
  
  // Debug: Log that we detected a valid spell cast
  console.log(`[PF2e Spell Sustainer] Detected initial spell cast: ${spell.name}`);
  console.log(`[PF2e Spell Sustainer] Spell cast context:`, {
    contextType: ctx?.type,
    contextAction: ctx?.action,
    originType: origin?.type,
    hasRolls: !!msg.rolls?.length,
    rollFormulas: msg.rolls?.map(r => r.formula) || [],
    spellName: spell.name,
    casterName: caster.name
  });

  // Get targets
  let targets = [];
  const casterUser = game.users.find(u => u.character?.id === caster.id) || game.users.find(u => u.name === msg.speaker?.alias);
  if (casterUser) {
    targets = Array.from(casterUser.targets);
  }
  if (!targets.length) {
    targets = Array.from(game.user.targets);
  }
  
  // Check for specific spell handling - this will need to be imported from spell handlers
  const spellName = spell.name.toLowerCase();
  console.log(`[PF2e Spell Sustainer] Spell dispatcher - checking spell: "${spellName}"`);
  
  // Import spell handlers dynamically
  if (spellName.includes('evil eye')) {
    console.log(`[PF2e Spell Sustainer] Routing to Evil Eye handler`);
    const { handleEvilEye } = await import('../spells/evil-eye.js');
    await handleEvilEye(spell, caster, targets, msg, ctx);
  } else if (spellName.includes('needle of vengeance')) {
    console.log(`[PF2e Spell Sustainer] Routing to Needle of Vengeance handler`);
    const { handleNeedleOfVengeance } = await import('../spells/needle-of-vengeance.js');
    await handleNeedleOfVengeance(spell, caster, targets, msg, ctx);
  } else if (spellName.includes('forbidding ward')) {
    console.log(`[PF2e Spell Sustainer] Routing to Forbidding Ward handler`);
    const { handleForbiddingWard } = await import('../spells/forbidding-ward.js');
    await handleForbiddingWard(spell, caster, targets, msg, ctx);
  } else if (spellName.includes('bless')) {
    console.log(`[PF2e Spell Sustainer] Routing to Bless handler`);
    const { handleBless } = await import('../spells/bless.js');
    await handleBless(spell, caster, targets, msg, ctx);
  } else {
    console.log(`[PF2e Spell Sustainer] Using generic spell handler for: "${spellName}"`);
    
    // Fall back to generic handling for other spells
    if (!targets.length) {
      // If no targets, treat the caster as the target (for self-buffs)
      targets = [{ actor: caster }];
    }
    
    // Filter out targets that don't have actors
    const validTargets = targets.filter(tok => tok.actor);
    if (!validTargets.length) return;

    // Check if this spell requires saving throws
    const requiresSave = checkIfSpellRequiresSave(spell);
    
    if (requiresSave) {
      // For save-dependent spells, wait for save results and then apply effects
      console.log(`[PF2e Spell Sustainer] ${spell.name} requires saves, monitoring for save results...`);
      await handleSaveDependentSpell(spell, caster, validTargets, msg, ctx);
    } else {
      // For spells that don't require saves, proceed normally
      const { createSustainedEffects } = await import('../effects/generic.js');
      await createSustainedEffects(spell, caster, validTargets, msg, ctx);
    }
  }
}

// Handle spells that require saving throws by monitoring chat for save results
export async function handleSaveDependentSpell(spell, caster, validTargets, originalMsg, ctx) {
  // Create a hook to monitor for saving throw results
  const hookId = `sustainSaveMonitor_${originalMsg.id}`;
  
  // Store data for the hook
  const monitorData = {
    spell,
    caster,
    originalTargets: validTargets,
    originalMsg,
    ctx,
    saveResults: new Map(), // actor ID -> save result
    timeoutId: null,
    completed: false // Flag to prevent multiple executions
  };

  // Helper function to clean up the monitoring
  const cleanupMonitoring = () => {
    if (monitorData.timeoutId) {
      clearTimeout(monitorData.timeoutId);
      monitorData.timeoutId = null;
    }
    if (globalThis[hookId]) {
      Hooks.off('createChatMessage', globalThis[hookId]);
      delete globalThis[hookId];
    }
    monitorData.completed = true;
  };

  // Set a timeout to automatically apply effects after 30 seconds if no saves are found
  monitorData.timeoutId = setTimeout(() => {
    if (monitorData.completed) return; // Already handled
    
    console.log(`[PF2e Spell Sustainer] Timeout reached for ${spell.name}, no save results detected. Cancelling sustained effect creation.`);
    ui.notifications.warn(`No saving throw results detected for ${spell.name} within 30 seconds. Sustained effects not created.`);
    
    cleanupMonitoring();
  }, 30000);

  // Create the hook function
  globalThis[hookId] = async (chatMsg) => {
    if (monitorData.completed) return; // Already handled
    
    // Check if this is a saving throw message
    const saveResult = parseSaveResult(chatMsg, monitorData.originalTargets);
    if (!saveResult) return;

    console.log(`[PF2e Spell Sustainer] Found save result for ${saveResult.actorName}: ${saveResult.result}`);
    monitorData.saveResults.set(saveResult.actorId, saveResult);

    // Check if we have save results for all targets
    const targetIds = monitorData.originalTargets.map(t => t.actor.id);
    const haveAllSaves = targetIds.every(id => monitorData.saveResults.has(id));

    if (haveAllSaves) {
      // Double-check that we haven't already processed this
      if (monitorData.completed) return;
      
      // Check if the caster still exists and doesn't already have a sustaining effect for this spell
      const currentCaster = game.actors.get(caster.id);
      if (!currentCaster) {
        console.log(`[PF2e Spell Sustainer] Caster no longer exists, cancelling sustained effect creation`);
        cleanupMonitoring();
        return;
      }
      
      const existingSustain = currentCaster.itemTypes.effect.find(e => 
        e.flags?.world?.sustainedSpell?.createdFromChat === originalMsg.id
      );
      
      if (existingSustain) {
        console.log(`[PF2e Spell Sustainer] Sustaining effect already exists for this spell cast, skipping`);
        cleanupMonitoring();
        return;
      }

      // All save results received, apply effects
      cleanupMonitoring();

      // Filter targets to only those who failed their saves
      const failedTargets = monitorData.originalTargets.filter(target => {
        const saveResult = monitorData.saveResults.get(target.actor.id);
        return saveResult && (saveResult.result === 'failure' || saveResult.result === 'criticalFailure');
      });

      if (failedTargets.length > 0) {
        console.log(`[PF2e Spell Sustainer] Applying sustained effects to ${failedTargets.length} targets who failed saves`);
        const { createSustainedEffects } = await import('../effects/generic.js');
        await createSustainedEffects(spell, caster, failedTargets, originalMsg, ctx);
      } else {
        console.log(`[PF2e Spell Sustainer] No targets failed their saves for ${spell.name}`);
        ui.notifications.info(`No targets failed their saves for ${spell.name}. No sustained effects created.`);
      }
    }
  };

  // Register the hook
  Hooks.on('createChatMessage', globalThis[hookId]);
  
  // Store the cleanup function globally so we can call it from other places if needed
  globalThis[`${hookId}_cleanup`] = cleanupMonitoring;
}