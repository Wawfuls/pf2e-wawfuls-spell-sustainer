# Changelog

All notable changes to the PF2e Wawful's Spell Sustainer module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2024-12-19

### Added
- **Initial Release** 🎉
- Automatic detection of sustained spell casts
- Smart targeting system for spell effects
- Turn-based reminder system for players with sustained spells
- Automatic effect creation and linking between casters and targets
- Integrated sustain action dialog
- Automatic hotbar macro addition for sustain actions
- Support for all spells with the "sustain" trait
- Effect naming system: "Sustaining: [Spell Name]" for casters, "Sustained by: [Caster Name]" for targets
- Duplicate effect prevention system
- Self-targeting support for buff spells
- Clean effect removal when spells are no longer sustained
- Multi-language support framework (English included)
- MIT license
- Comprehensive documentation and README

### Features
- **Spell Detection**: Automatically detects when sustained spells are cast through chat message hooks
- **Effect Management**: Creates and manages linked effects between casters and targets
- **Turn Reminders**: Shows dialog at start of turn for players with active sustained spells
- **Sustain Dialog**: Interactive dialog for selecting which spells to maintain each turn
- **Smart Targeting**: Handles targeted spells and self-buffs appropriately
- **Hotbar Integration**: Automatically adds sustain macro to player hotbars

### Technical Details
- Compatible with Foundry VTT v11+ (verified up to v13)
- Designed specifically for the Pathfinder 2e system
- No external dependencies required
- Uses core PF2e system features and hooks
- Modular design for easy maintenance and updates

### Known Limitations
- Requires spells to have the "sustain" trait properly configured
- Only works with the Pathfinder 2e system
- Effects are created based on targeting at time of cast

---

**Note**: This is the initial release of the module. Future versions will include bug fixes, feature enhancements, and community-requested improvements.

For detailed information about features and usage, see the [README.md](README.md).

[Unreleased]: https://github.com/Wawfuls/pf2e-wawfuls-spell-sustainer/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Wawfuls/pf2e-wawfuls-spell-sustainer/releases/tag/v0.1.0