// Rouse Skeletons sustain behavior
// Handles template placement and removal when spell is sustained

export async function handleRouseSkeletonsSustain(caster, sustainingEffect) {
  console.log(`[PF2e Spell Sustainer] Handling Rouse Skeletons sustain`);
  
  const templateConfig = sustainingEffect.flags?.world?.sustainedSpell?.templateConfig;
  if (!templateConfig) {
    console.warn(`[PF2e Spell Sustainer] No template config found for Rouse Skeletons`);
    return;
  }
  
  // Remove existing template if any
  const existingTemplateId = sustainingEffect.flags?.world?.sustainedSpell?.templateId;
  if (existingTemplateId) {
    const existingTemplate = canvas.templates.get(existingTemplateId);
    if (existingTemplate) {
      console.log(`[PF2e Spell Sustainer] Removing existing template for Rouse Skeletons`);
      await existingTemplate.document.delete();
    }
  }
  
  // Create new template
  console.log(`[PF2e Spell Sustainer] Creating new template for Rouse Skeletons`);
  
  const templateData = {
    t: templateConfig.type,
    distance: templateConfig.distance,
    angle: templateConfig.angle || 0,
    width: templateConfig.width || 0,
    x: 0, // Will be set by user placement
    y: 0, // Will be set by user placement
    direction: 0,
    flags: {
      world: {
        sustainedBy: sustainingEffect.uuid
      }
    }
  };
  
  // Use Foundry's template placement workflow
  const templateDocument = new CONFIG.MeasuredTemplate.documentClass(templateData, {parent: canvas.scene});
  const template = new CONFIG.MeasuredTemplate.objectClass(templateDocument);
  
  // Start the placement workflow
  template.draw();
  template.layer.activate();
  template.layer.preview.addChild(template);
  template.activatePreviewListeners();
  
  // Monitor for template placement completion
  const hookId = `templatePlacement_${sustainingEffect.id}`;
  
  Hooks.once('createMeasuredTemplate', async (templateDoc) => {
    // Check if this is our template by checking the sustained flag
    if (templateDoc.flags?.world?.sustainedBy === sustainingEffect.uuid) {
      console.log(`[PF2e Spell Sustainer] Template placed for Rouse Skeletons:`, templateDoc.id);
      
      // Update the sustaining effect with the new template ID
      await sustainingEffect.update({
        'flags.world.sustainedSpell.templateId': templateDoc.id
      });
      
      ui.notifications.info(`Rouse Skeletons template placed successfully.`);
    }
  });
  
  // Clean up hook after 30 seconds if no template is placed
  setTimeout(() => {
    if (Hooks._hooks['createMeasuredTemplate']?.some(h => h.id === hookId)) {
      Hooks.off('createMeasuredTemplate', hookId);
      console.log(`[PF2e Spell Sustainer] Template placement timeout for Rouse Skeletons`);
    }
  }, 30000);
  
  ui.notifications.info(`Place your Rouse Skeletons template (10-foot circle).`);
}