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
  
  // Use Foundry's interactive template placement workflow
  const templateData = {
    t: templateConfig.type,
    distance: templateConfig.distance,
    angle: templateConfig.angle || 0,
    width: templateConfig.width || 0,
    direction: 0,
    fillColor: game.user.color || "#FF0000"
  };
  
  // Activate the template layer
  canvas.templates.activate();
  
  // Monitor for template placement completion
  Hooks.once('createMeasuredTemplate', async (templateDoc) => {
    console.log(`[PF2e Spell Sustainer] Template placed for Rouse Skeletons:`, templateDoc.id);
    
    // Link the template to our sustaining effect
    await templateDoc.update({
      'flags.world.sustainedBy': sustainingEffect.uuid
    });
    
    // Update the sustaining effect with the new template ID
    await sustainingEffect.update({
      'flags.world.sustainedSpell.templateId': templateDoc.id
    });
    
    ui.notifications.info(`Rouse Skeletons template placed successfully.`);
  });
  
  // Start Foundry's interactive template placement
  try {
    const cls = getDocumentClass("MeasuredTemplate");
    const template = new cls(templateData, {parent: canvas.scene});
    
    // Create the template object for placement
    const templateObject = new CONFIG.MeasuredTemplate.objectClass(template);
    
    // Start the placement workflow - this allows user interaction
    templateObject.draw();
    templateObject.layer.activate();
    templateObject.layer.preview.addChild(templateObject);
    templateObject.activatePreviewListeners();
    
    console.log(`[PF2e Spell Sustainer] Started interactive template placement for Rouse Skeletons`);
    ui.notifications.info(`Place your Rouse Skeletons template (10-foot circle).`);
  } catch (error) {
    console.error(`[PF2e Spell Sustainer] Failed to start template placement:`, error);
    ui.notifications.error(`Failed to start Rouse Skeletons template placement.`);
  }
}