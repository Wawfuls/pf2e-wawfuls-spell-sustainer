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
  });
  
  // Start Foundry's interactive template placement using the template layer
  try {
    // Use the template layer's built-in placement workflow
    const templateLayer = canvas.templates;
    
    // Create a template placement workflow similar to spell casting
    const initialTemplate = templateLayer.createPreview(templateData);
    if (initialTemplate) {
      console.log(`[PF2e Spell Sustainer] Started interactive template placement for Rouse Skeletons`);
    } else {
      // Fallback: try direct creation with user notification
      console.log(`[PF2e Spell Sustainer] Using fallback click placement for template`);
      
      // Set up a one-time click listener for template placement
      const placeTemplate = async (event) => {
        const pos = event.data.getLocalPosition(canvas.app.stage);
        const finalData = foundry.utils.mergeObject(templateData, {
          x: pos.x,
          y: pos.y,
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
          
          await sustainingEffect.update({
            'flags.world.sustainedSpell.templateId': templateDoc.id
          });
          
          console.log(`[PF2e Spell Sustainer] Template placed for Rouse Skeletons:`, templateDoc.id);
        } catch (createError) {
          console.error(`[PF2e Spell Sustainer] Failed to create template:`, createError);
        }
        
        // Remove the click listener
        canvas.app.stage.off('click', placeTemplate);
      };
      
      // Add click listener
      canvas.app.stage.once('click', placeTemplate);
    }
  } catch (error) {
    console.error(`[PF2e Spell Sustainer] Failed to start template placement:`, error);
  }
  
  // Standard sustain behavior - increment duration by 1 round
  const maxRounds = sustainingEffect.flags?.world?.sustainedSpell?.maxSustainRounds || 10;
  const curRounds = sustainingEffect.system?.duration?.value || 0;
  await sustainingEffect.update({
    'system.duration.value': Math.min(curRounds + 1, maxRounds),
    'flags.world.sustainedThisTurn': true
  });
}