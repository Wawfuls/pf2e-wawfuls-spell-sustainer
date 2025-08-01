// Positioned Panel Integration (alternative to PF2e HUD) for sustained spells

export class PositionedPanelSustainedSpellsIntegration {
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

      // Format target/template information
      let targetInfo = '';
      const spellType = sustainedSpellData?.spellType;
      
      // Skip target info for aura spells (they show aura size below instead)
      if (spellType === 'bless' || spellType === 'self-aura') {
        targetInfo = '';
      }
      // Show template info for templated spells
      else if (sustainedSpellData?.templateConfig) {
        const template = sustainedSpellData.templateConfig;
        targetInfo = ` <span style='color: #666'>(${template.distance} ft ${template.type})</span>`;
      }
      // Show target info for other spells
      else if (sustainedSpellData?.targets && sustainedSpellData.targets.length > 0) {
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

    // Create a unique identifier for this effect's highlights
    const effectId = effect.id;
    
    // Find tokens for the targets
    const targetTokens = [];
    for (const target of sustainedSpellData.targets) {
      const token = canvas.tokens.placeables.find(t => t.actor?.uuid === target.uuid);
      if (token) {
        targetTokens.push(token);
      }
    }

    // Apply or remove highlight
    for (const token of targetTokens) {
      if (highlight) {
        // Get relationship for color coding - use UUID for unique identification
        const relationship = sustainedSpellData.targets.find(t => t.uuid === token.actor.uuid)?.relationship;
        let pingColor = 0xFFFFFF; // Default white
        if (relationship === 'ally') pingColor = 0x4CAF50; // Green
        else if (relationship === 'enemy') pingColor = 0xF44336; // Red
        else if (relationship === 'neutral') pingColor = 0x9E9E9E; // Gray
        
        // Use Foundry's built-in targeting system like legacy version
        token.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: true });
        
        // Simple ping
        try {
          canvas.ping(token.center, { color: pingColor });
        } catch (e) {
          console.log('Ping failed:', e);
        }
        
        // Add glow filter for enhanced visibility with unique identifier
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
          
          // Store with effect-specific identifier
          token._sustainGlowFilters = token._sustainGlowFilters || new Map();
          token._sustainGlowFilters.set(effectId, glowFilter);
        } catch (e) {
          console.log('Glow filter failed, using basic highlight');
        }
        
        // Mark as highlighted by this effect
        token._sustainHighlights = token._sustainHighlights || new Set();
        token._sustainHighlights.add(effectId);
      } else {
        // Remove this effect's highlight
        if (token._sustainHighlights && token._sustainHighlights.has(effectId)) {
          token._sustainHighlights.delete(effectId);
          
          // Remove this effect's glow filter
          if (token._sustainGlowFilters && token._sustainGlowFilters.has(effectId)) {
            const glowFilter = token._sustainGlowFilters.get(effectId);
            if (token.mesh.filters && glowFilter) {
              const filterIndex = token.mesh.filters.indexOf(glowFilter);
              if (filterIndex > -1) {
                token.mesh.filters.splice(filterIndex, 1);
              }
            }
            token._sustainGlowFilters.delete(effectId);
          }
          
          // Clean up if no more highlights
          if (token._sustainHighlights.size === 0) {
            token.setTarget(false, { user: game.user, releaseOthers: false });
            delete token._sustainHighlights;
            delete token._sustainGlowFilters;
          }
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
    
    // Handle sustain behaviors using generic dispatcher
    const { dispatchSustainBehavior } = await import('../sustain/sustain-dispatcher.js');
    await dispatchSustainBehavior(spellType, effect, actor);
    
    // Output a chat card - use the same function as HUD integration
    await this.createSustainChatMessage(actor, effect);

    // Refresh the panel to show updated state
    this.refreshPanel();
  }

  async createSustainChatMessage(actor, effect) {
    const speaker = ChatMessage.getSpeaker({ actor });
    const spellName = effect.flags?.world?.sustainedSpell?.spellName || 
                     effect.name.replace(/^Sustaining: /, '').replace(/ \(\d+ targets?\)$/, '');
    const img = effect.img || 'icons/svg/mystery-man.svg';
    
    // Get spell description - try the sustained spell data first, then effect description
    const sustainedSpellData = effect.flags?.world?.sustainedSpell;
    let desc = sustainedSpellData?.description || effect.system?.description?.value || '';
    
    // If no description found, try to get from original spell
    if (!desc && sustainedSpellData?.spellUuid) {
      try {
        const originalSpell = await fromUuid(sustainedSpellData.spellUuid);
        if (originalSpell) {
          desc = originalSpell.system?.description?.value || '';
        }
      } catch (e) {
        console.log('Could not fetch original spell description:', e);
      }
    }
    
    const actionGlyph = `<span class='action-glyph'>1</span>`;
    
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

  disable() {
    if (this.currentPanel) {
      this.currentPanel.remove();
      this.currentPanel = null;
    }
    this.enabled = false;
  }
}