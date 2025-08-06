// Core message handling functions for PF2e Spell Sustainer

import { parseSaveResult, checkIfSpellRequiresSave } from './utils.js';

// Handle sustained spell casting logic
export async function handleSustainedSpellCast(msg, options, userId) {
  // Only let the GM handle effect creation to avoid duplicate processing
  if (!game.user.isGM) {
    // Non-GM users skip processing to avoid duplicates
    return;
  }
  
  // Process chat message for spell sustaining
  
  // Only proceed if this is a spell cast message (not damage or other effects)
  const ctx = msg.flags?.pf2e?.context;
  const origin = msg.flags?.pf2e?.origin;
  
  // Analyze message type and context
  
  // Skip if this is a sustain message (not an original cast)
  if (msg.flags?.world?.sustainMessage) {
    return;
  }
  
  // Check if this is actually a spell cast (not damage, saves, or other effects)
  const isSpellCast = (ctx?.type === 'spell-cast') || 
                     (ctx?.type === 'spell' && ctx?.action === 'cast') ||
                     (origin?.type === 'spell' && !ctx?.type); // Initial spell cast without specific context type
  
  if (!isSpellCast) {
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
      // Skip damage roll messages
      return;
    }
  }
  
  // Skip if this is a saving throw result
  if (ctx?.type === 'saving-throw' || msg.flags?.pf2e?.modifierMessage) {
    // Skip saving throw messages
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
  // Detected spell cast

  // Get targets
  let targets = [];
  const casterUser = game.users.find(u => u.character?.id === caster.id) || game.users.find(u => u.name === msg.speaker?.alias);
  if (casterUser) {
    targets = Array.from(casterUser.targets);
  }
  if (!targets.length) {
    targets = Array.from(game.user.targets);
  }
  
  // Use the new spell dispatcher system
  const { dispatchSpell } = await import('../spells/spell-dispatcher.js');
  await dispatchSpell(spell, caster, targets, msg, ctx);
}

// Handle spells that require saving throws by monitoring chat for save results
export async function handleSaveDependentSpell(spell, caster, validTargets, originalMsg, ctx, config) {
  // Create a hook to monitor for saving throw results
  const hookId = `sustainSaveMonitor_${originalMsg.id}`;
  
  // Store data for the hook
  const monitorData = {
    spell,
    caster,
    originalTargets: validTargets,
    originalMsg,
    ctx,
    config,
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
    
    // Timeout reached for save results
    ui.notifications.warn(`No saving throw results detected for ${spell.name} within 30 seconds. Sustained effects not created.`);
    
    cleanupMonitoring();
  }, 30000);

  // Create the hook function
  globalThis[hookId] = async (chatMsg) => {
    if (monitorData.completed) return; // Already handled
    
    // Check if this is a saving throw message
    const saveResult = parseSaveResult(chatMsg, monitorData.originalTargets);
    if (!saveResult) return;

    // Save result found
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
        // Caster no longer exists
        cleanupMonitoring();
        return;
      }
      
      const existingSustain = currentCaster.itemTypes.effect.find(e => 
        e.flags?.world?.sustainedSpell?.createdFromChat === originalMsg.id
      );
      
      if (existingSustain) {
        // Sustaining effect already exists
        cleanupMonitoring();
        return;
      }

      // All save results received, apply effects
      cleanupMonitoring();

      // Filter targets based on save results and config requirements
      const applicableTargets = monitorData.originalTargets.filter(target => {
        const saveResult = monitorData.saveResults.get(target.actor.id);
        if (!saveResult) return false;
        
        // Check if this save result should trigger effects based on config
        if (config?.saveResults?.applyEffectOn) {
          return config.saveResults.applyEffectOn.includes(saveResult.result);
        }
        
        // Default behavior: apply on failure/critical failure
        return saveResult.result === 'failure' || saveResult.result === 'criticalFailure';
      });

      if (applicableTargets.length > 0) {
              const { createSustainedEffects } = await import('../effects/generic.js');
      await createSustainedEffects(spell, caster, applicableTargets, originalMsg, ctx, config);
    } else {
      ui.notifications.info(`No targets met the criteria for sustained effects for ${spell.name}.`);
    }
    }
  };

  // Register the hook
  Hooks.on('createChatMessage', globalThis[hookId]);
  
  // Store the cleanup function globally so we can call it from other places if needed
  globalThis[`${hookId}_cleanup`] = cleanupMonitoring;
}