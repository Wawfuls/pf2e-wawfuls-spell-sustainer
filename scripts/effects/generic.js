// Generic effect creation for sustained spells

import { extractCastLevel } from '../core/utils.js';

// Create sustained effects for spells, using config when available
export async function createSustainedEffects(spell, caster, validTargets, msg, ctx, config = null) {
  const castLevel = extractCastLevel(msg, ctx, spell);
  
  const effectType = config ? 'configured' : 'generic';
  // Creating sustained effects
  
  // Create effects on all targets
  const effectsToCreate = [];
  const targetData = { allies: [], enemies: [], neutral: [], targets: [] };
  
  for (const target of validTargets) {
    const targetActor = target.actor;
    const relationship = getActorRelationship(targetActor, caster);
    
    // Check if we have config-defined effects
    if (config?.effects && config.effects.length > 0) {
      // Create config-defined effects
      for (const effectConfig of config.effects) {
        // Check if this effect applies to this target type
        if (!effectAppliesToTarget(effectConfig, target, caster)) {
          // Effect doesn't apply to this target
          continue;
        }
        
        // Creating effect for target
        
        // Create the effect data from config
        const targetEffectData = createEffectFromConfig(effectConfig, spell, caster, target, castLevel, msg);
        effectsToCreate.push({ actor: targetActor, effect: targetEffectData });
      }
    } else {
      // Create generic effect
      const targetEffectData = {
        type: 'effect',
        name: `${spell.name}`,
        img: spell.img,
        system: {
          description: { value: spell.system?.description?.value || '' },
          duration: { value: 10, unit: 'rounds', sustained: false, expiry: 'turn-end' },
          start: { value: game.combat ? game.combat.round : 0, initiative: null },
          level: { value: castLevel }
        },
        flags: {
          world: {
            sustainedBy: { effectUuid: null }, // Will be updated after sustaining effect is created
            sustainedSpell: {
              spellUuid: spell.uuid,
              spellName: spell.name,
              casterUuid: caster.uuid,
              createdFromChat: msg.id,
              spellType: 'generic'
            }
          }
        }
      };
      
      effectsToCreate.push({ actor: targetActor, effect: targetEffectData });
    }
    
    // Store target data
    targetData.targets.push({
      id: targetActor.id,
      name: targetActor.name,
      uuid: targetActor.uuid,
      relationship: relationship
    });
    
    if (relationship === 'ally') targetData.allies.push(targetActor.name);
    else if (relationship === 'enemy') targetData.enemies.push(targetActor.name);
    else targetData.neutral.push(targetActor.name);
  }
  
  // Create sustaining effect on caster
  const sustainingEffectData = {
    type: 'effect',
    name: `Sustaining: ${spell.name}`,
    img: spell.img,
    system: {
      description: { value: `You are sustaining ${spell.name}.` },
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
          spellType: 'generic',
          ...targetData
        }
      }
    }
  };
  
  effectsToCreate.push({ actor: caster, effect: sustainingEffectData });
  
  // Create sustaining effect first
  const sustainingIndex = effectsToCreate.findIndex(({ actor }) => actor.id === caster.id);
  const sustainingData = effectsToCreate[sustainingIndex];
  const createdSustainingEffect = await caster.createEmbeddedDocuments('Item', [sustainingData.effect]);
  const sustainingEffect = createdSustainingEffect[0];
  
  // Update child effects to link to the sustaining effect
  const childEffects = effectsToCreate.filter(({ actor }) => actor.id !== caster.id);
  for (const { actor, effect } of childEffects) {
    effect.flags.world.sustainedBy.effectUuid = sustainingEffect.uuid;
    await actor.createEmbeddedDocuments('Item', [effect]);
  }
  
  // Applied sustained effects to targets
}

// Determine relationship between actor and caster
function getActorRelationship(actor, caster) {
  if (actor.id === caster.id) return 'ally';
  
  // Try to find the token for disposition info
  const token = canvas.tokens?.placeables.find(t => t.actor?.id === actor.id);
  if (token) {
    if (token.document?.disposition === 1) return 'ally';
    if (token.document?.disposition === -1) return 'enemy';
  }
  
  return 'neutral';
}

/**
 * Check if an effect should apply to a specific target
 */
function effectAppliesToTarget(effectConfig, target, caster) {
  if (!effectConfig.target) return true; // No restriction
  
  switch (effectConfig.target) {
    case 'self':
      return target.actor.id === caster.id;
    case 'ally':
      return target.document?.disposition === 1 || target.actor.id === caster.id;
    case 'enemy':
      return target.document?.disposition === -1;
    case 'neutral':
      return target.document?.disposition === 0;
    case 'all':
    default:
      return true;
  }
}

/**
 * Create effect data from configuration
 */
function createEffectFromConfig(effectConfig, spell, caster, target, castLevel, originalMsg) {
  // Process template variables in description
  let description = effectConfig.description || '';
  description = description.replace(/\{\{casterName\}\}/g, caster.name);
  description = description.replace(/\{\{targetName\}\}/g, target.name || target.actor?.name);
  description = description.replace(/\{\{spellName\}\}/g, spell.name);
  
  // Determine effect level
  let effectLevel = 1;
  if (effectConfig.level === 'castLevel') {
    effectLevel = castLevel;
  } else if (typeof effectConfig.level === 'number') {
    effectLevel = effectConfig.level;
  }
  
  // Create basic effect data
  const effectData = {
    name: effectConfig.name,
    type: 'effect',
    img: spell.img,
    system: {
      description: {
        value: description
      },
      level: {
        value: effectLevel
      },
      duration: effectConfig.duration || { value: 10, unit: 'rounds', sustained: false },
      start: { value: game.combat ? game.combat.round : 0, initiative: null },
      traits: {
        value: ['magical']
      }
    },
    flags: {
      world: {
        sustainedBy: { effectUuid: null }, // Will be updated after sustaining effect is created
        sustainedSpell: {
          spellUuid: spell.uuid,
          spellName: spell.name,
          casterUuid: caster.uuid,
          createdFromChat: originalMsg.id,
          fromConfig: true
        }
      }
    }
  };
  
  // Add slug if provided
  if (effectConfig.slug) {
    effectData.system.slug = effectConfig.slug;
  }
  
  return effectData;
}