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
  
  // Create new template using Foundry's proper workflow
  console.log(`[PF2e Spell Sustainer] Starting template placement for Rouse Skeletons`);
  
  // Monitor for template placement completion
  const hookId = `templatePlacement_${sustainingEffect.id}`;
  
  Hooks.once('createMeasuredTemplate', async (templateDoc) => {
    // Check if this template was created during our placement workflow
    // We'll identify it by checking if it was created within a reasonable timeframe
    console.log(`[PF2e Spell Sustainer] Template created during placement workflow:`, templateDoc.id);
    
    // Update the template with our sustaining effect link
    await templateDoc.update({
      'flags.world.sustainedBy': sustainingEffect.uuid
    });
    
    // Update the sustaining effect with the new template ID
    await sustainingEffect.update({
      'flags.world.sustainedSpell.templateId': templateDoc.id
    });
    
    ui.notifications.info(`Rouse Skeletons template placed successfully.`);
  });
  
  // Clean up hook after 30 seconds if no template is placed
  setTimeout(() => {
    Hooks.off('createMeasuredTemplate', hookId);
    console.log(`[PF2e Spell Sustainer] Template placement hook cleaned up`);
  }, 30000);
  
  // Use Foundry's built-in template placement tool
  const templateData = {
    t: templateConfig.type,
    distance: templateConfig.distance,
    angle: templateConfig.angle || 0,
    width: templateConfig.width || 0,
    direction: 0
  };
  
  // Activate the template layer and start placement using the standard workflow
  canvas.templates.activate();
  
  // Use the template layer's placement workflow
  const initialData = foundry.utils.mergeObject(templateData, {
    x: canvas.mousePosition.x,
    y: canvas.mousePosition.y
  });
  
  // Use the document creation workflow
  await CONFIG.MeasuredTemplate.documentClass.create(initialData, {
    parent: canvas.scene,
    fromTool: true
  });
  
  ui.notifications.info(`Place your Rouse Skeletons template (10-foot circle).`);
}