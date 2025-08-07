// PF2e Wawful's Spell Sustainer - Main Entry Point (Refactored)

import { handleSustainedSpellCast } from './core/message-handler.js';

import { dispatchSpell } from './spells/spell-dispatcher.js';
import { PF2eHUDSustainedSpellsIntegration } from './ui/hud-integration.js';
import { PositionedPanelSustainedSpellsIntegration } from './ui/positioned-panel.js';
import { showSustainDialog, refreshSustainDialog, currentSustainDialog, currentSustainDialogActor } from './ui/sustain-dialog.js';

// Global integration instances
let hudIntegration = null;
let positionedPanelIntegration = null;

// Initialize the module
Hooks.once('init', () => {
  // Initializing module
});

Hooks.once('ready', () => {
  // Module ready
  
  // Initialize UI integrations
  hudIntegration = new PF2eHUDSustainedSpellsIntegration();
  hudIntegration.init();

  positionedPanelIntegration = new PositionedPanelSustainedSpellsIntegration();
  positionedPanelIntegration.init();
  
  // Set up socket communication for template operations
  game.socket.on('module.pf2e-wawfuls-spell-sustainer', handleSocketMessage);
  
      // All integrations initialized
});

// Main spell handling hook
Hooks.on('createChatMessage', handleSustainedSpellCast);

// Hook to reset sustainedThisTurn flags at the start of each combat turn
Hooks.on('combatTurn', async (combat, updateData, options) => {
  if (!game.user.isGM) return; // Only GM should handle this
  
  const currentCombatant = combat.combatant;
  if (!currentCombatant?.actor) return;
  
  const actor = currentCombatant.actor;
  
  // Find all sustaining effects for this actor
  const sustainingEffects = actor.itemTypes.effect.filter(e =>
    (e.slug && e.slug.startsWith('sustaining-')) ||
    (e.name && e.name.startsWith('Sustaining: '))
  );
  
  // Reset sustainedThisTurn flag for all sustaining effects
  for (const effect of sustainingEffects) {
    if (effect.flags?.world?.sustainedThisTurn) {
      await effect.update({
        'flags.world.sustainedThisTurn': false
      });
    }
  }
});

// Hook to refresh positioned panel when sustaining effects change
Hooks.on('updateActor', (actor, data, options, userId) => {
  // Refresh positioned panel if this is the current controlled actor
  const currentActor = canvas.tokens?.controlled?.[0]?.actor || game.user?.character;
  if (currentActor && actor.id === currentActor.id && positionedPanelIntegration?.enabled) {
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

// Hook to refresh UI when sustaining effects are created
Hooks.on('createItem', (item, options, userId) => {
  if (item.type === 'effect' && item.parent?.type === 'character') {
    const actor = item.parent;
    
    // Check if this is a sustaining effect
    const isSustainingEffect = (item.slug && item.slug.startsWith('sustaining-')) || 
                              (item.name && item.name.startsWith('Sustaining: '));
    
    if (isSustainingEffect) {
      // Sustaining effect created
      
      // Refresh positioned panel if this is the current controlled actor
      const currentActor = canvas.tokens?.controlled?.[0]?.actor || game.user?.character;
      if (currentActor && actor.id === currentActor.id && positionedPanelIntegration?.enabled) {
        setTimeout(() => {
          positionedPanelIntegration.refreshPanel();
        }, 100);
      }
      
      // Also refresh dialog if it's open and this is the dialog actor
      if (currentSustainDialogActor && actor.id === currentSustainDialogActor.id) {
        setTimeout(() => {
          refreshSustainDialog();
        }, 100);
      }
    }
  }
});

Hooks.on('deleteItem', async (item, options, userId) => {
  if (item.type === 'effect' && item.parent?.type === 'character') {
    const actor = item.parent;
    
    // Check if this was a sustaining effect
    const wasSustainingEffect = (item.slug && item.slug.startsWith('sustaining-')) || 
                               (item.name && item.name.startsWith('Sustaining: '));
    
    if (wasSustainingEffect) {
      // Clean up linked effects when sustaining effect is deleted
      const sustainedSpellData = item.flags?.world?.sustainedSpell;
      if (sustainedSpellData) {
        // Comprehensive cleanup: Find and remove linked effects from all actors
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
        let totalRemoved = 0;
        for (const gameActor of actorSet) {
          try {
            const effects = gameActor.itemTypes?.effect ?? [];
            const ids = effects
              .filter(e => e.flags?.world?.sustainedBy?.effectUuid === effectUuid)
              .map(e => e.id);
            if (ids.length) {
              await gameActor.deleteEmbeddedDocuments('Item', ids);
              totalRemoved += ids.length;
            }
          } catch (actorError) {
            console.warn(`[PF2e Spell Sustainer] Could not clean up effects on ${gameActor.name}:`, actorError);
            // Continue with other actors even if one fails
          }
        }
        
        // Removed linked effects
        
        // Clean up linked measured template if any
        const templateId = sustainedSpellData.templateId;
        if (templateId) {
          try {
            const template = canvas.templates.get(templateId);
            if (template) {
              await template.document.delete();
              // Removed linked template
            }
          } catch (templateError) {
            console.warn(`[PF2e Spell Sustainer] Could not clean up template:`, templateError);
          }
        }
      }
      
      // Refresh UI elements
      const currentActor = canvas.tokens?.controlled?.[0]?.actor || game.user?.character;
      if (currentActor && actor.id === currentActor.id && positionedPanelIntegration?.enabled) {
        setTimeout(() => {
          positionedPanelIntegration.refreshPanel();
        }, 100);
      }
      
      if (currentSustainDialogActor && actor.id === currentSustainDialogActor.id) {
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
      // Refresh UI elements when sustaining effects are updated
      const currentActor = canvas.tokens?.controlled?.[0]?.actor || game.user?.character;
      if (currentActor && actor.id === currentActor.id && positionedPanelIntegration?.enabled) {
        setTimeout(() => {
          positionedPanelIntegration.refreshPanel();
        }, 100);
      }
      
      if (currentSustainDialogActor && actor.id === currentSustainDialogActor.id) {
        setTimeout(() => {
          refreshSustainDialog();
        }, 100);
      }
    }
  }
});

// Socket message handler for operations
async function handleSocketMessage(data) {
  try {
    switch (data.type) {
      case 'linkTemplate':
        // Only GM should process linking operations
        if (!game.user.isGM) return;
        
        // Link a template to a sustaining effect
        const templateDoc = canvas.templates.get(data.templateId);
        const linkingSustainingEffect = await fromUuid(data.sustainingEffectUuid);
        
        if (templateDoc && linkingSustainingEffect) {
          await templateDoc.update({
            'flags.world.sustainedBy': data.sustainingEffectUuid
          });
          
          await linkingSustainingEffect.update({
            'flags.world.sustainedSpell.templateId': data.templateId
          });
        }
        break;
        
      case 'deleteTemplate':
        // Only GM should process deletion operations
        if (!game.user.isGM) return;
        
        // Delete a template as part of sustain operation
        const oldTemplate = canvas.templates.get(data.templateId);
        if (oldTemplate) {
          await oldTemplate.document.delete();
        }
        break;
        
      case 'updateSustainingEffect':
        // Only GM should process effect updates
        if (!game.user.isGM) return;
        
        // Update sustaining effect duration/flags
        const effect = await fromUuid(data.effectUuid);
        if (effect) {
          await effect.update(data.updateData);
        }
        break;
        
      case 'updateAuraEffect':
        // Only GM should process aura effect updates
        if (!game.user.isGM) return;
        
        // Update aura effect badge value
        const auraEffect = await fromUuid(data.effectUuid);
        if (auraEffect) {
          await auraEffect.update({
            'system.badge.value': data.badgeValue
          });
        }
        break;
        

        

    }
  } catch (error) {
    console.error(`[PF2e Spell Sustainer] Socket message error:`, error);
  }
}

// Expose global API for macros and other modules
window.PF2eWawfulsSpellSustainer = {
  showSustainDialog: showSustainDialog,
  hudIntegration: () => hudIntegration,
  positionedPanel: () => positionedPanelIntegration,
  dispatchSpell: dispatchSpell,
  version: '0.4.2'
};

  // API exposed to global window