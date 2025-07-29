# PF2e Wawful's Spell Sustainer

A Foundry VTT module for the Pathfinder 2e system that automatically tracks sustained spells, provides turn-based reminders, and creates linked effects for both casters and targets.

## Features

### 🔮 Automatic Spell Detection
- Automatically detects when sustained spells are cast
- Works with any spell that has the "sustain" trait
- No manual setup required - just cast your spells normally!

### 📍 Smart Targeting
- Creates sustaining effects on the caster
- Creates sustained effects on all targets
- Handles self-targeting spells (buffs on the caster)
- Links caster and target effects together

### ⏰ Turn Reminders
- Displays a reminder dialog at the start of each turn for players with sustained spells
- Shows all currently sustained spells
- Provides sustain action dialog to easily maintain spells

### 🎭 Effect Management
- Creates descriptive effects with spell names
- Effects are automatically linked between caster and targets
- Clean removal when spells are no longer sustained
- Prevents duplicate effects from multiple casts

### 🎲 Integrated Sustain Actions
- Adds sustain macro to the hotbar automatically
- Easy-to-use dialog for selecting which spells to sustain
- Handles multiple sustained spells efficiently

## Installation

### Method 1: Module Browser (Recommended)
1. Open Foundry VTT and go to the **Game Modules** tab
2. Click **Install Module**
3. Search for "PF2e Wawful's Spell Sustainer"
4. Click **Install**

### Method 2: Manual Installation
1. Open Foundry VTT and go to the **Game Modules** tab
2. Click **Install Module**
3. Paste this manifest URL: `https://github.com/Wawfuls/pf2e-wawfuls-spell-sustainer/releases/latest/download/module.json`
4. Click **Install**

### Method 3: Direct Download
1. Download the latest release from [GitHub](https://github.com/Wawfuls/pf2e-wawfuls-spell-sustainer/releases)
2. Extract to your `Data/modules` folder
3. Restart Foundry VTT

## Usage

### Basic Usage
1. **Enable the module** in your world's module settings
2. **Cast a sustained spell** normally through the character sheet or spellbook
3. **Target your intended recipients** before casting (optional - if no targets, caster becomes the target)
4. **Effects are created automatically** on both caster and targets
5. **At the start of each turn**, players with sustained spells will see a reminder dialog
6. **Use the sustain dialog** to choose which spells to maintain

### Sustain Macro
- A sustain macro is automatically added to player hotbars
- Click the macro to manually open the sustain dialog
- Select which spells you want to sustain for the current turn
- Unselected spells will have their effects removed

### Effect Linking
- Caster effects are named: "Sustaining: [Spell Name]"
- Target effects are named: "Sustained by: [Caster Name]"
- Effects are linked - removing one removes the corresponding effect on the other actor

## Compatibility

- **Foundry VTT**: Version 11+ (tested up to v13)
- **System**: Pathfinder 2e only
- **Dependencies**: None (uses core PF2e system features)

## Configuration

This module works out of the box with no configuration required. All settings are handled automatically based on spell traits and targeting.

## Troubleshooting

### Effects Not Being Created
- Ensure the spell has the "sustain" trait in its duration
- Make sure you have targets selected (or the caster will be treated as the target)
- Check that the module is enabled in your world

### Reminders Not Appearing
- Verify you're the owner of the character with sustained spells
- Make sure it's the start of your turn in combat
- Check that you have active sustaining effects

### Multiple Effects
- The module prevents duplicate effects from the same spell
- If you see duplicates, they may be from different castings or heightened versions

## Contributing

Found a bug or have a feature request? Please [open an issue](https://github.com/Wawfuls/pf2e-wawfuls-spell-sustainer/issues) on GitHub.

## License

This module is licensed under the [MIT License](LICENSE).

## Credits

Created by **Wawfuls** for the Pathfinder 2e community.

Special thanks to the PF2e system developers and the Foundry VTT community for their excellent documentation and support.

---

*This module is not affiliated with Paizo Inc. Pathfinder is a trademark of Paizo Inc.*