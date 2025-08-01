// Traditional sustain dialog (legacy macro functionality)

// Global state for dialog management
export let currentSustainDialog = null;
export let currentSustainDialogActor = null;
export let currentlyHighlighted = null;

// Function to show the sustain dialog (legacy macro functionality)
export function showSustainDialog(actor) {
  console.log(`[PF2e Spell Sustainer] Opening sustain dialog for ${actor.name}`);
  
  // Close existing dialog first
  if (currentSustainDialog) {
    currentSustainDialog.close();
    currentSustainDialog = null;
    currentSustainDialogActor = null;
    console.log(`[PF2e Spell Sustainer] Closed existing dialog`);
  }
  
  // Set current dialog actor
  currentSustainDialogActor = actor;
  console.log(`[PF2e Spell Sustainer] Set dialog actor to:`, currentSustainDialogActor.name);
  
  // Find sustained spells
  const sustainingEffects = actor.itemTypes.effect.filter(e =>
    (e.slug && e.slug.startsWith('sustaining-')) ||
    (e.name && e.name.startsWith('Sustaining: '))
  );

  if (sustainingEffects.length === 0) {
    ui.notifications.info(`${actor.name} has no sustained spells.`);
    currentSustainDialogActor = null;
    return;
  }

  // Create dialog content
  let content = `
    <div style="font-family: 'Signika', sans-serif;">
      <p><strong>${actor.name}</strong> is sustaining the following spells:</p>
      <div style="display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto;">
  `;

  sustainingEffects.forEach((effect, index) => {
    const spellName = effect.flags?.world?.sustainedSpell?.spellName || 
                     effect.name.replace(/^Sustaining: /, '').replace(/ \(\d+ targets?\)$/, '');
    const sustainedSpellData = effect.flags?.world?.sustainedSpell;
    const maxRounds = sustainedSpellData?.maxSustainRounds || 10;
    const curRounds = effect.system?.duration?.value || 0;
    const img = effect.img || 'icons/svg/mystery-man.svg';
    
    // Determine if at max duration
    const spellType = sustainedSpellData?.spellType;
    const atMax = spellType !== 'bless' && curRounds >= maxRounds;
    
    // Status display
    let statusDisplay = '';
    if (spellType === 'bless') {
      const auraCounter = sustainedSpellData?.auraCounter || 1;
      const auraSize = 5 + (auraCounter * 10);
              statusDisplay = `${auraSize} ft aura (Round ${curRounds})`;
    } else if (sustainedSpellData?.templateConfig) {
      const template = sustainedSpellData.templateConfig;
      const displayType = template.displayType || template.type;
      statusDisplay = `${template.distance} ft ${displayType} (Round ${curRounds}/${maxRounds})`;
    } else {
      statusDisplay = `Round ${curRounds}/${maxRounds}`;
    }
    
    // Disable styling for maxed effects
    const disabledStyle = atMax ? 'opacity: 0.5; pointer-events: none;' : '';
    const cursorStyle = atMax ? 'default' : 'pointer';
    
    content += `
      <div class="sustained-spell-row" style="
        display: flex; 
        align-items: center; 
        padding: 8px; 
        border: 1px solid #ccc; 
        border-radius: 4px; 
        background: linear-gradient(to right, #f8f8f8, #e8e8e8);
        cursor: ${cursorStyle};
        ${disabledStyle}
      " data-effect-id="${effect.id}">
        <img src="${img}" style="width: 32px; height: 32px; margin-right: 8px; border-radius: 4px;" alt="${spellName}">
        <div style="flex: 1;">
          <div style="font-weight: bold; font-size: 14px;">${spellName}</div>
          <div style="font-size: 12px; color: #666;">
            ${statusDisplay}
            ${atMax ? ' (MAX)' : ''}
          </div>
        </div>
        <div style="font-size: 11px; color: #888; margin-left: 8px;">Click to Sustain</div>
      </div>
    `;
  });

  content += `
      </div>
      <hr style="margin: 12px 0;">
      <p style="font-size: 11px; color: #666; margin: 0;">
        <em>Hover over spells to highlight their targets. Click to sustain a spell (costs 1 action).</em>
      </p>
    </div>
  `;

  // Create the dialog
  currentSustainDialog = new Dialog({
    title: `Sustained Spells - ${actor.name}`,
    content: content,
    buttons: {
      close: {
        label: "Close",
        callback: () => {
          // Clean up any highlighting when dialog is closed
          if (currentlyHighlighted) {
            highlightTargets(currentlyHighlighted, false);
            currentlyHighlighted = null;
          }
          currentSustainDialog = null;
          currentSustainDialogActor = null;
        }
      }
    },
    default: "close",
    render: html => {
      // Set up event handlers for each spell row
      html.find('.sustained-spell-row').each(function() {
        const $row = $(this);
        const effectId = $row.data('effect-id');
        const effect = sustainingEffects.find(e => e.id === effectId);
        
        if (!effect) return;
        
        // Hover effects for target highlighting
        $row.on('mouseenter', function() {
          if (currentlyHighlighted && currentlyHighlighted !== effect) {
            highlightTargets(currentlyHighlighted, false);
          }
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
            const { handleForbiddingWardSustain } = await import('../sustain/forbidding-ward.js');
            await handleForbiddingWardSustain(effect, actor);
          } else if (spellType === 'bless') {
            const { handleBlessSustain } = await import('../sustain/bless.js');
            await handleBlessSustain(effect, actor);
          } else {
            // Standard sustain behavior
            await effect.update({
              'system.duration.value': Math.min(curRounds + 1, maxRounds),
              'flags.world.sustainedThisTurn': true
            });
          }
          
          // Create chat message
          await createSustainChatMessage(actor, effect);
          
          // Refresh the dialog content to show updated information
          setTimeout(() => {
            refreshSustainDialog();
          }, 100);
        });
      });
    },
    close: () => {
      // Clean up highlighting when dialog is closed
      if (currentlyHighlighted) {
        highlightTargets(currentlyHighlighted, false);
        currentlyHighlighted = null;
      }
      currentSustainDialog = null;
      currentSustainDialogActor = null;
      console.log(`[PF2e Spell Sustainer] Dialog closed and cleaned up`);
    }
  });

  currentSustainDialog.render(true);
}

// Function to refresh the sustain dialog if it's open
export function refreshSustainDialog() {
  console.log(`[PF2e Spell Sustainer] refreshSustainDialog called`);
  console.log(`[PF2e Spell Sustainer] currentSustainDialog:`, !!currentSustainDialog);
  console.log(`[PF2e Spell Sustainer] currentSustainDialogActor:`, currentSustainDialogActor?.name);
  
  if (!currentSustainDialog || !currentSustainDialogActor) {
    console.log(`[PF2e Spell Sustainer] No dialog to refresh`);
    return;
  }

  const actor = currentSustainDialogActor;
  
  // Check if the actor still has sustained spells
  const sustainingEffects = actor.itemTypes.effect.filter(e =>
    (e.slug && e.slug.startsWith('sustaining-')) ||
    (e.name && e.name.startsWith('Sustaining: '))
  );

  console.log(`[PF2e Spell Sustainer] Found ${sustainingEffects.length} sustaining effects for refresh`);

  if (sustainingEffects.length === 0) {
    // No more sustained spells, close the dialog
    console.log(`[PF2e Spell Sustainer] No more sustained spells, closing dialog`);
    currentSustainDialog.close();
    return;
  }

  // Re-open the dialog with updated data
  console.log(`[PF2e Spell Sustainer] Refreshing dialog with updated data`);
  const position = currentSustainDialog.position;
  currentSustainDialog.close();
  
  // Small delay to ensure the dialog is properly closed before reopening
  setTimeout(() => {
    showSustainDialog(actor);
    if (currentSustainDialog && position) {
      currentSustainDialog.setPosition(position);
    }
  }, 50);
}

// Helper function to highlight targets (shared with UI integrations)
function highlightTargets(effect, highlight = true) {
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

// Helper function to create chat message for sustain action
async function createSustainChatMessage(actor, effect) {
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