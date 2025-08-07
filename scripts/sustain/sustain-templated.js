// Generic templated spell sustain behavior
// Handles template placement and removal when spell is sustained

// Helper function to calculate distance between two points using Foundry's built-in methods
function calculateGridDistance(point1, point2) {
  try {
    // Use the modern Foundry v12+ API to avoid deprecation warnings
    const path = canvas.grid.measurePath([point1, point2], {gridSpaces: true});
    const distance = path.distance;
  
    return distance;
  } catch (error) {
    console.error(`[PF2e Spell Sustainer] Error in calculateGridDistance:`, error);
    // Fallback to simple distance calculation
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    const gridDistance = (pixelDistance / canvas.grid.size) * canvas.grid.distance;

    return gridDistance;
  }
}

// Helper function to convert grid distance to pixels for visual overlays
function gridDistanceToPixels(gridDistance) {
  try {
    
    
    // Simple calculation: grid squares * pixels per square
    const gridSquares = gridDistance / canvas.grid.distance;
    const pixels = gridSquares * canvas.grid.size;
    return pixels;
  } catch (error) {
    console.error(`[PF2e Spell Sustainer] Error in gridDistanceToPixels:`, error);
    return gridDistance * 20; // Fallback: assume 20 pixels per foot
  }
}

// Helper function to create visual range indicator
function createRangeIndicator(centerPoint, maxDistanceInFeet, color = 0xFF6600, alpha = 0.15) {
  try {
    const rangePixels = gridDistanceToPixels(maxDistanceInFeet);
    
    const graphics = new PIXI.Graphics();
    graphics.lineStyle(2, color, 0.6); // Thinner, less prominent stroke
    graphics.beginFill(color, alpha);
    graphics.drawCircle(centerPoint.x, centerPoint.y, rangePixels);
    graphics.endFill();
    
    graphics.zIndex = 1000;
    
    const targetLayer = canvas.interface || canvas.overlay || canvas.hud || canvas.stage;
    targetLayer.addChild(graphics);
    graphics.visible = true;
    graphics.renderable = true;
    
    if (targetLayer.sortableChildren) {
      targetLayer.sortChildren();
    }
    
    // Range indicator created
    
    return () => {
      try {
        if (graphics && graphics.parent) {
          graphics.parent.removeChild(graphics);
        }
        if (graphics && !graphics.destroyed) {
          graphics.destroy();
        }
        // Range indicator removed
      } catch (error) {
        // Cleanup error
      }
    };
  } catch (error) {
    console.error(`[PF2e Spell Sustainer] Error in createRangeIndicator:`, error);
    return () => {}; // Return empty cleanup function
  }
}

/**
 * Creates a visual indicator showing the intersection area of two circles.
 * Used during spell sustaining to show the valid placement area where the 
 * actor can move while keeping the sustained spell within its original range.
 */
function createIntersectionIndicator(center1, radius1, center2, radius2, color = 0x00FF00, alpha = 0.25) {
  try {
    const radius1Pixels = gridDistanceToPixels(radius1);
    const radius2Pixels = gridDistanceToPixels(radius2);
    
    // Calculate circle intersection
    const dx = center2.x - center1.x;
    const dy = center2.y - center1.y;
    const distanceBetweenCenters = Math.sqrt(dx * dx + dy * dy);
    
    if (distanceBetweenCenters > radius1Pixels + radius2Pixels) {
      return () => {}; // No intersection
    }
    
    if (distanceBetweenCenters < Math.abs(radius1Pixels - radius2Pixels)) {
      // One circle is completely inside the other
      // Draw the smaller circle as the intersection
      const smallerRadius = Math.min(radius1Pixels, radius2Pixels);
      const smallerCenter = radius1Pixels < radius2Pixels ? center1 : center2;
      
      const graphics = new PIXI.Graphics();
      graphics.lineStyle(3, color, 0.8);
      graphics.beginFill(color, alpha);
      graphics.drawCircle(smallerCenter.x, smallerCenter.y, smallerRadius);
      graphics.endFill();
      graphics.zIndex = 1001;
      
      const targetLayer = canvas.interface || canvas.overlay || canvas.stage;
      targetLayer.addChild(graphics);
      graphics.visible = true;
      graphics.renderable = true;
      
      if (targetLayer.sortableChildren) {
        targetLayer.sortChildren();
      }
            
      return () => {
        try {
          if (graphics && graphics.parent) {
            graphics.parent.removeChild(graphics);
          }
          if (graphics && !graphics.destroyed) {
            graphics.destroy();
          }
        } catch (error) {
          // Cleanup error
        }
      };
    }
    
    // Calculate geometric intersection of two circles
    const a = (radius1Pixels * radius1Pixels - radius2Pixels * radius2Pixels + distanceBetweenCenters * distanceBetweenCenters) / (2 * distanceBetweenCenters);
    const h = Math.sqrt(radius1Pixels * radius1Pixels - a * a);
    
    // Point along the line between centers
    const px = center1.x + a * dx / distanceBetweenCenters;
    const py = center1.y + a * dy / distanceBetweenCenters;
    
    // Calculate the two intersection points
    const intersectionPoint1 = {
      x: px + h * dy / distanceBetweenCenters,
      y: py - h * dx / distanceBetweenCenters
    };
    const intersectionPoint2 = {
      x: px - h * dy / distanceBetweenCenters,
      y: py + h * dx / distanceBetweenCenters
    };
    
    // Calculate angles for the intersection boundary
    const angle1_1 = Math.atan2(intersectionPoint1.y - center1.y, intersectionPoint1.x - center1.x);
    const angle1_2 = Math.atan2(intersectionPoint2.y - center1.y, intersectionPoint2.x - center1.x);
    const angle2_1 = Math.atan2(intersectionPoint1.y - center2.y, intersectionPoint1.x - center2.x);
    const angle2_2 = Math.atan2(intersectionPoint2.y - center2.y, intersectionPoint2.x - center2.x);
    
    // Create polygon points for the lens shape
    const polygonPoints = [];
    const segments = 20; // Number of segments for each arc
    
    // Build lens-shaped polygon from arcs that face toward each other's centers
    let startAngle1 = angle1_1;
    let endAngle1 = angle1_2;
    let angleDiff1 = endAngle1 - startAngle1;
    
    // Normalize angle difference
    if (angleDiff1 > Math.PI) angleDiff1 -= 2 * Math.PI;
    if (angleDiff1 < -Math.PI) angleDiff1 += 2 * Math.PI;
    
    // Select arc for first circle that faces toward second circle center
    const towardCenter2X = center2.x - center1.x;
    const towardCenter2Y = center2.y - center1.y;
    const towardCenter2Angle = Math.atan2(towardCenter2Y, towardCenter2X);
    
    const midAngle1 = startAngle1 + angleDiff1 / 2;
    let angleDiff1Toward = towardCenter2Angle - midAngle1;
    if (angleDiff1Toward > Math.PI) angleDiff1Toward -= 2 * Math.PI;
    if (angleDiff1Toward < -Math.PI) angleDiff1Toward += 2 * Math.PI;
    
    if (Math.abs(angleDiff1Toward) > Math.PI / 2) {
      angleDiff1 = angleDiff1 > 0 ? angleDiff1 - 2 * Math.PI : angleDiff1 + 2 * Math.PI;
    }
    
    // Add points along arc of circle 1
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = startAngle1 + t * angleDiff1;
      polygonPoints.push({
        x: center1.x + radius1Pixels * Math.cos(angle),
        y: center1.y + radius1Pixels * Math.sin(angle)
      });
    }
    
    // Select arc for second circle that faces toward first circle center
    let startAngle2 = angle2_2;
    let endAngle2 = angle2_1;
    let angleDiff2 = endAngle2 - startAngle2;
    
    // Normalize angle difference
    if (angleDiff2 > Math.PI) angleDiff2 -= 2 * Math.PI;
    if (angleDiff2 < -Math.PI) angleDiff2 += 2 * Math.PI;
    
    const towardCenter1X = center1.x - center2.x;
    const towardCenter1Y = center1.y - center2.y;
    const towardCenter1Angle = Math.atan2(towardCenter1Y, towardCenter1X);
    
    const midAngle2 = startAngle2 + angleDiff2 / 2;
    let angleDiff2Toward = towardCenter1Angle - midAngle2;
    if (angleDiff2Toward > Math.PI) angleDiff2Toward -= 2 * Math.PI;
    if (angleDiff2Toward < -Math.PI) angleDiff2Toward += 2 * Math.PI;
    
    if (Math.abs(angleDiff2Toward) > Math.PI / 2) {
      angleDiff2 = angleDiff2 > 0 ? angleDiff2 - 2 * Math.PI : angleDiff2 + 2 * Math.PI;
    }
    
    // Add points along arc of circle 2 (skip first point to avoid duplicate)
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const angle = startAngle2 + t * angleDiff2;
      polygonPoints.push({
        x: center2.x + radius2Pixels * Math.cos(angle),
        y: center2.y + radius2Pixels * Math.sin(angle)
      });
    }
    
    // Create and render intersection polygon
    const graphics = new PIXI.Graphics();
    graphics.lineStyle(3, color, 0.8);
    graphics.beginFill(color, alpha);
    
    if (polygonPoints.length > 0) {
      graphics.moveTo(polygonPoints[0].x, polygonPoints[0].y);
      for (let i = 1; i < polygonPoints.length; i++) {
        graphics.lineTo(polygonPoints[i].x, polygonPoints[i].y);
      }
      graphics.closePath();
    }
    
    graphics.endFill();
    graphics.zIndex = 1001;
    
    const targetLayer = canvas.interface || canvas.overlay || canvas.stage;
    targetLayer.addChild(graphics);
    graphics.visible = true;
    graphics.renderable = true;
    
    if (targetLayer.sortableChildren) {
      targetLayer.sortChildren();
    }
        
    // Return cleanup function
    return () => {
      try {
        if (graphics && graphics.parent) {
          graphics.parent.removeChild(graphics);
        }
        if (graphics && !graphics.destroyed) {
          graphics.destroy();
        }
      } catch (error) {
        // Cleanup error
      }
    };
  } catch (error) {
    console.error(`[PF2e Spell Sustainer] Error in createIntersectionIndicator:`, error);
    return () => {}; // Return empty cleanup function
  }
}

// Handle initial template placement (no duration increment)
export async function handleInitialTemplatePlace(caster, sustainingEffect, spellConfig) {
  const spellName = spellConfig?.name || sustainingEffect.flags?.world?.sustainedSpell?.spellName || 'Unknown Spell';

  
  const templateConfig = sustainingEffect.flags?.world?.sustainedSpell?.templateConfig;
  if (!templateConfig) {
    console.warn(`[PF2e Spell Sustainer] No template config found for ${spellName}`);
    return;
  }
  
  // Get caster token position for range validation
  const casterToken = canvas.tokens.controlled[0] || 
                     canvas.tokens.placeables.find(t => t.actor?.id === caster.id);
  

  
  const rangeConstraints = {
    maxFromCaster: spellConfig?.range?.initial || null,
    casterPosition: casterToken ? { x: casterToken.center.x, y: casterToken.center.y } : null,
    isInitialCast: true
  };
  
  // With the updated message handler, this function should now be called by the casting user
  // So we can proceed directly with template placement
  await placeTemplate(spellName, templateConfig, sustainingEffect, rangeConstraints);
}

// Handle template sustain (removes old template, places new one, increments duration)
export async function handleTemplatedSustain(caster, sustainingEffect, spellConfig) {
  const spellName = spellConfig?.name || sustainingEffect.flags?.world?.sustainedSpell?.spellName || 'Unknown Spell';

  
  const templateConfig = sustainingEffect.flags?.world?.sustainedSpell?.templateConfig;
  if (!templateConfig) {
    console.warn(`[PF2e Spell Sustainer] No template config found for ${spellName}`);
    return;
  }
  
  // Get original template position for sustain movement constraints
  let originalPosition = null;
  const existingTemplateId = sustainingEffect.flags?.world?.sustainedSpell?.templateId;
  if (existingTemplateId) {
    const existingTemplate = canvas.templates.get(existingTemplateId);
    if (existingTemplate) {
      originalPosition = { x: existingTemplate.x, y: existingTemplate.y };
  
      // Template deletion moved to after sustain check
    }
  }
  
  // Get caster token position for range validation
  const casterToken = canvas.tokens.controlled[0] || 
                     canvas.tokens.placeables.find(t => t.actor?.id === caster.id);
  

  
  const rangeConstraints = {
    maxFromCaster: spellConfig?.range?.initial || null,
    maxFromOriginal: spellConfig?.range?.sustainMove || null,
    casterPosition: casterToken ? { x: casterToken.center.x, y: casterToken.center.y } : null,
    originalPosition: originalPosition,
    isInitialCast: false
  };
  
  const alreadySustained = sustainingEffect.flags?.world?.sustainedThisTurn;
  
  // Templates should never allow multiple sustains per turn - block immediately
  if (alreadySustained) {
    const spellName = spellConfig?.name || sustainingEffect.flags?.world?.sustainedSpell?.spellName || 'this spell';
    ui.notifications.warn(`${spellName} has already been sustained this turn.`);
    return false; // Indicate sustain was blocked
  }
  
  // Delete the old template before placing the new one (only after confirming sustain should proceed)
  const existingTemplateId2 = sustainingEffect.flags?.world?.sustainedSpell?.templateId;
  if (existingTemplateId2) {
    const existingTemplate2 = canvas.templates.get(existingTemplateId2);
    if (existingTemplate2) {
      try {
        await existingTemplate2.document.delete();
      } catch (deleteError) {
        console.warn(`[PF2e Spell Sustainer] Could not delete old template directly, requesting GM assistance:`, deleteError);
        // Use socket to request GM delete the template
        game.socket.emit('module.pf2e-wawfuls-spell-sustainer', {
          type: 'deleteTemplate',
          templateId: existingTemplateId2
        });
        // Wait for the deletion to process
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }
  
  // Place template and increment duration (only happens once per turn)
  await placeTemplate(spellName, templateConfig, sustainingEffect, rangeConstraints);
  
  // Standard sustain behavior - increment duration by 1 round
  const maxRounds = sustainingEffect.flags?.world?.sustainedSpell?.maxSustainRounds || 10;
  const curRounds = sustainingEffect.system?.duration?.value || 0;
  const updateData = {
    'system.duration.value': Math.min(curRounds + 1, maxRounds),
    'flags.world.sustainedThisTurn': true
  };
  
  try {
    await sustainingEffect.update(updateData);
  } catch (updateError) {
    console.warn(`[PF2e Spell Sustainer] Could not update sustaining effect directly, requesting GM assistance:`, updateError);
    // Use socket to request GM update the effect
    game.socket.emit('module.pf2e-wawfuls-spell-sustainer', {
      type: 'updateSustainingEffect',
      effectUuid: sustainingEffect.uuid,
      updateData: updateData
    });
  }
  
  return true; // Indicate successful sustain
}

// Shared template placement logic
async function placeTemplate(spellName, templateConfig, sustainingEffect, rangeConstraints = {}) {
  // Get the caster actor to determine user permissions
  const caster = sustainingEffect.parent;
  if (!caster) {
    console.error(`[PF2e Spell Sustainer] No caster found for sustaining effect`);
    return;
  }
  
  // Find the user who owns/controls this actor
  const casterUser = game.users.find(u => u.character?.id === caster.id) || 
                     game.users.find(u => caster.testUserPermission(u, "OWNER"));
  
  // Create visual range indicators
  let rangeIndicatorCleanup = null;
  
  // For sustain operations (not initial cast), show only the intersection area
  if (!rangeConstraints.isInitialCast && rangeConstraints.casterPosition && rangeConstraints.maxFromCaster && 
      rangeConstraints.originalPosition && rangeConstraints.maxFromOriginal) {
    
    try {
      rangeIndicatorCleanup = createIntersectionIndicator(
        rangeConstraints.casterPosition,  // Center of caster range circle
        rangeConstraints.maxFromCaster,   // Radius of caster range
        rangeConstraints.originalPosition, // Center of movement range circle  
        rangeConstraints.maxFromOriginal,  // Radius of movement range
        0x00FF00, // Green color (will be overridden internally for better contrast)
        0.4 // More visible for the allowed area
      );
  
    } catch (error) {
      console.error(`[PF2e Spell Sustainer] Failed to create intersection indicator:`, error);
    }
  } 
  // For initial cast, show the simple caster range circle
  else if (rangeConstraints.casterPosition && rangeConstraints.maxFromCaster) {

    try {
      rangeIndicatorCleanup = createRangeIndicator(
        rangeConstraints.casterPosition, 
        rangeConstraints.maxFromCaster, 
        0x00FF00, // Bright green for caster range
        0.15 // Reduced opacity
      );

    } catch (error) {
      console.error(`[PF2e Spell Sustainer] Failed to create caster range indicator:`, error);
    }
  }

  // Get the original spell for proper flag data
  const spellItem = sustainingEffect.parent?.items?.find(item => 
    item.name === (spellName.replace('Sustaining: ', '')) || 
    item.slug === spellName.toLowerCase().replace(/\s+/g, '-').replace('sustaining-', '')
  );

  // Use Foundry's interactive template placement workflow
  const templateData = {
    t: templateConfig.type,
    distance: templateConfig.distance,
    angle: templateConfig.angle || 0,
    width: templateConfig.width || 0,
    direction: 0,
    fillColor: (casterUser?.color || game.user.color || "#FF0000")
  };

  // Add PF2e flags if we have the spell item
  if (spellItem) {

    
    templateData.flags = {
      pf2e: {
        areaShape: templateConfig.displayType || templateConfig.type || "burst",
        origin: {
          name: spellItem.name,
          slug: spellItem.slug || spellItem.name.toLowerCase().replace(/\s+/g, '-'),
          traits: spellItem.system?.traits?.value || [],
          actor: sustainingEffect.parent.uuid,
          uuid: spellItem.uuid,
          type: "spell",
          rollOptions: [], // Could be populated but not critical
          castRank: sustainingEffect.flags?.world?.sustainedSpell?.castLevel || spellItem.system?.level?.value || 1,
          variant: {
            overlays: []
          }
        }
      },
      world: {
        sustainedBy: sustainingEffect.uuid
      }
    };
    

  } else {
    // Fallback if we can't find the spell item
    templateData.flags = {
      pf2e: {
        areaShape: templateConfig.displayType || templateConfig.type || "burst"
      },
      world: {
        sustainedBy: sustainingEffect.uuid
      }
    };
    

  }
  
  // Monitor for template placement completion
  Hooks.once('createMeasuredTemplate', async (templateDoc) => {
    // Template placed
    
    try {
      // Link the template to our sustaining effect
      try {
        await templateDoc.update({
          'flags.world.sustainedBy': sustainingEffect.uuid
        });
        
        await sustainingEffect.update({
          'flags.world.sustainedSpell.templateId': templateDoc.id
        });
      } catch (linkError) {
        console.warn(`[PF2e Spell Sustainer] Could not link template directly, requesting GM assistance:`, linkError);
        // If not GM, send a socket message to have GM do the linking
        game.socket.emit('module.pf2e-wawfuls-spell-sustainer', {
          type: 'linkTemplate',
          templateId: templateDoc.id,
          sustainingEffectUuid: sustainingEffect.uuid
        });
      }
      
      // Clean up visual indicators
      if (rangeIndicatorCleanup) {
        rangeIndicatorCleanup();
      }
      
    } catch (error) {
      console.error(`[PF2e Spell Sustainer] Error in template placement hook:`, error);
      if (rangeIndicatorCleanup) {
        rangeIndicatorCleanup();
      }
    }
  });
  
    // Start Foundry's interactive template placement
  try {
    // Only proceed if this is the caster or GM
    // For non-caster players, they shouldn't be triggering template placement anyway
    // since sustain should only be available to the caster
    
    // If current user is the caster or GM, proceed with template placement
    const templateLayer = canvas.templates;
    
    // Create a template placement workflow similar to spell casting
    const initialTemplate = templateLayer.createPreview(templateData);
    if (initialTemplate) {
      // Set up a timeout to clean up indicators if no template is placed within 30 seconds
      setTimeout(() => {
        if (rangeIndicatorCleanup) {
          rangeIndicatorCleanup();
        }
      }, 30000); // 30 seconds timeout
      
    } else {
      // Fallback: try direct creation with user notification
      ui.notifications.info(`Click on the canvas to place the ${spellName} template.`);
      
      // Set up a one-time click listener for template placement
      const placeTemplateClick = async (event) => {
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
          
          // Link template to sustaining effect
          try {
            await sustainingEffect.update({
              'flags.world.sustainedSpell.templateId': templateDoc.id
            });
          } catch (linkError) {
            console.warn(`[PF2e Spell Sustainer] Could not link template directly, requesting GM assistance:`, linkError);
            // Send socket message for GM to link
            game.socket.emit('module.pf2e-wawfuls-spell-sustainer', {
              type: 'linkTemplate',
              templateId: templateDoc.id,
              sustainingEffectUuid: sustainingEffect.uuid
            });
          }
          
          // Template placed
        } catch (createError) {
          console.error(`[PF2e Spell Sustainer] Failed to create template:`, createError);
          ui.notifications.error(`Failed to create template for ${spellName}: ${createError.message}`);
        }
        
        // Remove the click listener and cleanup
        canvas.app.stage.off('click', placeTemplateClick);
        if (rangeIndicatorCleanup) rangeIndicatorCleanup();
      };
      
      // Add click listener
      canvas.app.stage.once('click', placeTemplateClick);
      
      // Add timeout cleanup in case user cancels (30 seconds)
      setTimeout(() => {
        canvas.app.stage.off('click', placeTemplateClick);
        if (rangeIndicatorCleanup) rangeIndicatorCleanup();
        ui.notifications.warn(`Template placement for ${spellName} timed out.`);
      }, 30000);
    }
  } catch (error) {
    console.error(`[PF2e Spell Sustainer] Failed to start template placement:`, error);
    ui.notifications.error(`Failed to start template placement for ${spellName}: ${error.message}`);
    // Cleanup visual indicators on error
    if (rangeIndicatorCleanup) rangeIndicatorCleanup();
  }
}

