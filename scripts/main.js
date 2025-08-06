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

// Expose global API for macros and other modules
window.PF2eWawfulsSpellSustainer = {
  showSustainDialog: showSustainDialog,
  hudIntegration: () => hudIntegration,
  positionedPanel: () => positionedPanelIntegration,
  dispatchSpell: dispatchSpell,
  version: '0.4.0-dev'
};

  // API exposed to global window