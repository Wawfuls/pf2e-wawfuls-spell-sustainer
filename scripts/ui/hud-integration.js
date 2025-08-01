// PF2e HUD Integration for sustained spells

export class PF2eHUDSustainedSpellsIntegration {
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
    
    // Handle special sustain behaviors based on spell type - import dynamically
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