// Generic spell handler system using JSON configuration

import { extractCastLevel } from '../core/utils.js';

// Import the convention-based config loader
import { getSpellConfig } from './configs/index.js';

// Re-export for external use
export { getSpellConfig };

// Main spell dispatcher - replaces the hardcoded handlers
export async function dispatchSpell(spell, caster, targets, msg, ctx) {
  const spellName = spell.name.toLowerCase();
  console.log(`[PF2e Spell Sustainer] Dispatching spell: "${spellName}"`);
  
  const config = await getSpellConfig(spellName);
  if (!config) {
    console.log(`[PF2e Spell Sustainer] No configuration found for "${spellName}", ignoring spell (only configured spells get sustaining effects)`);
    return; // Exit early - only handle explicitly configured spells
  }
  
  console.log(`[PF2e Spell Sustainer] Found configuration for "${spellName}":`, config);
  
  // Validate targets based on configuration
  const validTargets = validateTargets(config.targetRequirement, targets, caster);
  if (!validTargets.success) {
    ui.notifications.warn(validTargets.error);
    return;
  }
  
  // Handle different spell types
  switch (config.spellType) {
    case 'save-dependent':
      await handleSaveDependentSpell(spell, caster, validTargets.targets, msg, ctx, config);
      break;
      
    case 'immediate-effects':
      await handleImmediateEffectsSpell(spell, caster, validTargets.targets, msg, ctx, config);
      break;
      
    case 'self-aura':
      await handleSelfAuraSpell(spell, caster, msg, ctx, config);
      break;
      
    case 'measured-template':
      await handleMeasuredTemplateSpell(spell, caster, msg, ctx, config);
      break;
      
    default:
      console.warn(`[PF2e Spell Sustainer] Unknown spell type: ${config.spellType} for ${spell.name}`);
      ui.notifications.warn(`Unknown spell type "${config.spellType}" for ${spell.name}. Please check spell configuration.`);
      return;
  }
}

// Validate targets against configuration requirements
function validateTargets(requirement, targets, caster) {
  const validTargets = targets.filter(tok => tok.actor);
  
  if (requirement.type === 'self-only') {
    return { success: true, targets: [{ actor: caster }] };
  }
  
  if (requirement.type === 'none') {
    return { success: true, targets: [] };
  }
  
  if (requirement.type === 'exact') {
    if (validTargets.length !== requirement.count) {
      return {
        success: false,
        error: `${requirement.name || 'This spell'} requires exactly ${requirement.count} target${requirement.count > 1 ? 's' : ''}. Found ${validTargets.length} targets.`
      };
    }
    
    // Check category requirements if specified
    if (requirement.categories) {
      const categorizedTargets = categorizeTargets(validTargets, caster);
      
      for (const category of requirement.categories) {
        const found = categorizedTargets[category.type]?.length || 0;
        if (found !== category.count) {
          return {
            success: false,
            error: `This spell requires ${category.count} ${category.type} target${category.count > 1 ? 's' : ''}. Found ${found}.`
          };
        }
      }
      
      return { success: true, targets: categorizedTargets };
    }
  }
  
  return { success: true, targets: validTargets };
}

// Categorize targets by disposition
function categorizeTargets(targets, caster) {
  const result = { ally: [], enemy: [], neutral: [], all: targets };
  
  for (const target of targets) {
    if (target.document?.disposition === 1 || target.actor.id === caster.id) {
      result.ally.push(target);
    } else if (target.document?.disposition === -1) {
      result.enemy.push(target);
    } else {
      result.neutral.push(target);
    }
  }
  
  return result;
}

// Handle save-dependent spells
async function handleSaveDependentSpell(spell, caster, targets, msg, ctx, config) {
  console.log(`[PF2e Spell Sustainer] Handling save-dependent spell with config`);
  
  // Import the save handler
  const { handleSaveDependentSpell: handleSaves } = await import('../core/message-handler.js');
  await handleSaves(spell, caster, targets, msg, ctx);
}

// Handle spells with immediate effects
async function handleImmediateEffectsSpell(spell, caster, categorizedTargets, msg, ctx, config) {
  console.log(`[PF2e Spell Sustainer] Handling immediate effects spell with config`);
  
  const castLevel = extractCastLevel(msg, ctx, spell);
  
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

  // Create sustaining effect first if configured
  let sustainingEffect = null;
  if (config.sustainingEffect) {
    // Collect target data
    const targetData = { allies: [], enemies: [], neutral: [], targets: [] };
    
    for (const effectConfig of config.effects) {
      const targetGroup = categorizedTargets[effectConfig.target];
      if (!targetGroup || targetGroup.length === 0) continue;
      
      for (const target of targetGroup) {
        // Store target information
        targetData.targets.push({
          id: target.actor.id,
          name: target.actor.name,
          uuid: target.actor.uuid,
          relationship: effectConfig.target
        });
        
        if (effectConfig.target === 'ally') targetData.allies.push(target.actor.name);
        else if (effectConfig.target === 'enemy') targetData.enemies.push(target.actor.name);
        else targetData.neutral.push(target.actor.name);
      }
    }
    
    const sustainingData = await createSustainingEffectFromConfig(
      config.sustainingEffect, 
      spell, 
      caster, 
      castLevel, 
      msg, 
      targetData,
      categorizedTargets
    );
    
    // Create the sustaining effect first
    const createdEffects = await caster.createEmbeddedDocuments('Item', [sustainingData]);
    sustainingEffect = createdEffects[0];
    console.log(`[PF2e Spell Sustainer] Created sustaining effect: ${sustainingEffect.name}`);
  }
  
  // Now create child effects with proper sustainedBy links
  const childEffectsToCreate = [];
  
  for (const effectConfig of config.effects) {
    const targetGroup = categorizedTargets[effectConfig.target];
    if (!targetGroup || targetGroup.length === 0) continue;
    
    for (const target of targetGroup) {
      const effectData = await createEffectFromConfig(effectConfig, spell, target.actor, caster, castLevel, msg, sustainingEffect);
      childEffectsToCreate.push({ actor: target.actor, effect: effectData });
    }
  }
  
  // Apply child effects
  for (const { actor, effect } of childEffectsToCreate) {
    await actor.createEmbeddedDocuments('Item', [effect]);
  }
  
  console.log(`[PF2e Spell Sustainer] Applied ${config.name} effects to targets`);
}

// Handle self-aura spells (like Bless)
async function handleSelfAuraSpell(spell, caster, msg, ctx, config) {
  console.log(`[PF2e Spell Sustainer] Handling self-aura spell with config`);
  
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
  
  const castLevel = extractCastLevel(msg, ctx, spell);
  
  const sustainingData = await createSustainingEffectFromConfig(
    config.sustainingEffect,
    spell,
    caster,
    castLevel,
    msg,
    {
      targets: [{ id: caster.id, name: caster.name, uuid: caster.uuid, relationship: 'ally' }],
      allies: [caster.name],
      enemies: [],
      neutral: []
    },
    { ally: [{ actor: caster }] }
  );
  
  await caster.createEmbeddedDocuments('Item', [sustainingData]);
  console.log(`[PF2e Spell Sustainer] Applied ${config.name} effect to ${caster.name}`);
}

// Create effect data from configuration
async function createEffectFromConfig(effectConfig, spell, targetActor, caster, castLevel, msg, sustainingEffect = null) {
  return {
    type: 'effect',
    name: effectConfig.name,
    slug: effectConfig.slug,
    img: spell.img,
    system: {
      slug: effectConfig.slug,
      description: { value: effectConfig.description },
      duration: effectConfig.duration,
      start: { value: game.combat ? game.combat.round : 0, initiative: null },
      level: { value: castLevel },
      rules: effectConfig.rules || []
    },
    flags: {
      world: {
        sustainedBy: { effectUuid: sustainingEffect?.uuid || null },
        sustainedSpell: {
          spellUuid: spell.uuid,
          spellName: spell.name,
          casterUuid: caster.uuid,
          createdFromChat: msg.id,
          spellType: effectConfig.slug
        }
      }
    }
  };
}

// Create sustaining effect data from configuration
async function createSustainingEffectFromConfig(sustainingConfig, spell, caster, castLevel, msg, targetData, categorizedTargets) {
  return {
    type: 'effect',
    name: sustainingConfig.name,
    slug: sustainingConfig.slug,
    img: spell.img,
    system: {
      slug: sustainingConfig.slug,
      description: { value: (spell.system?.description?.value || '') + (sustainingConfig.description || '') },
      duration: sustainingConfig.duration,
      start: { value: game.combat ? game.combat.round : 0, initiative: null },
      level: { value: castLevel },
      unidentified: true,
      rules: sustainingConfig.rules || []
    },
    flags: {
      world: {
        sustainedSpell: {
          spellUuid: spell.uuid,
          spellName: spell.name,
          description: spell.system?.description?.value || '',
          createdFromChat: msg.id,
          maxSustainRounds: sustainingConfig.maxSustainRounds,
          spellType: sustainingConfig.spellType,
          auraCounter: sustainingConfig.auraCounter || undefined,
          ...targetData,
          // Store target IDs for cleanup (only for spells with targets)
          allyTargetId: categorizedTargets?.ally?.[0]?.actor?.id,
          enemyTargetId: categorizedTargets?.enemy?.[0]?.actor?.id
        }
      }
    }
  };
}

// Handle measured template spells
async function handleMeasuredTemplateSpell(spell, caster, msg, ctx, config) {
  console.log(`[PF2e Spell Sustainer] Handling measured template spell with config`);
  
  const castLevel = extractCastLevel(msg, ctx, spell);
  
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
    console.log(`[PF2e Spell Sustainer] Effect already exists for this chat message, skipping duplicate creation`);
    return;
  }

  // Create the sustaining effect
  const sustainingEffectData = await createSustainingEffectFromConfig(
    config.sustainingEffect, 
    spell, 
    caster, 
    castLevel, 
    msg, 
    {}, // empty target data for template spells
    {} // empty categorized targets for template spells
  );
  
  // Store template configuration in the sustaining effect
  sustainingEffectData.flags.world.sustainedSpell.templateConfig = config.template;
  sustainingEffectData.flags.world.sustainedSpell.templateId = null; // Will be set when template is placed
  
  const createdEffects = await caster.createEmbeddedDocuments('Item', [sustainingEffectData]);
  const sustainingEffect = createdEffects[0];
  
  console.log(`[PF2e Spell Sustainer] Created sustaining effect for ${spell.name}, template config ready`);
  
      // Immediately start template placement for initial cast (no duration increment)
    const { handleInitialTemplatePlace } = await import('../sustain/sustain-templated.js');
    await handleInitialTemplatePlace(caster, sustainingEffect, config);
}

// Note: No generic fallback - only explicitly configured spells get sustaining effects