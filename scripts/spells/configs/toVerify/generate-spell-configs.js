// Script to generate individual spell config files from the generate.json data

const fs = require('fs');
const path = require('path');

// Read the generate.json file
const generateData = JSON.parse(fs.readFileSync('./generate.json', 'utf8'));

console.log(`Processing ${generateData.length} spells from generate.json...`);

// Filter spells that have sustaining durations
const sustainedSpells = generateData.filter(spell => {
  const duration = spell.duration?.toLowerCase() || '';
  return duration.includes('sustained') || 
         duration.includes('sustain') ||
         (duration.includes('minute') && duration.includes('up to'));
});

console.log(`Found ${sustainedSpells.length} spells with sustaining durations`);

// Helper function to determine spell type based on spell data
function determineSpellType(spell) {
  const summary = spell.summary?.toLowerCase() || '';
  const target = spell.target?.toLowerCase() || '';
  const area = spell.area?.toLowerCase() || '';
  const defense = spell.defense?.toLowerCase() || '';
  
  // Template/area spells
  if (area && (area.includes('burst') || area.includes('emanation') || area.includes('line') || area.includes('cone'))) {
    return 'measured-template';
  }
  
  // Self-targeted spells or auras
  if (target === '' && area.includes('emanation')) {
    return 'self-aura';
  }
  
  // Save-dependent spells (have defense and target enemies)
  if (defense && target && target !== '' && !target.includes('willing')) {
    return 'save-dependent';
  }
  
  // Default to immediate effects for others
  return 'immediate-effects';
}

// Helper function to determine targeting requirements
function determineTargetRequirement(spell) {
  const target = spell.target?.toLowerCase() || '';
  const defense = spell.defense?.toLowerCase() || '';
  
  // Self-only spells
  if (target === '' && spell.area?.includes('emanation')) {
    return { type: 'self-only' };
  }
  
  // No target required
  if (target === '' || target.includes('willing')) {
    return { type: 'none' };
  }
  
  // Extract target count
  const targetMatch = target.match(/(\d+)\s+creature/);
  const count = targetMatch ? parseInt(targetMatch[1]) : 1;
  
  // Determine disposition based on spell context
  let allowedDispositions = ['hostile', 'neutral'];
  if (target.includes('ally') || target.includes('willing')) {
    allowedDispositions = ['ally'];
  }
  
  return {
    type: 'exact',
    count: count,
    allowedDispositions: allowedDispositions
  };
}

// Helper function to determine save type
function determineSaveType(spell) {
  const defense = spell.defense?.toLowerCase() || '';
  if (defense.includes('will')) return 'will';
  if (defense.includes('fortitude')) return 'fortitude';
  if (defense.includes('reflex')) return 'reflex';
  if (defense.includes('ac')) return 'ac';
  return 'will'; // default
}

// Helper function to create effect configuration
function createEffectConfig(spell) {
  const spellType = determineSpellType(spell);
  
  if (spellType === 'save-dependent') {
    return [{
      target: 'enemy',
      name: `${spell.name} (Effect)`,
      slug: spell.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      description: `You are affected by ${spell.name}. {{casterName}} is sustaining this effect.`,
      duration: { value: 10, unit: 'rounds', sustained: false },
      level: 'castLevel'
    }];
  }
  
  return []; // No specific effects for other types
}

// Generate config files
for (const spell of sustainedSpells) {
  const spellType = determineSpellType(spell);
  const targetRequirement = determineTargetRequirement(spell);
  const saveType = determineSaveType(spell);
  const effects = createEffectConfig(spell);
  
  // Create config object
  const config = {
    name: spell.name,
    spellType: spellType,
    targetRequirement: targetRequirement
  };
  
  // Add save-specific configuration
  if (spellType === 'save-dependent') {
    config.saveType = saveType;
    config.saveResults = {
      applyEffectOn: ['failure', 'criticalFailure'],
      createEffect: true,
      effectType: 'generic-sustaining'
    };
    
    if (effects.length > 0) {
      config.effects = effects;
    }
  }
  
  // Add sustain behavior
  config.maxSustainRounds = 10;
  config.sustainBehavior = 'standard';
  
  // Create filename
  const filename = spell.name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') + '.json';
  
  // Write config file
  const configJson = JSON.stringify(config, null, 2);
  fs.writeFileSync(filename, configJson);
  
  console.log(`Created: ${filename}`);
}

console.log(`Generated ${sustainedSpells.length} spell config files`);
console.log('All files created in the toVerify directory');
console.log('Review each file and move to the main configs directory when ready');