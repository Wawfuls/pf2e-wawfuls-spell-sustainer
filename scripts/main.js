// PF2e Wawful's Spell Sustainer

Hooks.once('init', () => {
  console.log('PF2e Wawful\'s Spell Sustainer | Initializing module');
});

Hooks.once('ready', () => {
  console.log('PF2e Wawful\'s Spell Sustainer | Module ready');
});


// Handle sustained spell casting logic
async function handleSustainedSpellCast(msg, options, userId) {
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
  
  // Check for specific spell handling
  const spellName = spell.name.toLowerCase();
  console.log(`[PF2e Spell Sustainer] Spell dispatcher - checking spell: "${spellName}"`);
  
  if (spellName.includes('evil eye')) {
    console.log(`[PF2e Spell Sustainer] Routing to Evil Eye handler`);
    await handleEvilEye(spell, caster, targets, msg, ctx);
  } else if (spellName.includes('needle of vengeance')) {
    console.log(`[PF2e Spell Sustainer] Routing to Needle of Vengeance handler`);
    await handleNeedleOfVengeance(spell, caster, targets, msg, ctx);
  } else if (spellName.includes('forbidding ward')) {
    console.log(`[PF2e Spell Sustainer] Routing to Forbidding Ward handler`);
    await handleForbiddingWard(spell, caster, targets, msg, ctx);
  } else if (spellName.includes('bless')) {
    console.log(`[PF2e Spell Sustainer] Routing to Bless handler`);
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
      await createSustainedEffects(spell, caster, validTargets, msg, ctx);
    }
  }
}

// Handle spells that require saving throws by monitoring chat for save results
async function handleSaveDependentSpell(spell, caster, validTargets, originalMsg, ctx) {
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

// Parse a chat message to extract saving throw results
function parseSaveResult(chatMsg, targetActors) {
  // Check if this is a saving throw message
  const flags = chatMsg.flags?.pf2e;
  if (!flags) return null;

  // Look for PF2e save data
  const context = flags.context;
  const modifierMessage = flags.modifierMessage;
  
  // Check if this is a saving throw
  if (context?.type !== 'saving-throw' && !modifierMessage) return null;

  // Get the actor who made the save
  const speakerId = chatMsg.speaker?.actor;
  if (!speakerId) return null;

  // Check if this actor is one of our targets
  const targetActor = targetActors.find(t => t.actor.id === speakerId);
  if (!targetActor) return null;

  // Parse the save result from the message
  let saveResult = null;
  
  // Method 1: Check flags for outcome
  if (flags.context?.outcome) {
    saveResult = flags.context.outcome;
  }
  
  // Method 2: Parse from message content
  if (!saveResult) {
    const content = chatMsg.content?.toLowerCase() || '';
    
    if (content.includes('critical success') || content.includes('critically succeeded')) {
      saveResult = 'criticalSuccess';
    } else if (content.includes('success') || content.includes('succeeded')) {
      saveResult = 'success';
    } else if (content.includes('critical failure') || content.includes('critically failed')) {
      saveResult = 'criticalFailure';
    } else if (content.includes('failure') || content.includes('failed')) {
      saveResult = 'failure';
    }
  }

  // Method 3: Check for PF2e outcome classes in HTML
  if (!saveResult && chatMsg.content) {
    if (chatMsg.content.includes('degree-of-success-3')) saveResult = 'criticalSuccess';
    else if (chatMsg.content.includes('degree-of-success-2')) saveResult = 'success';
    else if (chatMsg.content.includes('degree-of-success-1')) saveResult = 'failure';
    else if (chatMsg.content.includes('degree-of-success-0')) saveResult = 'criticalFailure';
  }

  if (!saveResult) return null;

  return {
    actorId: speakerId,
    actorName: targetActor.actor.name,
    result: saveResult
  };
}

// Check if a spell requires saving throws by examining its traits and description
function checkIfSpellRequiresSave(spell) {
  // Check for common save-related traits and keywords
  const traits = spell.system?.traits?.value || [];
  const description = spell.system?.description?.value?.toLowerCase() || '';
  
  // Common save traits in PF2e
  const saveTraits = ['incapacitation', 'mental', 'fear', 'emotion', 'charm', 'compulsion'];
  const hasSaveTrait = traits.some(trait => saveTraits.includes(trait));
  
  // Check description for save keywords
  const saveKeywords = [
    'saving throw', 'save', 'fortitude', 'reflex', 'will',
    'basic save', 'basic fortitude', 'basic reflex', 'basic will'
  ];
  const hasSaveKeyword = saveKeywords.some(keyword => description.includes(keyword));
  
  // Check if spell has attack rolls (typically don't require saves)
  const hasAttack = spell.system?.spellType?.value === 'attack' || description.includes('spell attack');
  
  // If it has attack rolls, it probably doesn't need saves
  if (hasAttack) return false;
  
  // Return true if we found save indicators
  return hasSaveTrait || hasSaveKeyword;
}

// ===== HELPER FUNCTIONS =====

// Extract cast level from multiple sources with improved detection
function extractCastLevel(msg, ctx, spell) {
  let castLevel = 1;
  
  // Method 1: Extract from chat message content (data-cast-rank attribute)
  if (msg.content) {
    const castRankMatch = msg.content.match(/data-cast-rank="(\d+)"/);
    if (castRankMatch) {
      castLevel = Number(castRankMatch[1]);
      console.log(`[PF2e Spell Sustainer] Found cast rank from message content: ${castLevel}`);
      return castLevel;
    }
  }
  
  // Method 2: Extract from roll options
  const rollOptions = ctx?.options || msg.flags?.pf2e?.context?.options || [];
  const itemLevelOption = rollOptions.find(option => option.startsWith('item:level:'));
  if (itemLevelOption) {
    castLevel = Number(itemLevelOption.split(':')[2]);
    console.log(`[PF2e Spell Sustainer] Found cast level from roll options: ${castLevel}`);
    return castLevel;
  }
  
  // Method 3: Fallback to other detection methods (handle ctx being undefined)
  castLevel = Number(
    ctx?.spell?.rank ?? 
    ctx?.castLevel ?? 
    ctx?.item?.system?.level?.value ?? 
    ctx?.spellRank ?? 
    ctx?.rank ?? 
    spell.system?.level?.value
  );
  
  if (castLevel && castLevel !== 1) {
    console.log(`[PF2e Spell Sustainer] Found cast level from context/spell data: ${castLevel}`);
  }
  
  if (!castLevel || isNaN(castLevel)) castLevel = 1;
  return castLevel;
}

// ===== SPECIFIC SPELL HANDLERS =====

// Handle Evil Eye spell - 1 target, check will save, apply effect on fail/crit fail
async function handleEvilEye(spell, caster, targets, msg, ctx) {
  console.log(`[PF2e Spell Sustainer] Handling Evil Eye spell`);
  
  // Evil Eye requires exactly 1 target
  const validTargets = targets.filter(tok => tok.actor);
  if (validTargets.length !== 1) {
    ui.notifications.warn(`Evil Eye requires exactly 1 target. Found ${validTargets.length} targets.`);
    return;
  }
  
  // Monitor for save results
  console.log(`[PF2e Spell Sustainer] Evil Eye cast, monitoring for Will save results...`);
  await handleSaveDependentSpell(spell, caster, validTargets, msg, ctx);
}

// Handle Needle of Vengeance - 1 ally target and 1 enemy target, no saves
async function handleNeedleOfVengeance(spell, caster, targets, msg, ctx) {
  console.log(`[PF2e Spell Sustainer] Handling Needle of Vengeance spell`);
  
  // Filter valid targets
  const validTargets = targets.filter(tok => tok.actor);
  if (validTargets.length !== 2) {
    ui.notifications.warn(`Needle of Vengeance requires exactly 2 targets (1 ally, 1 enemy). Found ${validTargets.length} targets.`);
    return;
  }
  
  // Categorize targets by disposition
  let ally = null;
  let enemy = null;
  
  for (const target of validTargets) {
    if (target.document?.disposition === 1 || target.actor.id === caster.id) {
      if (ally) {
        ui.notifications.warn(`Needle of Vengeance found multiple allies. Please target exactly 1 ally and 1 enemy.`);
        return;
      }
      ally = target;
    } else if (target.document?.disposition === -1) {
      if (enemy) {
        ui.notifications.warn(`Needle of Vengeance found multiple enemies. Please target exactly 1 ally and 1 enemy.`);
        return;
      }
      enemy = target;
    }
  }
  
  if (!ally || !enemy) {
    ui.notifications.warn(`Needle of Vengeance requires 1 ally and 1 enemy target. Found: ${ally ? 'ally' : 'no ally'}, ${enemy ? 'enemy' : 'no enemy'}.`);
    return;
  }
  
  // Apply effects immediately (no saves required)
  await createNeedleOfVengeanceEffects(spell, caster, ally, enemy, msg, ctx);
}

// Handle Forbidding Ward - 1 ally target and 1 enemy target, no saves, special sustain behavior
async function handleForbiddingWard(spell, caster, targets, msg, ctx) {
  console.log(`[PF2e Spell Sustainer] Handling Forbidding Ward spell`);
  
  // Filter valid targets
  const validTargets = targets.filter(tok => tok.actor);
  if (validTargets.length !== 2) {
    ui.notifications.warn(`Forbidding Ward requires exactly 2 targets (1 ally, 1 enemy). Found ${validTargets.length} targets.`);
    return;
  }
  
  // Categorize targets by disposition
  let ally = null;
  let enemy = null;
  
  for (const target of validTargets) {
    if (target.document?.disposition === 1 || target.actor.id === caster.id) {
      if (ally) {
        ui.notifications.warn(`Forbidding Ward found multiple allies. Please target exactly 1 ally and 1 enemy.`);
        return;
      }
      ally = target;
    } else if (target.document?.disposition === -1) {
      if (enemy) {
        ui.notifications.warn(`Forbidding Ward found multiple enemies. Please target exactly 1 ally and 1 enemy.`);
        return;
      }
      enemy = target;
    }
  }
  
  if (!ally || !enemy) {
    ui.notifications.warn(`Forbidding Ward requires 1 ally and 1 enemy target. Found: ${ally ? 'ally' : 'no ally'}, ${enemy ? 'enemy' : 'no enemy'}.`);
    return;
  }
  
  // Apply effects immediately (no saves required)
  await createForbiddingWardEffects(spell, caster, ally, enemy, msg, ctx);
}

// Handle Bless - self only, apply aura-bless effect
async function handleBless(spell, caster, targets, msg, ctx) {
  console.log(`[PF2e Spell Sustainer] Handling Bless spell`);
  
  // Bless only affects the caster (self-only)
  await createBlessEffects(spell, caster, msg, ctx);
}

// ===== SPECIFIC EFFECT CREATION FUNCTIONS =====

// Create effects for Needle of Vengeance - immediate effects on both targets
async function createNeedleOfVengeanceEffects(spell, caster, ally, enemy, msg, ctx) {
  console.log(`[PF2e Spell Sustainer] Creating Needle of Vengeance effects`);
  
  const spellSlug = spell.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const sustainingSlug = `sustaining-${spellSlug}`;
  
  // Check for existing effects
  if (caster.itemTypes.effect.find(e => e.slug === sustainingSlug)) {
    console.log(`[PF2e Spell Sustainer] Sustaining effect already exists for this spell cast`);
    return;
  }
  
  // Extract cast level using improved helper function
  const castLevel = extractCastLevel(msg, ctx, spell);
  
  // Extract spell DC from context
  let spellDC = ctx?.dc?.value ?? ctx?.item?.system?.save?.dc?.value ?? (8 + castLevel + (caster.system?.details?.level?.value ?? 1));
  
  console.log(`[PF2e Spell Sustainer] Needle of Vengeance - Detected cast level: ${castLevel} and DC: ${spellDC}`);

  
  // Create sustaining effect on caster
  const sustainingEffectData = {
    type: 'effect',
    name: `Sustaining: Needle of Vengeance`,
    slug: sustainingSlug,
    img: spell.img,
    system: {
      slug: sustainingSlug,
      description: { 
        value: `${spell.system?.description?.value || ''}`
      },
      duration: { value: 1, unit: 'rounds', sustained: true, expiry: 'turn-end' },
      start: { value: game.combat ? game.combat.round : 0, initiative: null },
      level: { value: castLevel },
      unidentified: true
    },
    flags: {
      world: {
        sustainedSpell: {
          spellUuid: spell.uuid,
          spellName: spell.name,
          createdFromChat: msg.id,
          maxSustainRounds: 10,
          allyTargetId: ally.actor.id,
          enemyTargetId: enemy.actor.id,
          spellType: 'needle-of-vengeance',
          targets: [
            {
              id: ally.actor.id,
              name: ally.actor.name,
              uuid: ally.actor.uuid,
              relationship: 'ally'
            },
            {
              id: enemy.actor.id,
              name: enemy.actor.name,
              uuid: enemy.actor.uuid,
              relationship: 'enemy'
            }
          ],
          allies: [ally.actor.name],
          enemies: [enemy.actor.name],
          neutral: []
        }
      }
    }
  };
  
  const sustainingEffect = await caster.createEmbeddedDocuments('Item', [sustainingEffectData]);
  
  // Create effect on ally target
  const allyEffectData = {
    type: 'effect',
    name: `Needle of Vengeance (Ally)`,
    slug: `needle-of-vengeance-ally`,
    img: spell.img,
    system: {
      slug: `needle-of-vengeance-ally`,
      description: { value: `You are protected by Needle of Vengeance. The linked enemy will take backlash damage if they attack you.` },
      duration: { value: 10, unit: 'rounds', sustained: false, expiry: 'turn-end' },
      start: { value: game.combat ? game.combat.round : 0, initiative: null },
      level: { value: castLevel }
    },
    flags: {
      world: {
        sustainedBy: { effectUuid: sustainingEffect[0]?.uuid },
        sustainedSpell: {
          spellUuid: spell.uuid,
          spellName: spell.name,
          casterUuid: caster.uuid,
          createdFromChat: msg.id,
          spellType: 'needle-of-vengeance-ally'
        }
      }
    }
  };
  
  // Create effect on enemy target
  const enemyEffectData = {
    type: 'effect',
    name: `Needle of Vengeance (Enemy)`,
    slug: `needle-of-vengeance-enemy`,
    img: spell.img,
    system: {
      slug: `needle-of-vengeance-enemy`,
      description: { value: `You are cursed by Needle of Vengeance. You will take backlash damage if you attack the linked ally.` },
      duration: { value: 10, unit: 'rounds', sustained: false, expiry: 'turn-end' },
      start: { value: game.combat ? game.combat.round : 0, initiative: null },
      level: { value: castLevel }
    },
    flags: {
      world: {
        sustainedBy: { effectUuid: sustainingEffect[0]?.uuid },
        sustainedSpell: {
          spellUuid: spell.uuid,
          spellName: spell.name,
          casterUuid: caster.uuid,
          createdFromChat: msg.id,
          spellType: 'needle-of-vengeance-enemy'
        },
        needleOfVengeance: {
          casterUuid: caster.uuid,
          allyUuid: ally.document.uuid,
          dc: spellDC,
          rank: castLevel
        }
      }
    }
  };
  
  await ally.actor.createEmbeddedDocuments('Item', [allyEffectData]);
  await enemy.actor.createEmbeddedDocuments('Item', [enemyEffectData]);
  
  console.log(`[PF2e Spell Sustainer] Applied Needle of Vengeance effects to ${ally.actor.name} (ally) and ${enemy.actor.name} (enemy)`);
}

// Create effects for Forbidding Ward - immediate effects with special sustain behavior
async function createForbiddingWardEffects(spell, caster, ally, enemy, msg, ctx) {
  console.log(`[PF2e Spell Sustainer] Creating Forbidding Ward effects`);
  
  const spellSlug = spell.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const sustainingSlug = `sustaining-${spellSlug}`;
  
  // Check for existing effects
  if (caster.itemTypes.effect.find(e => e.slug === sustainingSlug)) {
    console.log(`[PF2e Spell Sustainer] Sustaining effect already exists for this spell cast`);
    return;
  }
  
  // Extract cast level using helper function
  const castLevel = extractCastLevel(msg, ctx, spell);
  
  console.log(`[PF2e Spell Sustainer] Forbidding Ward - Detected cast level: ${castLevel} for spell ${spell.name}`);
  
  // Create sustaining effect on caster
  const sustainingEffectData = {
    type: 'effect',
    name: `Sustaining: Forbidding Ward`,
    slug: sustainingSlug,
    img: spell.img,
    system: {
      slug: sustainingSlug,
      description: { 
        value: `${spell.system?.description?.value || ''}<br/><br/><em>Sustaining adds 1 round to effect duration.</em>`
      },
      duration: { value: 1, unit: 'rounds', sustained: true, expiry: 'turn-end' },
      start: { value: game.combat ? game.combat.round : 0, initiative: null },
      level: { value: castLevel },
      unidentified: true
    },
    flags: {
      world: {
        sustainedSpell: {
          spellUuid: spell.uuid,
          spellName: spell.name,
          createdFromChat: msg.id,
          maxSustainRounds: 10,
          allyTargetId: ally.actor.id,
          enemyTargetId: enemy.actor.id,
          spellType: 'forbidding-ward',
          targets: [
            {
              id: ally.actor.id,
              name: ally.actor.name,
              uuid: ally.actor.uuid,
              relationship: 'ally'
            },
            {
              id: enemy.actor.id,
              name: enemy.actor.name,
              uuid: enemy.actor.uuid,
              relationship: 'enemy'
            }
          ],
          allies: [ally.actor.name],
          enemies: [enemy.actor.name],
          neutral: []
        }
      }
    }
  };
  
  const sustainingEffect = await caster.createEmbeddedDocuments('Item', [sustainingEffectData]);
  
  // Create effect on ally target - starts with 1 round, can be extended by sustaining
  const allyEffectData = {
    type: 'effect',
    name: `Forbidding Ward (Protected)`,
    slug: `forbidding-ward-ally`,
    img: spell.img,
    system: {
      slug: `forbidding-ward-ally`,
      description: { value: `You are protected by a Forbidding Ward against the linked enemy.` },
      duration: { value: 10, unit: 'rounds', sustained: false, expiry: 'turn-end' },
      start: { value: game.combat ? game.combat.round : 0, initiative: null },
      level: { value: castLevel },
      rules: [
        {
          "key": "FlatModifier",
          "predicate": [
            "origin:effect:forbidding-ward-enemy"
          ],
          "selector": [
            "ac",
            "saving-throw"
          ],
          "type": "status",
          "value": "ternary(gte(@item.level,6),2,1)"
        }
      ]
    },
    flags: {
      world: {
        sustainedBy: { effectUuid: sustainingEffect[0]?.uuid },
        sustainedSpell: {
          spellUuid: spell.uuid,
          spellName: spell.name,
          casterUuid: caster.uuid,
          createdFromChat: msg.id,
          spellType: 'forbidding-ward-ally'
        }
      }
    }
  };
  
  // Create effect on enemy target - starts with 1 round, can be extended by sustaining
  const enemyEffectData = {
    type: 'effect',
    name: `Forbidding Ward (Hindered)`,
    slug: `forbidding-ward-enemy`,
    img: spell.img,
    system: {
      slug: `forbidding-ward-enemy`,
      description: { value: `You are hindered by a Forbidding Ward protecting the linked target.` },
      duration: { value: 10, unit: 'rounds', sustained: false, expiry: 'turn-end' },
      start: { value: game.combat ? game.combat.round : 0, initiative: null },
      level: { value: castLevel }
    },
    flags: {
      world: {
        sustainedBy: { effectUuid: sustainingEffect[0]?.uuid },
        sustainedSpell: {
          spellUuid: spell.uuid,
          spellName: spell.name,
          casterUuid: caster.uuid,
          createdFromChat: msg.id,
          spellType: 'forbidding-ward-enemy'
        }
      }
    }
  };
  
  const allyEffect = await ally.actor.createEmbeddedDocuments('Item', [allyEffectData]);
  const enemyEffect = await enemy.actor.createEmbeddedDocuments('Item', [enemyEffectData]);
  
  console.log(`[PF2e Spell Sustainer] Applied Forbidding Ward effects to ${ally.actor.name} (ally) and ${enemy.actor.name} (enemy)`);
  console.log(`[PF2e Spell Sustainer] Created effects with cast level ${castLevel}:`, {
    'sustainingEffect': sustainingEffect[0]?.system?.level?.value,
    'allyEffect': allyEffect[0]?.system?.level?.value,
    'enemyEffect': enemyEffect[0]?.system?.level?.value
  });
}

// Create effects for Bless - self only with aura effect
async function createBlessEffects(spell, caster, msg, ctx) {
  console.log(`[PF2e Spell Sustainer] Creating Bless effects`);
  
  const spellSlug = spell.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const sustainingSlug = `sustaining-${spellSlug}`;
  
  // Check for existing effects
  if (caster.itemTypes.effect.find(e => e.slug === sustainingSlug)) {
    console.log(`[PF2e Spell Sustainer] Sustaining effect already exists for this spell cast`);
    return;
  }
  
  // Extract cast level using improved helper function
  const castLevel = extractCastLevel(msg, ctx, spell);
  
  console.log(`[PF2e Spell Sustainer] Bless - Detected cast level: ${castLevel}`);
  
  // Create sustaining effect on caster that grants the bless aura directly
  const sustainingEffectData = {
    type: 'effect',
    name: `Sustaining: Bless`,
    slug: sustainingSlug,
    img: spell.img,
    system: {
      slug: sustainingSlug,
      description: { 
        value: `${spell.system?.description?.value || ''}<br/><br/><strong>Current Aura:</strong> 15 Feet<br/><em>Sustaining increases aura size by 10 feet.</em>`
      },
      duration: { value: 10, unit: 'rounds', sustained: true, expiry: 'turn-end' },
      start: { value: game.combat ? game.combat.round : 0, initiative: null },
      level: { value: castLevel },
      unidentified: true,
      rules: [
        {
          key: "GrantItem",
          uuid: "Compendium.pf2e.spell-effects.Item.RfCEHpMoEAZvB9IZ" // This grants the aura-bless item
        }
      ]
    },
    flags: {
      world: {
        sustainedSpell: {
          spellUuid: spell.uuid,
          spellName: spell.name,
          createdFromChat: msg.id,
          maxSustainRounds: 10,
          spellType: 'bless',
          auraCounter: 1, // Track the aura counter for sustaining
          targets: [{
            id: caster.id,
            name: caster.name,
            uuid: caster.uuid,
            relationship: 'ally'
          }],
          allies: [caster.name],
          enemies: [],
          neutral: []
        }
      }
    }
  };
  
  await caster.createEmbeddedDocuments('Item', [sustainingEffectData]);
  
  console.log(`[PF2e Spell Sustainer] Applied Bless effect to ${caster.name} with aura-bless grant`);
}

// ===== SPECIAL SUSTAIN BEHAVIORS =====

// Handle Forbidding Ward sustain - adds 1 round to target effects
async function handleForbiddingWardSustain(sustainingEffect, caster) {
  console.log(`[PF2e Spell Sustainer] Handling Forbidding Ward sustain`);
  
  const maxRounds = sustainingEffect.flags?.world?.sustainedSpell?.maxSustainRounds || 10;
  const curRounds = sustainingEffect.system?.duration?.value || 0;
  const sustainedSpellData = sustainingEffect.flags?.world?.sustainedSpell;
  const chatId = sustainedSpellData?.createdFromChat;
  
  // Update the sustaining effect
  await sustainingEffect.update({
    'system.duration.value': Math.min(curRounds + 1, maxRounds),
    'flags.world.sustainedThisTurn': true
  });
  
  // Note: Child effects on allies/enemies have full duration and don't need updating
  // Only the sustaining effect on the caster tracks rounds
}

// Handle Bless sustain - increases aura counter, NOT rounds
async function handleBlessSustain(sustainingEffect, caster) {
  console.log(`[PF2e Spell Sustainer] Handling Bless sustain`);
  
  const sustainedSpellData = sustainingEffect.flags?.world?.sustainedSpell;
  
  // Update the aura counter in the sustaining effect
  const currentCounter = sustainedSpellData?.auraCounter || 1;
  const newCounter = currentCounter + 1;
  
  const newAuraSize = 5 + (newCounter * 10);
  const originalDescription = sustainingEffect.system?.description?.value || '';
  // Update the description to show current aura size
  const updatedDescription = originalDescription.replace(
    /<strong>Current Aura:<\/strong> \d+ Feet/,
    `<strong>Current Aura:</strong> ${newAuraSize} Feet`
  );
  
  await sustainingEffect.update({
    'flags.world.sustainedSpell.auraCounter': newCounter,
    'flags.world.sustainedThisTurn': true,
    'system.description.value': updatedDescription
  });
  
  // Find the granted aura-bless item and update its badge value
  const auraBlesses = caster.itemTypes.effect.filter(e => 
    e.name?.toLowerCase().includes('bless') && 
    e.system?.badge?.value !== undefined
  );
  
  console.log(`[PF2e Spell Sustainer] Found ${auraBlesses.length} aura bless effects`);
  
  for (const auraBless of auraBlesses) {
    try {
      await auraBless.update({
        'system.badge.value': newCounter
      });
      console.log(`[PF2e Spell Sustainer] Updated aura-bless badge to ${newCounter} on ${caster.name}`);
    } catch (error) {
      console.log(`[PF2e Spell Sustainer] Could not update badge on ${auraBless.name}:`, error);
    }
  }
  
  // If no aura found, log for debugging
  if (auraBlesses.length === 0) {
    console.log(`[PF2e Spell Sustainer] No aura-bless items found. Available effects:`, 
      caster.itemTypes.effect.map(e => ({ name: e.name, slug: e.slug, hasBadge: !!e.system?.badge }))
    );
  }
  
  console.log(`[PF2e Spell Sustainer] Increased Bless aura counter to ${newCounter} (${newAuraSize} feet) on ${caster.name}`);
}

// Create sustained effects (extracted from original logic)
async function createSustainedEffects(spell, caster, validTargets, msg, ctx) {
  // Safety check: ensure we don't create duplicate effects for the same spell cast
  const spellSlug = spell.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const sustainingSlug = `sustaining-${spellSlug}`;
  
  // Check if this exact sustaining effect already exists
  let existing = caster.itemTypes.effect.find(e => e.slug === sustainingSlug);
  if (existing) {
    console.log(`[PF2e Spell Sustainer] Sustaining effect already exists for this spell cast (${spell.name}), skipping duplicate creation`);
    return;
  }
  
  // Additional check by chat message ID to be extra safe
  const existingByChatId = caster.itemTypes.effect.find(e => 
    e.flags?.world?.sustainedSpell?.createdFromChat === msg.id
  );
  if (existingByChatId) {
    console.log(`[PF2e Spell Sustainer] Sustaining effect already exists for chat message ${msg.id}, skipping duplicate creation`);
    return;
  }

  // Slugify helper
  const slugify = str => str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Create a single sustaining effect for this spell cast
  // (sustainingSlug already calculated above)
  
  // Extract cast level using improved helper function  
  const castLevel = extractCastLevel(msg, ctx, spell);

  // Calculate max duration in rounds
  let maxRounds = 10; // Default to 1 minute if not found
  if (spell.system?.duration?.value && spell.system?.duration?.unit) {
    const val = Number(spell.system.duration.value);
    const unit = spell.system.duration.unit;
    if (unit === 'round') maxRounds = val;
    else if (unit === 'minute') maxRounds = val * 10;
    else if (unit === 'hour') maxRounds = val * 600;
    else if (unit === 'day') maxRounds = val * 14400;
  }

  // Process targets and categorize them
  const targetData = [];
  const allies = [];
  const enemies = [];
  const neutral = [];

  for (const tok of validTargets) {
    const targetActor = tok.actor;
    const targetId = targetActor.id;
    
    // Determine relationship based on token disposition
    let relationship = 'neutral';
    if (tok.document?.disposition !== undefined) {
      // CONST.TOKEN_DISPOSITIONS: HOSTILE = -1, NEUTRAL = 0, FRIENDLY = 1
      if (tok.document.disposition === 1) {
        relationship = 'ally';
        allies.push(targetActor.name);
      } else if (tok.document.disposition === -1) {
        relationship = 'enemy';
        enemies.push(targetActor.name);
      } else {
        neutral.push(targetActor.name);
      }
    } else if (targetActor.id === caster.id) {
      // Self-targeting is always considered an ally relationship
      relationship = 'ally';
      allies.push(targetActor.name);
    }

    targetData.push({
      id: targetId,
      name: targetActor.name,
      uuid: targetActor.uuid,
      relationship: relationship
    });
  }

  const sustainingName = `Sustaining: ${spell.name} (${targetData.length} target${targetData.length > 1 ? 's' : ''})`;
  
  // Prepare effect data for caster - single effect tracking all targets
  let effectData = {
    type: 'effect',
    name: sustainingName,
    slug: sustainingSlug,
    img: spell.img,
    system: {
      slug: sustainingSlug,
      description: { 
        value: `${spell.system?.description?.value || ''}`
      },
      duration: { value: 1, unit: 'rounds', sustained: true, expiry: 'turn-end' },
      start: { value: game.combat ? game.combat.round : 0, initiative: null },
      level: { value: castLevel || 1 },
      unidentified: true
    },
    flags: {
      world: {
        sustainedSpell: {
          spellUuid: spell.uuid,
          spellName: spell.name,
          createdFromChat: msg.id,
          maxSustainRounds: maxRounds,
          targets: targetData,
          targetCount: targetData.length,
          allies: allies,
          enemies: enemies,
          neutral: neutral
        }
      }
    }
  };

  // Create the sustaining effect on the caster
  const created = await caster.createEmbeddedDocuments('Item', [effectData]);
  const sustainEffect = created?.[0] || caster.itemTypes.effect.find(e => e.slug === sustainingSlug);
  console.log(`[PF2e Spell Sustainer] Applied sustaining effect to ${caster.name} for spell ${spell.name} on ${targetData.length} target(s)`);

  // Create individual "sustained-by" effects on each target
  for (const target of targetData) {
    const targetActor = game.actors.get(target.id);
    if (!targetActor) continue;

    const childSlug = `sustained-by-${spellSlug}-from-${caster.id}`;
    const childName = `Sustained by: ${caster.name} (${spell.name})`;
    
    // Check if child effect already exists on this target
    let existingChild = targetActor.itemTypes.effect.find(e => e.slug === childSlug || e.name === childName);
    if (existingChild) {
      console.log(`[PF2e Spell Sustainer] Target ${targetActor.name} already has sustained effect for ${spell.name} from ${caster.name}`);
      continue;
    }

    let childEffectData = {
      type: 'effect',
      name: childName,
      slug: childSlug,
      img: spell.img,
      system: {
        slug: childSlug,
        description: { 
          value: `This creature is affected by a spell sustained by ${caster.name}. (${target.relationship === 'ally' ? 'Allied' : target.relationship === 'enemy' ? 'Hostile' : 'Neutral'} effect)`
        },
        duration: { value: maxRounds, unit: 'rounds', sustained: true, expiry: 'turn-end' },
        start: { value: game.combat ? game.combat.round : 0, initiative: null },
        level: { value: castLevel || 1 }
      },
      flags: {
        world: {
          sustainedBy: { effectUuid: sustainEffect?.uuid },
          sustainedSpell: {
            spellUuid: spell.uuid,
            spellName: spell.name,
            casterUuid: caster.uuid,
            createdFromChat: msg.id,
            casterEffectId: sustainEffect?.id,
            targetName: targetActor.name,
            maxSustainRounds: maxRounds,
            relationship: target.relationship
          }
        }
      }
    };

    await targetActor.createEmbeddedDocuments('Item', [childEffectData]);
    console.log(`[PF2e Spell Sustainer] Applied linked effect to ${target.relationship} target ${targetActor.name}`);
  }
}

// Detect sustained spell casts and auto-generate effects for caster and target
Hooks.on('createChatMessage', async (msg, options, userId) => {
  await handleSustainedSpellCast(msg, options, userId);
});

// Global dialog tracking
let currentSustainDialog = null;
let currentSustainDialogActor = null;

// Sustain dialog with chat card output
function showSustainDialog(actor) {
  console.log('[PF2e Spell Sustainer] Opening sustain dialog for:', actor.name);
  
  // Close existing dialog if open
  if (currentSustainDialog) {
    console.log('[PF2e Spell Sustainer] Closing existing dialog');
    currentSustainDialog.close();
  }

  // Find sustaining effects
  const sustainingEffects = actor.itemTypes.effect.filter(e =>
    (e.slug && e.slug.startsWith('sustaining-')) ||
    (e.name && e.name.startsWith('Sustaining: '))
  );
  console.log('[PF2e Spell Sustainer] Found', sustainingEffects.length, 'sustaining effects');
  
  if (!sustainingEffects.length) {
    ui.notifications.info('No sustained spells to sustain.');
    return;
  }

  // Helper function to highlight target tokens
  function highlightTargets(effect, highlight = true) {
    const sustainedSpellData = effect.flags?.world?.sustainedSpell;
    if (!sustainedSpellData?.targets || !canvas.tokens) return;

    // Find tokens for the targets
    const targetTokens = [];
    for (const target of sustainedSpellData.targets) {
      // Find token by actor ID in current scene
      const token = canvas.tokens.placeables.find(t => t.actor?.id === target.id);
      if (token) targetTokens.push(token);
    }

    // Apply or remove highlight
    for (const token of targetTokens) {
      if (highlight) {
        // Use Foundry's built-in targeting system for visual feedback
        token.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: true });
        
        // Get relationship for color coding
        const relationship = sustainedSpellData.targets.find(t => t.id === token.actor.id)?.relationship;
        let pingColor = 0xFFFFFF; // Default white
        if (relationship === 'ally') pingColor = 0x4CAF50; // Green
        else if (relationship === 'enemy') pingColor = 0xF44336; // Red
        else if (relationship === 'neutral') pingColor = 0x9E9E9E; // Gray
        
        // Try multiple highlighting approaches for maximum visibility
        try {
          // Simple ping
          canvas.ping(token.center, { color: pingColor });
        } catch (e) {
          console.log('Ping failed, using alternative highlight');
        }
        
        // Add a temporary visual indicator using token filters
        try {
          token.mesh.filters = token.mesh.filters || [];
          const glowFilter = new PIXI.filters.GlowFilter({
            distance: 10,
            outerStrength: 2,
            innerStrength: 1,
            color: pingColor,
            quality: 0.1
          });
          token.mesh.filters.push(glowFilter);
          token._sustainGlowFilter = glowFilter;
        } catch (e) {
          console.log('Glow filter failed, using basic highlight');
          // Fallback: just use targeting
        }
        
        // Store the token for cleanup
        token._sustainHighlight = true;
      } else {
        // Remove targeting highlight
        if (token._sustainHighlight) {
          token.setTarget(false, { user: game.user, releaseOthers: false });
          
          // Remove glow filter if it exists
          if (token._sustainGlowFilter && token.mesh.filters) {
            const filterIndex = token.mesh.filters.indexOf(token._sustainGlowFilter);
            if (filterIndex > -1) {
              token.mesh.filters.splice(filterIndex, 1);
            }
            delete token._sustainGlowFilter;
          }
          
          token._sustainHighlight = false;
        }
      }
    }
  }

  // Track currently highlighted effect for cleanup
  let currentlyHighlighted = null;

  // Build clickable list
  const options = sustainingEffects.map(e => {
    const spellName = e.flags?.world?.sustainedSpell?.spellName || e.name.replace(/^Sustaining: /, '').replace(/ \(\d+ targets?\)$/, '');
    const sustainedSpellData = e.flags?.world?.sustainedSpell;
    const maxRounds = sustainedSpellData?.maxSustainRounds || 10;
    const curRounds = e.system?.duration?.value || 0;
    const img = e.img || 'icons/svg/mystery-man.svg';
    // For Bless, never disable since we track aura counter, not rounds
    const disabled = (sustainedSpellData?.spellType === 'bless') ? '' : (curRounds >= maxRounds ? 'disabled' : '');
    
    // Format target information
    let targetInfo = '';
    if (sustainedSpellData?.targets && sustainedSpellData.targets.length > 0) {
      const targetCount = sustainedSpellData.targetCount || sustainedSpellData.targets.length;
      const allies = sustainedSpellData.allies || [];
      const enemies = sustainedSpellData.enemies || [];
      const neutral = sustainedSpellData.neutral || [];
      
      const summary = [];
      if (allies.length) summary.push(`${allies.length} ally${allies.length > 1 ? 'ies' : ''}`);
      if (enemies.length) summary.push(`${enemies.length} enem${enemies.length > 1 ? 'ies' : 'y'}`);
      if (neutral.length) summary.push(`${neutral.length} neutral`);
      
      targetInfo = ` <span style='color: #666'>(${summary.join(', ')})</span>`;
    } else if (sustainedSpellData?.targetName) {
      // Legacy single target format
      targetInfo = ` <span style='color: #888'>(Target: ${sustainedSpellData.targetName})</span>`;
    }
    
    // For Bless, show aura size in feet instead of rounds
    let statusInfo = '';
    if (sustainedSpellData?.spellType === 'bless') {
      const auraCounter = sustainedSpellData?.auraCounter || 1;
      const auraSize = 5 + (auraCounter * 10);
      statusInfo = `<span style='color:#888'>(${auraSize} Feet Aura) (Rounds: ${curRounds})</span>`;
    } else {
      statusInfo = `<span style='color:#888'>(Rounds: ${curRounds}/${maxRounds})</span>`;
    }
    
    return `<li class='sustain-spell-row' data-effect-id='${e.id}' ${disabled} style='cursor:pointer;display:flex;align-items:center;gap:0.5em;opacity:${disabled ? 0.5 : 1}'>
      <img src='${img}' width='32' height='32'>
      <span>${spellName}${targetInfo}</span>
      ${statusInfo}
    </li>`;
  }).join('');
  const content = `
    <div>
      <div style='margin-bottom:0.5em;'>Select a spell to sustain:</div>
      <ul style='list-style:none;padding:0;margin:0;'>
        ${options}
      </ul>
      <p style="font-size: 0.8em; color: #666; margin-top: 0.5em; font-style: italic;">
        Hover over spells to highlight their targets on the map.
      </p>
    </div>
    <style>
      .sustain-spell-row:hover { background: #e0e0e0; }
      .sustain-spell-row[disabled] { pointer-events: none; }
    </style>
  `;
  const dialog = new Dialog({
    title: 'Sustain a Spell',
    content,
    buttons: { cancel: { label: 'Cancel' } },
    render: html => {
      html.find('.sustain-spell-row').each(function() {
        const $row = $(this);
        if ($row.attr('disabled')) return;
        
        const effectId = $row.data('effect-id');
        const effect = actor.items.get(effectId);
        
        // Add hover handlers for highlighting
        $row.on('mouseenter', function() {
          // Clear any existing highlights
          if (currentlyHighlighted) {
            highlightTargets(currentlyHighlighted, false);
          }
          // Highlight targets for this effect
          highlightTargets(effect, true);
          currentlyHighlighted = effect;
        });
        
        $row.on('mouseleave', function() {
          // Don't immediately clear on mouse leave - let the next hover or dialog close handle it
          // This prevents flickering when moving between elements
        });
        
        $row.on('click', async function() {
          if (!effect) return;
          const maxRounds = effect.flags?.world?.sustainedSpell?.maxSustainRounds || 10;
          const curRounds = effect.system?.duration?.value || 0;
          const spellType = effect.flags?.world?.sustainedSpell?.spellType;
          
          // Clean up any glow effects from hovering with timeout to ensure cleanup
          if (currentlyHighlighted) {
            highlightTargets(currentlyHighlighted, false);
            currentlyHighlighted = null;
          }
          
          // Additional cleanup after sustain action with delay
          setTimeout(() => {
            if (currentlyHighlighted) {
              highlightTargets(currentlyHighlighted, false);
              currentlyHighlighted = null;
            }
          }, 150);
          
          // For Bless, don't check max rounds since we track aura counter
          if (spellType !== 'bless' && curRounds >= maxRounds) {
            ui.notifications.warn('This effect is already at its maximum duration.');
            return;
          }
          
          // Handle special sustain behaviors based on spell type
          const sustainedSpellData = effect.flags?.world?.sustainedSpell;
          
          if (spellType === 'forbidding-ward') {
            await handleForbiddingWardSustain(effect, actor);
          } else if (spellType === 'bless') {
            await handleBlessSustain(effect, actor);
          } else {
            // Standard sustain behavior
            await effect.update({
              'system.duration.value': Math.min(curRounds + 1, maxRounds),
              'flags.world.sustainedThisTurn': true
            });
          }
          
          // Output a chat card styled like PF2e item cards
          const speaker = ChatMessage.getSpeaker({ actor });
          const spellName = effect.flags?.world?.sustainedSpell?.spellName || effect.name.replace(/^Sustaining: /, '').replace(/ \(\d+ targets?\)$/, '');
          const img = effect.img || 'icons/svg/mystery-man.svg';
          const desc = effect.system?.description?.value || '';
          const actionGlyph = `<span class='action-glyph'>1</span>`;
          

          
          // Add special behavior notes to chat
          let specialNote = '';
          if (spellType === 'forbidding-ward') {
            specialNote = '<br/><em>Sustaining added 1 round to target effects.</em>';
          } else if (spellType === 'bless') {
            const counter = sustainedSpellData?.auraCounter || 1;
            const auraSize = 5 + (counter * 10);
            specialNote = `<br/><em>Aura size increased by 10 Feet.</em>`;
          }
          
          ChatMessage.create({
            user: game.user.id,
            speaker,
            content: `
              <div class='pf2e chat-card item-card' data-actor-id='${actor.id}' data-item-id='${effect.id}'>
                <header class='card-header flexrow'>
                  <img src='${img}' alt='${spellName}' />
                  <h3>${spellName} ${actionGlyph}</h3>
                </header>
                <div class='card-content'>
                  <p><strong>${actor.name} sustained this spell.</strong>${specialNote}</p>
                  <hr />
                  ${desc}
                </div>
              </div>
            `
          });
          dialog.close();
        });
      });
    },
    close: () => {
      // Clean up any remaining highlights when dialog closes
      if (currentlyHighlighted) {
        highlightTargets(currentlyHighlighted, false);
        currentlyHighlighted = null;
      }
      // Clear global dialog tracking
      currentSustainDialog = null;
      currentSustainDialogActor = null;
    }
  });
  
  // Track the dialog globally for auto-refresh
  currentSustainDialog = dialog;
  currentSustainDialogActor = actor;
  console.log('[PF2e Spell Sustainer] Dialog tracking set for:', actor.name);
  
  dialog.render(true);
}

// Function to refresh the sustain dialog if it's open
function refreshSustainDialog() {
  if (!currentSustainDialog || !currentSustainDialogActor) {
    console.log('[PF2e Spell Sustainer] No dialog or actor to refresh');
    return;
  }
  
  console.log('[PF2e Spell Sustainer] Refreshing sustain dialog for:', currentSustainDialogActor.name);
  
  // Check if the actor still has sustaining effects
  const sustainingEffects = currentSustainDialogActor.itemTypes.effect.filter(e =>
    (e.slug && e.slug.startsWith('sustaining-')) ||
    (e.name && e.name.startsWith('Sustaining: '))
  );
  
  console.log('[PF2e Spell Sustainer] Found', sustainingEffects.length, 'sustaining effects');
  
  if (sustainingEffects.length === 0) {
    // No more sustaining effects, close the dialog
    console.log('[PF2e Spell Sustainer] No sustaining effects, closing dialog');
    currentSustainDialog.close();
    return;
  }
  
  // Re-open the dialog with updated data
  const actorRef = currentSustainDialogActor;
  console.log('[PF2e Spell Sustainer] Re-opening dialog with updated data');
  currentSustainDialog.close(); // This will clear the global tracking
  setTimeout(() => {
    showSustainDialog(actorRef); // Re-open with fresh data
  }, 50); // Small delay to ensure clean close
}

// Start-of-turn chat reminder
Hooks.on('pf2e.startTurn', async (combatant, combat, userId) => {
  const actor = combatant.actor;
  if (!actor || actor.type !== 'character') return;
  // Find sustaining effects (robust)
  const sustainingEffects = actor.itemTypes.effect.filter(e =>
    (e.slug && e.slug.startsWith('sustaining-')) ||
    (e.name && e.name.startsWith('Sustaining: '))
  );
  if (!sustainingEffects.length) return;
  // Build list of sustained spells with icon, name, and target information
  const effectList = sustainingEffects.map(e => {
    const spellName = e.flags?.world?.sustainedSpell?.spellName || e.name.replace(/^Sustaining: /, '').replace(/ \(\d+ targets?\)$/, '');
    const sustainedSpellData = e.flags?.world?.sustainedSpell;
    const img = e.img || 'icons/svg/mystery-man.svg';
    
    // Format target information
    let targetInfo = '';
    if (sustainedSpellData?.targets && sustainedSpellData.targets.length > 0) {
      const allies = sustainedSpellData.allies || [];
      const enemies = sustainedSpellData.enemies || [];
      const neutral = sustainedSpellData.neutral || [];
      
      const details = [];
      if (allies.length) details.push(`<span style='color: #2e7d32;'>${allies.join(', ')}</span>`);
      if (enemies.length) details.push(`<span style='color: #c62828;'>${enemies.join(', ')}</span>`);
      if (neutral.length) details.push(`<span style='color: #616161;'>${neutral.join(', ')}</span>`);
      
      targetInfo = details.length ? ` (${details.join(', ')})` : '';
    } else if (sustainedSpellData?.targetName) {
      // Legacy single target format
      targetInfo = ` <span style='color: #888'>(${sustainedSpellData.targetName})</span>`;
    }
    
    return `<li><img src="${img}" width="32" height="32"> ${spellName}${targetInfo}</li>`;
  }).join('');
  const body = `
    <div class="participant-conditions">
      <h4>${actor.name} is sustaining:</h4>
      <ul>
        ${effectList}
      </ul>
      <p style="font-size: 0.9em; color: #666; margin-top: 0.5em;">
        <span style='color: #2e7d32;'>Green</span> = Allies, 
        <span style='color: #c62828;'>Red</span> = Enemies, 
        <span style='color: #616161;'>Gray</span> = Neutral
      </p>
    </div>
  `;
  // Send chat message to the owner(s)
  const owners = actor?.getUserLevel ? Object.entries(actor.getUserLevel()).filter(([id, lvl]) => lvl >= 2).map(([id]) => id) : [];
  ChatMessage.create({
    user: game.user.id,
    whisper: owners.length ? owners : [game.user.id],
    speaker: { actor: actor.id, alias: actor.name },
    content: body
  });
});

// PF2e HUD Integration
let hudIntegration = null;
let positionedPanelIntegration = null;

class PF2eHUDSustainedSpellsIntegration {
  constructor() {
    this.enabled = false;
    this.highlightedEffect = null;
  }

  init() {
    if (!game.modules.get('pf2e-hud')?.active) {
      console.log('[PF2e Spell Sustainer] PF2e HUD not active, skipping integration');
      return;
    }

    console.log('[PF2e Spell Sustainer] Initializing PF2e HUD integration');
    this.enabled = true;
    this.setupHooks();
  }

  setupHooks() {
    // Hook into pf2e-hud rendering - try multiple approaches to catch the HUD
    Hooks.on('renderApplication', (app, html, data) => {
      if (app.constructor.name === 'ActorHUD' || 
          app.id?.includes('pf2e-hud') || 
          app.id?.includes('actor-hud') ||
          html.find('[data-panel="stats"]').length > 0) {
        this.injectSustainedSpellsSection(app, html, data);
      }
    });

    // Also hook into the more specific PF2e HUD render event if it exists
    Hooks.on('pf2e-hud.actorHUD.render', (app, html, data) => {
      this.injectSustainedSpellsSection(app, html, data);
    });

    // Alternative hook for when HUD updates
    Hooks.on('updateActor', (actor, data, options, userId) => {
      if (game.user.id === userId) {
        this.refreshSustainedSpellsDisplay(actor);
      }
    });
  }

  async injectSustainedSpellsSection(app, html, data) {
    try {
      // Get the actor from the app
      const actor = app.object || app.actor;
      if (!actor || actor.type !== 'character') return;

      // Find sustained spells
      const sustainingEffects = actor.itemTypes.effect.filter(e =>
        (e.slug && e.slug.startsWith('sustaining-')) ||
        (e.name && e.name.startsWith('Sustaining: '))
      );

      if (sustainingEffects.length === 0) return;

      // Find the stats panel to inject our component
      const statsPanel = html.find('[data-panel="stats"]');
      if (statsPanel.length === 0) {
        console.debug('[PF2e Spell Sustainer] Stats panel not found, trying alternative selectors');
        // Try alternative selectors for different HUD versions
        const alternativePanel = html.find('.pf2e-hud-stats, .hud-stats, .actor-stats').first();
        if (alternativePanel.length === 0) return;
        alternativePanel.attr('data-panel', 'stats');
      }

      // Prevent duplicate injection
      if (html.find('[data-section="sustained-spells"]').length > 0) {
        console.debug('[PF2e Spell Sustainer] Sustained spells section already exists, skipping injection');
        return;
      }

      // Create and inject the sustained spells component
      const sustainedSpellsHtml = await this.createSustainedSpellsHTML(actor, sustainingEffects);
      
      // Inject after the existing sections (before any final sections)
      const lastSection = statsPanel.find('[data-section]').last();
      if (lastSection.length > 0) {
        lastSection.after(sustainedSpellsHtml);
      } else {
        statsPanel.append(sustainedSpellsHtml);
      }

      // Set up event handlers
      this.setupEventHandlers(html, actor, sustainingEffects);
      
      console.debug(`[PF2e Spell Sustainer] Successfully injected sustained spells section for ${actor.name} (${sustainingEffects.length} spells)`);
    } catch (error) {
      console.error('[PF2e Spell Sustainer] Error injecting sustained spells section:', error);
    }
  }

  async createSustainedSpellsHTML(actor, sustainingEffects) {
    const spells = sustainingEffects.map(effect => {
      const spellName = effect.flags?.world?.sustainedSpell?.spellName || 
                      effect.name.replace(/^Sustaining: /, '').replace(/ \(\d+ targets?\)$/, '');
      const sustainedSpellData = effect.flags?.world?.sustainedSpell;
      const maxRounds = sustainedSpellData?.maxSustainRounds || 10;
      const curRounds = effect.system?.duration?.value || 0;
      const img = effect.img || 'icons/svg/mystery-man.svg';
      
      // For Bless, show aura info
      let statusInfo = '';
      if (sustainedSpellData?.spellType === 'bless') {
        const auraCounter = sustainedSpellData?.auraCounter || 1;
        const auraSize = 5 + (auraCounter * 10);
        statusInfo = `${auraSize}ft aura`;
      } else {
        statusInfo = `${curRounds}/${maxRounds}`;
      }

      // Check if at max duration
      const atMax = sustainedSpellData?.spellType !== 'bless' && curRounds >= maxRounds;

      return {
        id: effect.id,
        name: spellName,
        img: img,
        status: statusInfo,
        disabled: atMax,
        targets: sustainedSpellData?.targets || []
      };
    });

    return `
      <div data-section="sustained-spells" class="sustained-spells-section">
        <div class="sustained-spells-header">
          <i class="fa-solid fa-magic"></i>
          <span>Sustained (${spells.length})</span>
        </div>
        <div class="sustained-spells-grid">
          ${spells.map(spell => `
            <div class="sustained-spell-item ${spell.disabled ? 'disabled' : ''}" 
                 data-effect-id="${spell.id}" 
                 data-tooltip="${spell.name}${spell.targets.length > 0 ? ` (${spell.targets.length} targets)` : ''}">
              <img src="${spell.img}" alt="${spell.name}">
              <div class="spell-info">
                <div class="spell-name">${spell.name}</div>
                <div class="spell-status">${spell.status}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  setupEventHandlers(html, actor, sustainingEffects) {
    const sustainedSection = html.find('.sustained-spells-section');
    
    sustainedSection.find('.sustained-spell-item').each((index, element) => {
      const $item = $(element);
      const effectId = $item.data('effect-id');
      const effect = sustainingEffects.find(e => e.id === effectId);
      
      if (!effect || $item.hasClass('disabled')) return;

      // Hover effects for target highlighting
      $item.on('mouseenter', () => {
        this.highlightTargets(effect, true);
        $item.addClass('hovering');
      });

      $item.on('mouseleave', () => {
        this.highlightTargets(effect, false);
        $item.removeClass('hovering');
      });

      // Click to sustain
      $item.on('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.sustainSpell(actor, effect);
      });
    });
  }

  highlightTargets(effect, highlight = true) {
    const sustainedSpellData = effect.flags?.world?.sustainedSpell;
    if (!sustainedSpellData?.targets || !canvas.tokens) return;

    // Find tokens for the targets
    const targetTokens = [];
    for (const target of sustainedSpellData.targets) {
      const token = canvas.tokens.placeables.find(t => t.actor?.id === target.id);
      if (token) targetTokens.push(token);
    }

    // Apply or remove highlight
    for (const token of targetTokens) {
      if (highlight) {
        // Use Foundry's built-in targeting system for visual feedback
        token.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: true });
        
        // Get relationship for color coding
        const relationship = sustainedSpellData.targets.find(t => t.id === token.actor.id)?.relationship;
        let pingColor = 0xFFFFFF; // Default white
        if (relationship === 'ally') pingColor = 0x4CAF50; // Green
        else if (relationship === 'enemy') pingColor = 0xF44336; // Red
        else if (relationship === 'neutral') pingColor = 0x9E9E9E; // Gray
        
        // Simple ping
        try {
          canvas.ping(token.center, { color: pingColor });
        } catch (e) {
          console.log('Ping failed:', e);
        }
        
        token._sustainHighlight = true;
      } else {
        // Remove targeting highlight
        if (token._sustainHighlight) {
          token.setTarget(false, { user: game.user, releaseOthers: false });
          token._sustainHighlight = false;
        }
      }
    }
  }

  async sustainSpell(actor, effect) {
    const maxRounds = effect.flags?.world?.sustainedSpell?.maxSustainRounds || 10;
    const curRounds = effect.system?.duration?.value || 0;
    const spellType = effect.flags?.world?.sustainedSpell?.spellType;
    
    // For Bless, don't check max rounds since we track aura counter
    if (spellType !== 'bless' && curRounds >= maxRounds) {
      ui.notifications.warn('This effect is already at its maximum duration.');
      return;
    }
    
    // Handle special sustain behaviors based on spell type
    const sustainedSpellData = effect.flags?.world?.sustainedSpell;
    
    if (spellType === 'forbidding-ward') {
      await handleForbiddingWardSustain(effect, actor);
    } else if (spellType === 'bless') {
      await handleBlessSustain(effect, actor);
    } else {
      // Standard sustain behavior
      await effect.update({
        'system.duration.value': Math.min(curRounds + 1, maxRounds),
        'flags.world.sustainedThisTurn': true
      });
    }
    
    // Output a chat card
    await this.createSustainChatMessage(actor, effect);
  }

  async createSustainChatMessage(actor, effect) {
    const speaker = ChatMessage.getSpeaker({ actor });
    const spellName = effect.flags?.world?.sustainedSpell?.spellName || 
                     effect.name.replace(/^Sustaining: /, '').replace(/ \(\d+ targets?\)$/, '');
    const img = effect.img || 'icons/svg/mystery-man.svg';
    const desc = effect.system?.description?.value || '';
    const actionGlyph = `<span class='action-glyph'>1</span>`;
    
    const sustainedSpellData = effect.flags?.world?.sustainedSpell;
    
    // Add special behavior notes to chat
    let specialNote = '';
    const spellType = sustainedSpellData?.spellType;
    if (spellType === 'forbidding-ward') {
      specialNote = '<br/><em>Sustaining added 1 round to target effects.</em>';
    } else if (spellType === 'bless') {
      specialNote = `<br/><em>Aura size increased by 10 feet.</em>`;
    }
    
    ChatMessage.create({
      user: game.user.id,
      speaker,
      content: `
        <div class='pf2e chat-card item-card' data-actor-id='${actor.id}' data-item-id='${effect.id}'>
          <header class='card-header flexrow'>
            <img src='${img}' alt='${spellName}' />
            <h3>${spellName} ${actionGlyph}</h3>
          </header>
          <div class='card-content'>
            <p><strong>${actor.name} sustained this spell.</strong>${specialNote}</p>
            <hr />
            ${desc}
          </div>
        </div>
      `
    });
  }

  refreshSustainedSpellsDisplay(actor) {
    // This could be used to update the display when actor data changes
    // For now, we rely on the natural re-rendering of the HUD
  }
}

// Positioned Panel Integration (alternative to PF2e HUD)
class PositionedPanelSustainedSpellsIntegration {
  constructor() {
    this.enabled = false;
    this.currentPanel = null;
  }

  init() {
    console.log('[PF2e Spell Sustainer] Initializing positioned panel integration');
    this.enabled = true;
    this.setupHooks();
    this.refreshPanel(); // Create initial panel if needed
  }

  setupHooks() {
    // Refresh panel when actor data changes
    Hooks.on('controlToken', () => this.refreshPanel());
    Hooks.on('updateActor', () => this.refreshPanel());
    Hooks.on('updateItem', () => this.refreshPanel());
  }

  refreshPanel() {
    // Remove existing panel
    if (this.currentPanel) {
      this.currentPanel.remove();
      this.currentPanel = null;
    }

    // Get current actor
    const actor = canvas.tokens?.controlled?.[0]?.actor || game.user?.character;
    if (!actor) return;

    // Get sustained spells
    const sustainingEffects = actor.itemTypes.effect.filter(e =>
      (e.slug && e.slug.startsWith('sustaining-')) ||
      (e.name && e.name.startsWith('Sustaining: '))
    );

    if (sustainingEffects.length === 0) return;

    // Create new panel
    this.createPanel(actor, sustainingEffects);
  }

  createPanel(actor, sustainingEffects) {
    const panel = document.createElement('div');
    panel.id = 'sustained-spells-smart-panel';

    const spells = sustainingEffects.map(effect => {
      const spellName = effect.flags?.world?.sustainedSpell?.spellName || 
                      effect.name.replace(/^Sustaining: /, '').replace(/ \(\d+ targets?\)$/, '');
      const sustainedSpellData = effect.flags?.world?.sustainedSpell;
      const maxRounds = sustainedSpellData?.maxSustainRounds || 10;
      const curRounds = effect.system?.duration?.value || 0;
      const disabled = (sustainedSpellData?.spellType === 'bless') ? false : (curRounds >= maxRounds);

      // Format target information
      let targetInfo = '';
      if (sustainedSpellData?.targets && sustainedSpellData.targets.length > 0) {
        const allies = sustainedSpellData.allies || [];
        const enemies = sustainedSpellData.enemies || [];
        const neutral = sustainedSpellData.neutral || [];
        
        const summary = [];
        if (allies.length) summary.push(`${allies.length} ally${allies.length > 1 ? 'ies' : ''}`);
        if (enemies.length) summary.push(`${enemies.length} enem${enemies.length > 1 ? 'ies' : 'y'}`);
        if (neutral.length) summary.push(`${neutral.length} neutral`);
        
        if (summary.length > 0) {
          targetInfo = ` <span style='color: #666'>(${summary.join(', ')})</span>`;
        }
      } else if (sustainedSpellData?.targetName) {
        targetInfo = ` <span style='color: #888'>(Target: ${sustainedSpellData.targetName})</span>`;
      }

      // Status information
      let statusInfo = '';
      if (sustainedSpellData?.spellType === 'bless') {
        const auraCounter = sustainedSpellData?.auraCounter || 1;
        const auraSize = 5 + (auraCounter * 10);
        statusInfo = `<span style='color:#888'>(${auraSize} Feet Aura) (Rounds: ${curRounds})</span>`;
      } else {
        statusInfo = `<span style='color:#888'>(Rounds: ${curRounds}/${maxRounds})</span>`;
      }

      return {
        effect,
        html: `
          <div class="sustained-spell-entry ${disabled ? 'disabled' : ''}" data-effect-id="${effect.id}" data-tooltip="${spellName}: Click to sustain">
            <img src="${effect.img}" alt="${spellName}">
            <div class="spell-details">
              <div class="spell-name">${spellName}${targetInfo}</div>
              <div class="spell-status">${statusInfo}</div>
            </div>
          </div>
        `
      };
    });

    panel.innerHTML = `
      <div id="sustained-panel-content">
        <div class="sustained-spells-header">Sustained Spells</div>
        <div class="sustained-spells-list">
          ${spells.map(spell => spell.html).join('')}
        </div>
      </div>
    `;

    // Setup event handlers
    this.setupEventHandlers(panel, actor, sustainingEffects);

    // Add to body
    document.body.appendChild(panel);
    this.currentPanel = panel;

    console.log(`[PF2e Spell Sustainer] Created positioned panel with ${sustainingEffects.length} sustained spells`);
  }

  setupEventHandlers(panel, actor, sustainingEffects) {
    panel.querySelectorAll('.sustained-spell-entry').forEach(entry => {
      const effectId = entry.dataset.effectId;
      const effect = sustainingEffects.find(e => e.id === effectId);
      
      if (!effect) return;

      // Hover effects for target highlighting
      entry.addEventListener('mouseenter', () => {
        this.highlightTargets(effect, true);
      });

      entry.addEventListener('mouseleave', () => {
        this.highlightTargets(effect, false);
      });

      // Click to sustain
      entry.addEventListener('click', async () => {
        if (entry.classList.contains('disabled')) return;
        
        // Clean up any glow effects before sustaining and add delay to ensure cleanup
        this.highlightTargets(effect, false);
        
        // Use setTimeout to ensure glow cleanup happens before any DOM refresh
        setTimeout(async () => {
          await this.sustainSpell(actor, effect);
          
          // Additional cleanup after sustain in case DOM refresh interrupts
          setTimeout(() => {
            this.highlightTargets(effect, false);
          }, 100);
        }, 50);
      });
    });
  }

  highlightTargets(effect, highlight = true) {
    const sustainedSpellData = effect.flags?.world?.sustainedSpell;
    if (!sustainedSpellData?.targets || !canvas.tokens) return;

    // Find tokens for the targets
    const targetTokens = [];
    for (const target of sustainedSpellData.targets) {
      const token = canvas.tokens.placeables.find(t => t.actor?.id === target.id);
      if (token) targetTokens.push(token);
    }

    // Apply or remove highlight
    for (const token of targetTokens) {
      if (highlight) {
        // Use Foundry's built-in targeting system for visual feedback
        token.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: true });
        
        // Get relationship for color coding
        const relationship = sustainedSpellData.targets.find(t => t.id === token.actor.id)?.relationship;
        let pingColor = 0xFFFFFF; // Default white
        if (relationship === 'ally') pingColor = 0x4CAF50; // Green
        else if (relationship === 'enemy') pingColor = 0xF44336; // Red
        else if (relationship === 'neutral') pingColor = 0x9E9E9E; // Gray
        
        // Simple ping
        try {
          canvas.ping(token.center, { color: pingColor });
        } catch (e) {
          console.log('Ping failed:', e);
        }
        
        // Add glow filter for enhanced visibility
        try {
          token.mesh.filters = token.mesh.filters || [];
          const glowFilter = new PIXI.filters.GlowFilter({
            distance: 10,
            outerStrength: 2,
            innerStrength: 1,
            color: pingColor,
            quality: 0.1
          });
          token.mesh.filters.push(glowFilter);
          token._sustainGlowFilter = glowFilter;
        } catch (e) {
          console.log('Glow filter failed, using basic highlight');
        }
        
        token._sustainHighlight = true;
      } else {
        // Remove targeting highlight
        if (token._sustainHighlight) {
          token.setTarget(false, { user: game.user, releaseOthers: false });
          
          // Remove glow filter if it exists
          if (token._sustainGlowFilter && token.mesh.filters) {
            const filterIndex = token.mesh.filters.indexOf(token._sustainGlowFilter);
            if (filterIndex > -1) {
              token.mesh.filters.splice(filterIndex, 1);
            }
            delete token._sustainGlowFilter;
          }
          
          token._sustainHighlight = false;
        }
      }
    }
  }

  async sustainSpell(actor, effect) {
    const maxRounds = effect.flags?.world?.sustainedSpell?.maxSustainRounds || 10;
    const curRounds = effect.system?.duration?.value || 0;
    const spellType = effect.flags?.world?.sustainedSpell?.spellType;
    
    // For Bless, don't check max rounds since we track aura counter
    if (spellType !== 'bless' && curRounds >= maxRounds) {
      ui.notifications.warn('This effect is already at its maximum duration.');
      return;
    }
    
    // Handle special sustain behaviors based on spell type
    if (spellType === 'forbidding-ward') {
      await handleForbiddingWardSustain(effect, actor);
    } else if (spellType === 'bless') {
      await handleBlessSustain(effect, actor);
    } else {
      // Standard sustain behavior
      await effect.update({
        'system.duration.value': Math.min(curRounds + 1, maxRounds),
        'flags.world.sustainedThisTurn': true
      });
    }
    
    // Output a chat card (reuse from HUD integration)
    if (hudIntegration && typeof hudIntegration.createSustainChatMessage === 'function') {
      await hudIntegration.createSustainChatMessage(actor, effect);
    }

    // Refresh the panel to show updated state
    this.refreshPanel();
  }

  disable() {
    if (this.currentPanel) {
      this.currentPanel.remove();
      this.currentPanel = null;
    }
    this.enabled = false;
  }
}

// Initialize integrations
Hooks.once('ready', () => {
  hudIntegration = new PF2eHUDSustainedSpellsIntegration();
  hudIntegration.init();

  // Also initialize positioned panel integration as an alternative
  positionedPanelIntegration = new PositionedPanelSustainedSpellsIntegration();
  positionedPanelIntegration.init();
});

// Hook to refresh positioned panel when sustaining effects change
Hooks.on('updateActor', (actor, data, options, userId) => {
  // Refresh positioned panel if this is the current controlled actor
  const currentActor = canvas.tokens?.controlled?.[0]?.actor || game.user?.character;
  if (currentActor && actor.id === currentActor.id && positionedPanelIntegration?.enabled) {
    console.log('[PF2e Spell Sustainer] Actor updated, refreshing positioned panel');
    setTimeout(() => {
      positionedPanelIntegration.refreshPanel();
    }, 100);
  }
  
  // Also refresh dialog if it's open
  if (currentSustainDialogActor && actor.id === currentSustainDialogActor.id) {
    setTimeout(() => {
      refreshSustainDialog();
    }, 100);
  }
});

// Hook to refresh positioned panel when items (effects) are created/deleted
Hooks.on('createItem', (item, options, userId) => {
  console.log('[PF2e Spell Sustainer] createItem hook fired:', item.name, item.type);
  
  if (item.type === 'effect' && item.parent?.type === 'character') {
    const actor = item.parent;
    console.log('[PF2e Spell Sustainer] Effect created on character:', actor.name);
    
    // Check if this is a sustaining effect
    const isSustainingEffect = (item.slug && item.slug.startsWith('sustaining-')) || 
                              (item.name && item.name.startsWith('Sustaining: '));
    
    if (isSustainingEffect) {
      // Refresh positioned panel if this is the current controlled actor
      const currentActor = canvas.tokens?.controlled?.[0]?.actor || game.user?.character;
      if (currentActor && actor.id === currentActor.id && positionedPanelIntegration?.enabled) {
        console.log('[PF2e Spell Sustainer] Sustaining effect created, refreshing positioned panel:', item.name);
        setTimeout(() => {
          positionedPanelIntegration.refreshPanel();
        }, 100);
      }
      
      // Also refresh dialog if it's open and this is the dialog actor
      if (currentSustainDialogActor && actor.id === currentSustainDialogActor.id) {
        console.log('[PF2e Spell Sustainer] Sustaining effect created, refreshing dialog:', item.name);
        setTimeout(() => {
          refreshSustainDialog();
        }, 100);
      }
    }
  }
});

Hooks.on('deleteItem', (item, options, userId) => {
  if (item.type === 'effect' && item.parent?.type === 'character') {
    const actor = item.parent;
    
    // Check if this was a sustaining effect
    const wasSustainingEffect = (item.slug && item.slug.startsWith('sustaining-')) || 
                               (item.name && item.name.startsWith('Sustaining: '));
    
    if (wasSustainingEffect) {
      // Refresh positioned panel if this is the current controlled actor
      const currentActor = canvas.tokens?.controlled?.[0]?.actor || game.user?.character;
      if (currentActor && actor.id === currentActor.id && positionedPanelIntegration?.enabled) {
        console.log('[PF2e Spell Sustainer] Sustaining effect deleted, refreshing positioned panel:', item.name);
        setTimeout(() => {
          positionedPanelIntegration.refreshPanel();
        }, 100);
      }
      
      // Also refresh dialog if it's open and this is the dialog actor
      if (currentSustainDialogActor && actor.id === currentSustainDialogActor.id) {
        console.log('[PF2e Spell Sustainer] Sustaining effect deleted, refreshing dialog:', item.name);
        setTimeout(() => {
          refreshSustainDialog();
        }, 100);
      }
    }
  }
});

Hooks.on('updateItem', (item, data, options, userId) => {
  if (item.type === 'effect' && item.parent?.type === 'character') {
    const actor = item.parent;
    
    // Check if this is a sustaining effect that was updated
    const isSustainingEffect = (item.slug && item.slug.startsWith('sustaining-')) || 
                              (item.name && item.name.startsWith('Sustaining: '));
    
    if (isSustainingEffect) {
      // Refresh positioned panel if this is the current controlled actor
      const currentActor = canvas.tokens?.controlled?.[0]?.actor || game.user?.character;
      if (currentActor && actor.id === currentActor.id && positionedPanelIntegration?.enabled) {
        console.log('[PF2e Spell Sustainer] Sustaining effect updated, refreshing positioned panel:', item.name);
        setTimeout(() => {
          positionedPanelIntegration.refreshPanel();
        }, 100);
      }
      
      // Also refresh dialog if it's open and this is the dialog actor
      if (currentSustainDialogActor && actor.id === currentSustainDialogActor.id) {
        console.log('[PF2e Spell Sustainer] Sustaining effect updated, refreshing dialog:', item.name);
        setTimeout(() => {
          refreshSustainDialog();
        }, 100);
      }
    }
  }
});

// Expose for debugging
window.PF2eWawfulsSpellSustainer = {
  showSustainDialog,
  expireUnsustainedEffects: () => {},
  hudIntegration: () => hudIntegration,
  positionedPanel: () => positionedPanelIntegration
};

// When a sustaining effect is deleted, remove all linked sustained effects from targets
if (!globalThis._sustainCleanupHook) {
  globalThis._sustainCleanupHook = Hooks.on('deleteItem', async (item) => {
    try {
      // Only let the GM handle cleanup to avoid permission issues
      if (!game.user.isGM) {
        console.log(`[PF2e Spell Sustainer] Non-GM user skipping cleanup to avoid permission issues`);
        return;
      }
      
      if (item.type !== 'effect' || !item.slug?.startsWith('sustaining-')) return;
      
      const effectUuid = item.uuid;
      const chatId = item.flags?.world?.sustainedSpell?.createdFromChat;
      
      // Clean up any save monitoring hooks for this spell cast
      if (chatId) {
        const hookId = `sustainSaveMonitor_${chatId}`;
        const cleanupFunctionName = `${hookId}_cleanup`;
        
        if (globalThis[cleanupFunctionName]) {
          console.log(`[PF2e Spell Sustainer] Cleaning up save monitoring for deleted sustaining effect`);
          globalThis[cleanupFunctionName]();
          delete globalThis[cleanupFunctionName];
        }
        
        // Also directly clean up any remaining hook
        if (globalThis[hookId]) {
          Hooks.off('createChatMessage', globalThis[hookId]);
          delete globalThis[hookId];
        }
      }
      
      // Collect all actors: world actors + all token actors on all scenes
      const actorSet = new Set();
      for (const a of (game.actors?.contents ?? [])) actorSet.add(a);
      for (const scn of (game.scenes?.contents ?? [])) {
        for (const tok of (scn.tokens?.contents ?? [])) {
          if (tok.actor) actorSet.add(tok.actor);
        }
      }
      // Remove children whose sustainedBy.effectUuid matches the deleted effect
      for (const actor of actorSet) {
        try {
          const effects = actor.itemTypes?.effect ?? [];
          const ids = effects
            .filter(e => e.flags?.world?.sustainedBy?.effectUuid === effectUuid)
            .map(e => e.id);
          if (ids.length) {
            await actor.deleteEmbeddedDocuments('Item', ids);
            ids.forEach(id => console.log(`[PF2e Spell Sustainer] Removed linked sustained effect from ${actor.name}`));
          }
        } catch (actorError) {
          console.warn(`[PF2e Spell Sustainer] Could not clean up effects on ${actor.name}:`, actorError);
          // Continue with other actors even if one fails
        }
      }
    } catch (err) {
      console.error('Sustain cleanup hook error:', err);
    }
  });
  console.log('Sustain cleanup hook registered:', globalThis._sustainCleanupHook);
}