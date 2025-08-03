// Generic effect creation for sustained spells

import { extractCastLevel } from '../core/utils.js';

// Create generic sustained effects for spells without specific configurations
export async function createSustainedEffects(spell, caster, validTargets, msg, ctx) {
  const castLevel = extractCastLevel(msg, ctx, spell);
  
  console.log(`[PF2e Spell Sustainer] Creating generic sustained effects for ${spell.name} at level ${castLevel}`);
  
  // Create effects on all targets
  const effectsToCreate = [];
  const targetData = { allies: [], enemies: [], neutral: [], targets: [] };
  
  for (const target of validTargets) {
    const targetActor = target.actor;
    const relationship = getActorRelationship(targetActor, caster);
    
    // Create effect on target
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
  
  console.log(`[PF2e Spell Sustainer] Applied generic sustained effects for ${spell.name} to ${validTargets.length} targets`);
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