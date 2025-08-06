// Core utility functions for PF2e Spell Sustainer

// Parse a chat message to extract saving throw results
export function parseSaveResult(chatMsg, targetActors) {
  // Check if this is a saving throw message
  const flags = chatMsg.flags?.pf2e;
  if (!flags) return null;

  // Look for PF2e save data
  const context = flags.context;
  const modifierMessage = flags.modifierMessage;
  
  // Check if this is a saving throw
  if (context?.type !== 'saving-throw' && !modifierMessage) return null;

  // Get the actor who made the save
  const speakerId = chatMsg.speaker?.actor;
  if (!speakerId) return null;

  // Check if this actor is one of our targets
  const targetActor = targetActors.find(t => t.actor.id === speakerId);
  if (!targetActor) return null;

  // Parse the save result from the message
  let saveResult = null;
  
  // Method 1: Check flags for outcome
  if (flags.context?.outcome) {
    saveResult = flags.context.outcome;
  }
  
  // Method 2: Parse from message content
  if (!saveResult) {
    const content = chatMsg.content?.toLowerCase() || '';
    
    if (content.includes('critical success') || content.includes('critically succeeded')) {
      saveResult = 'criticalSuccess';
    } else if (content.includes('success') || content.includes('succeeded')) {
      saveResult = 'success';
    } else if (content.includes('critical failure') || content.includes('critically failed')) {
      saveResult = 'criticalFailure';
    } else if (content.includes('failure') || content.includes('failed')) {
      saveResult = 'failure';
    }
  }

  // Method 3: Check for PF2e outcome classes in HTML
  if (!saveResult && chatMsg.content) {
    if (chatMsg.content.includes('degree-of-success-3')) saveResult = 'criticalSuccess';
    else if (chatMsg.content.includes('degree-of-success-2')) saveResult = 'success';
    else if (chatMsg.content.includes('degree-of-success-1')) saveResult = 'failure';
    else if (chatMsg.content.includes('degree-of-success-0')) saveResult = 'criticalFailure';
  }

  if (!saveResult) return null;

  return {
    actorId: speakerId,
    actorName: targetActor.actor.name,
    result: saveResult
  };
}

// Check if a spell requires saving throws by examining its traits and description
export function checkIfSpellRequiresSave(spell) {
  // Check for common save-related traits and keywords
  const traits = spell.system?.traits?.value || [];
  const description = spell.system?.description?.value?.toLowerCase() || '';
  
  // Common save traits in PF2e
  const saveTraits = ['incapacitation', 'mental', 'fear', 'emotion', 'charm', 'compulsion'];
  const hasSaveTrait = traits.some(trait => saveTraits.includes(trait));
  
  // Check description for save keywords
  const saveKeywords = [
    'saving throw', 'save', 'fortitude', 'reflex', 'will',
    'basic save', 'basic fortitude', 'basic reflex', 'basic will'
  ];
  const hasSaveKeyword = saveKeywords.some(keyword => description.includes(keyword));
  
  // Check if spell has attack rolls (typically don't require saves)
  const hasAttack = spell.system?.spellType?.value === 'attack' || description.includes('spell attack');
  
  // If it has attack rolls, it probably doesn't need saves
  if (hasAttack) return false;
  
  // Return true if we found save indicators
  return hasSaveTrait || hasSaveKeyword;
}

// Extract cast level from multiple sources with improved detection
export function extractCastLevel(msg, ctx, spell) {
  let castLevel = 1;
  
  // Method 1: Extract from chat message content (data-cast-rank attribute)
  if (msg.content) {
    const castRankMatch = msg.content.match(/data-cast-rank="(\d+)"/);
    if (castRankMatch) {
      castLevel = Number(castRankMatch[1]);
      // Found cast rank from message content
      return castLevel;
    }
  }
  
  // Method 2: Extract from roll options
  const rollOptions = ctx?.options || msg.flags?.pf2e?.context?.options || [];
  const itemLevelOption = rollOptions.find(option => option.startsWith('item:level:'));
  if (itemLevelOption) {
    castLevel = Number(itemLevelOption.split(':')[2]);
    // Found cast level from roll options
    return castLevel;
  }
  
  // Method 3: Fallback to other detection methods (handle ctx being undefined)
  castLevel = Number(
    ctx?.spell?.rank ?? 
    ctx?.castLevel ?? 
    ctx?.item?.system?.level?.value ?? 
    ctx?.spellRank ?? 
    ctx?.rank ?? 
    spell.system?.level?.value
  );
  
  if (castLevel && castLevel !== 1) {
    // Found cast level from context/spell data
  }
  
  if (!castLevel || isNaN(castLevel)) castLevel = 1;
  return castLevel;
}

// Create sustain chat message by duplicating original message with sustain note added
export function createSustainMessageFromOriginal(effect, actor, specialNote = '') {
  try {
    const originalMessageId = effect.flags?.world?.sustainedSpell?.createdFromChat;
    if (!originalMessageId) {
      // No original message ID found
      return null;
    }

    const originalMessage = game.messages.get(originalMessageId);
    if (!originalMessage) {
      // Original message not found
      return null;
    }

    // Duplicate the original message data
    const messageData = originalMessage.toObject();
    
    // Parse the HTML to inject our sustain message
    const parser = new DOMParser();
    const doc = parser.parseFromString(messageData.content, 'text/html');
    
    // Find the card-content section
    const cardContent = doc.querySelector('.card-content, section.card-content');
    if (cardContent) {
      // Create the sustain message element
      const sustainMessage = doc.createElement('p');
      sustainMessage.innerHTML = `<strong>${actor.name} sustained this spell.</strong>${specialNote}`;
      
      // Insert it at the beginning of card-content
      cardContent.insertBefore(sustainMessage, cardContent.firstChild);
      
      // If there's not already an hr separator, add one
      if (!sustainMessage.nextElementSibling || sustainMessage.nextElementSibling.tagName.toLowerCase() !== 'hr') {
        const hr = doc.createElement('hr');
        cardContent.insertBefore(hr, sustainMessage.nextSibling);
      }
    }

    // Update the content with the modified HTML
    messageData.content = doc.documentElement.innerHTML;
    
    // Remove the original message ID to avoid conflicts
    delete messageData._id;
    
    // Update timestamp to current time
    messageData.timestamp = Date.now();
    
    // Add flag to indicate this is a sustain message (prevents hook from processing it as original cast)
    if (!messageData.flags) messageData.flags = {};
    if (!messageData.flags.world) messageData.flags.world = {};
    messageData.flags.world.sustainMessage = true;
    
    return messageData;

  } catch (error) {
    console.error(`[PF2e Spell Sustainer] Error creating sustain message from original:`, error);
    return null;
  }
}