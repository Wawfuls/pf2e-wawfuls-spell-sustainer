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
  console.log('PF2e Wawful\'s Spell Sustainer | Initializing module');
});

Hooks.once('ready', () => {
  console.log('PF2e Wawful\'s Spell Sustainer | Module ready');
  
  // Initialize UI integrations
  hudIntegration = new PF2eHUDSustainedSpellsIntegration();
  hudIntegration.init();

  positionedPanelIntegration = new PositionedPanelSustainedSpellsIntegration();
  positionedPanelIntegration.init();
  
  console.log('[PF2e Spell Sustainer] All integrations initialized');
});

// Main spell handling hook
Hooks.on('createChatMessage', handleSustainedSpellCast);

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
      // Clean up linked effects when sustaining effect is deleted
      const sustainedSpellData = item.flags?.world?.sustainedSpell;
      if (sustainedSpellData) {
        // Find and remove linked effects
        const linkedEffects = [];
        
        // Find effects that were sustained by this effect
        game.actors.forEach(gameActor => {
          gameActor.itemTypes.effect.forEach(effect => {
            if (effect.flags?.world?.sustainedBy?.effectUuid === item.uuid) {
              linkedEffects.push({ actor: gameActor, effect: effect });
            }
          });
        });
        
        // Remove linked effects
        linkedEffects.forEach(async ({ actor: linkedActor, effect }) => {
          console.log(`[PF2e Spell Sustainer] Removing linked effect ${effect.name} from ${linkedActor.name}`);
          await effect.delete();
        });
        
        console.log(`[PF2e Spell Sustainer] Removed ${linkedEffects.length} linked effects for ${item.name}`);
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

console.log('[PF2e Spell Sustainer] API exposed to window.PF2eWawfulsSpellSustainer');