// PF2e Wawful's Spell Sustainer

Hooks.once('init', () => {
  console.log('PF2e Wawful\'s Spell Sustainer | Initializing module');
});

Hooks.once('ready', () => {
  console.log('PF2e Wawful\'s Spell Sustainer | Module ready');
});

// Detect sustained spell casts and auto-generate effects for caster and target
Hooks.on('createChatMessage', async (msg, options, userId) => {
  // Only proceed if this is a spell cast message
  const ctx = msg.flags?.pf2e?.context;
  const origin = msg.flags?.pf2e?.origin;
  const isSpell = ctx?.type === 'spell' || ctx?.type === 'spell-cast' || origin?.type === 'spell' || msg.flags?.pf2e?.casting;
  if (!isSpell) return;

  // Try to get the spell item UUID from the message
  const spellUuid = ctx?.item?.uuid || origin?.uuid;
  if (!spellUuid) return;
  const spell = await fromUuid(spellUuid);
  if (!spell || spell.type !== 'spell') return;

  // Check for the 'sustain' trait
  if (!spell.system?.duration?.sustained) return;

  // Get the caster
  const casterId = msg.speaker?.actor;
  const caster = game.actors.get(casterId);
  if (!caster) return;

  // Slugify helper
  const slugify = str => str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Get targets
  let targets = [];
  const casterUser = game.users.find(u => u.character?.id === caster.id) || game.users.find(u => u.name === msg.speaker?.alias);
  if (casterUser) {
    targets = Array.from(casterUser.targets);
  }
  if (!targets.length) {
    targets = Array.from(game.user.targets);
  }
  if (!targets.length) {
    // If no targets, treat the caster as the target (for self-buffs)
    targets = [{ actor: caster }];
  }

  // Track which sustaining slugs are being created in this batch
  const createdSlugs = new Set();

  for (const tok of targets) {
    const targetActor = tok.actor;
    if (!targetActor) continue;
    // Unique slug and name per target
    const targetId = targetActor.id;
    const uniqueSlug = `sustaining-${slugify(spell.name)}-target-${targetId}`;
    const uniqueName = `Sustaining: ${spell.name} (Target: ${targetActor.name})`;
    // Check if effect already exists for this target or is being created in this batch
    let existing = caster.itemTypes.effect.find(e => e.slug === uniqueSlug || e.name === uniqueName);
    if (existing || createdSlugs.has(uniqueSlug)) {
      console.log(`[PF2e Spell Sustainer] Caster already has sustaining effect for ${spell.name} on ${targetActor.name}`);
      continue;
    }
    createdSlugs.add(uniqueSlug);
    // Get spell level
    let castLevel = ctx?.item?.level || (ctx?.item?.rank !== undefined ? ctx.item.rank + 1 : undefined) || ctx?.spellLevel || ctx?.castLevel || (ctx?.spell?.rank !== undefined ? ctx.spell.rank + 1 : undefined);
    if (!castLevel && spell.system?.level?.value) castLevel = spell.system.level.value;
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
    // Prepare effect data for caster
    let effectData = {
      type: 'effect',
      name: uniqueName,
      slug: uniqueSlug,
      img: spell.img,
      system: {
        slug: uniqueSlug,
        description: { value: spell.system?.description?.value || '' },
        duration: { value: 1, unit: 'rounds', sustained: true, expiry: 'turn-end' },
        start: { value: game.combat ? game.combat.round : 0, initiative: null },
        level: { value: castLevel || 1 }
      },
      flags: {
        world: {
          sustainedSpell: {
            spellUuid,
            spellName: spell.name,
            createdFromChat: msg.id,
            targetId: targetId,
            targetName: targetActor.name,
            maxSustainRounds: maxRounds
          }
        }
      }
    };
    // Create the effect on the caster
    const created = await caster.createEmbeddedDocuments('Item', [effectData]);
    const sustainEffect = created?.[0] || caster.itemTypes.effect.find(e => e.slug === uniqueSlug || e.name === uniqueName);
    console.log(`[PF2e Spell Sustainer] Applied sustaining effect to ${caster.name} for spell ${spell.name} on ${targetActor.name}`);

    // --- Apply linked effect to this target ---
    const childSlug = `sustained-by-${slugify(spell.name)}-from-${caster.id}-to-${targetId}`;
    const childName = `Sustained by: ${caster.name} (${spell.name} on ${targetActor.name})`;
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
        description: { value: `This creature is affected by a spell sustained by ${caster.name}.` },
        duration: { value: maxRounds, unit: 'rounds', sustained: true, expiry: 'turn-end' },
        start: { value: game.combat ? game.combat.round : 0, initiative: null },
        level: { value: castLevel || 1 }
      },
      flags: {
        world: {
          sustainedBy: { effectUuid: sustainEffect?.uuid },
          sustainedSpell: {
            spellUuid,
            spellName: spell.name,
            casterUuid: caster.uuid,
            createdFromChat: msg.id,
            casterEffectId: sustainEffect?.id,
            targetName: targetActor.name,
            maxSustainRounds: maxRounds
          }
        }
      }
    };
    await targetActor.createEmbeddedDocuments('Item', [childEffectData]);
    console.log(`[PF2e Spell Sustainer] Applied linked effect to target ${targetActor.name}`);
  }
});

// Sustain dialog with chat card output
function showSustainDialog(actor) {
  // Find sustaining effects
  const sustainingEffects = actor.itemTypes.effect.filter(e =>
    (e.slug && e.slug.startsWith('sustaining-')) ||
    (e.name && e.name.startsWith('Sustaining: '))
  );
  if (!sustainingEffects.length) {
    ui.notifications.info('No sustained spells to sustain.');
    return;
  }
  // Build clickable list
  const options = sustainingEffects.map(e => {
    const spellName = e.flags?.world?.sustainedSpell?.spellName || e.name.replace(/^Sustaining: /, '');
    const targetName = e.flags?.world?.sustainedSpell?.targetName || '';
    const maxRounds = e.flags?.world?.sustainedSpell?.maxSustainRounds || 10;
    const curRounds = e.system?.duration?.value || 0;
    const img = e.img || 'icons/svg/mystery-man.svg';
    const disabled = curRounds >= maxRounds ? 'disabled' : '';
    return `<li class='sustain-spell-row' data-effect-id='${e.id}' ${disabled} style='cursor:pointer;display:flex;align-items:center;gap:0.5em;opacity:${disabled ? 0.5 : 1}'>
      <img src='${img}' width='32' height='32'>
      <span>${spellName}${targetName ? ` <span style='color: #888'>(Target: ${targetName})</span>` : ''}</span>
      <span style='color:#888'>(Rounds: ${curRounds}/${maxRounds})</span>
    </li>`;
  }).join('');
  const content = `
    <div>
      <div style='margin-bottom:0.5em;'>Select a spell to sustain:</div>
      <ul style='list-style:none;padding:0;margin:0;'>
        ${options}
      </ul>
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
        $row.on('click', async function() {
          const effectId = $row.data('effect-id');
          const effect = actor.items.get(effectId);
          if (!effect) return;
          const maxRounds = effect.flags?.world?.sustainedSpell?.maxSustainRounds || 10;
          const curRounds = effect.system?.duration?.value || 0;
          if (curRounds >= maxRounds) {
            ui.notifications.warn('This effect is already at its maximum duration.');
            return;
          }
          await effect.update({
            'system.duration.value': Math.min(curRounds + 1, maxRounds),
            'flags.world.sustainedThisTurn': true
          });
          // Output a chat card styled like PF2e item cards
          const speaker = ChatMessage.getSpeaker({ actor });
          const spellName = effect.flags?.world?.sustainedSpell?.spellName || effect.name.replace(/^Sustaining: /, '');
          const targetName = effect.flags?.world?.sustainedSpell?.targetName || '';
          const img = effect.img || 'icons/svg/mystery-man.svg';
          const desc = effect.system?.description?.value || '';
          const actionGlyph = `<span class='action-glyph'>1</span>`;
          ChatMessage.create({
            user: game.user.id,
            speaker,
            content: `
              <div class='pf2e chat-card item-card' data-actor-id='${actor.id}' data-item-id='${effect.id}'>
                <header class='card-header flexrow'>
                  <img src='${img}' alt='${spellName}' />
                  <h3>${spellName}${targetName ? ` <span style='color: #888'>(Target: ${targetName})</span>` : ''} ${actionGlyph}</h3>
                </header>
                <div class='card-content'>
                  <p><strong>${actor.name} sustained this spell.</strong></p>
                  <hr />
                  ${desc}
                </div>
              </div>
            `
          });
          dialog.close();
        });
      });
    }
  });
  dialog.render(true);
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
  // Build list of sustained spells with icon, name, and target
  const effectList = sustainingEffects.map(e => {
    const spellName = e.flags?.world?.sustainedSpell?.spellName || e.name.replace(/^Sustaining: /, '');
    const targetName = e.flags?.world?.sustainedSpell?.targetName || '';
    const img = e.img || 'icons/svg/mystery-man.svg';
    return `<li><img src="${img}" width="32" height="32"> ${spellName}${targetName ? ` <span style='color: #888'>(Target: ${targetName})</span>` : ''}</li>`;
  }).join('');
  const body = `
    <div class="participant-conditions">
      <h4>${actor.name} is sustaining:</h4>
      <ul>
        ${effectList}
      </ul>
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

// Expose for debugging
window.PF2eWawfulsSpellSustainer = {
  showSustainDialog,
  expireUnsustainedEffects: () => {}
};

// When a sustaining effect is deleted, remove all linked sustained effects from targets
if (!globalThis._sustainCleanupHook) {
  globalThis._sustainCleanupHook = Hooks.on('deleteItem', async (item) => {
    try {
      if (item.type !== 'effect' || !item.slug?.startsWith('sustaining-')) return;
      const effectUuid = item.uuid;
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
        const effects = actor.itemTypes?.effect ?? [];
        const ids = effects
          .filter(e => e.flags?.world?.sustainedBy?.effectUuid === effectUuid)
          .map(e => e.id);
        if (ids.length) {
          await actor.deleteEmbeddedDocuments('Item', ids);
          ids.forEach(id => console.log(`[PF2e Spell Sustainer] Removed linked sustained effect from ${actor.name}`));
        }
      }
    } catch (err) {
      console.error('Sustain cleanup hook error:', err);
    }
  });
  console.log('Sustain cleanup hook registered:', globalThis._sustainCleanupHook);
} 