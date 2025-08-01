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
  
  // Direct template creation - no hook monitoring needed
  
  // Trigger Foundry's template placement tool
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
  
  // Create the template document at canvas center or controlled token position
  let canvasPos;
  const controlledToken = canvas.tokens.controlled[0];
  if (controlledToken) {
    // Place near the controlled token
    canvasPos = { x: controlledToken.x, y: controlledToken.y };
  } else {
    // Fallback to canvas center
    canvasPos = { x: canvas.dimensions.width / 2, y: canvas.dimensions.height / 2 };
  }
  
  const finalData = foundry.utils.mergeObject(templateData, {
    x: canvasPos.x,
    y: canvasPos.y,
    flags: {
      world: {
        sustainedBy: sustainingEffect.uuid
      }
    }
  });
  
  try {
    const templateDoc = await CONFIG.MeasuredTemplate.documentClass.create(finalData, {
      parent: canvas.scene
    });
    
    // Update the sustaining effect with the new template ID  
    await sustainingEffect.update({
      'flags.world.sustainedSpell.templateId': templateDoc.id
    });
    
    console.log(`[PF2e Spell Sustainer] Template created at position for Rouse Skeletons:`, templateDoc.id);
    ui.notifications.info(`Rouse Skeletons template placed successfully.`);
  } catch (error) {
    console.error(`[PF2e Spell Sustainer] Failed to create template:`, error);
    ui.notifications.error(`Failed to place Rouse Skeletons template.`);
  }
}