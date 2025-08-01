// Dynamic spell config loader
// Automatically loads all JSON config files in this directory

import evilEyeConfig from './evil-eye.json' with { type: 'json' };
import needleOfVengeanceConfig from './needle-of-vengeance.json' with { type: 'json' };
import forbiddingWardConfig from './forbidding-ward.json' with { type: 'json' };
import blessConfig from './bless.json' with { type: 'json' };
import rouseSkeletonsConfig from './rouse-skeletons.json' with { type: 'json' };

// Combine all spell configs into a single object using the spell name as key
export const spellConfigs = {
  'evil-eye': evilEyeConfig,
  'needle-of-vengeance': needleOfVengeanceConfig,
  'forbidding-ward': forbiddingWardConfig,
  'bless': blessConfig,
  'rouse-skeletons': rouseSkeletonsConfig
};

// Export individual configs for direct access if needed
export {
  evilEyeConfig,
  needleOfVengeanceConfig,
  forbiddingWardConfig,
  blessConfig,
  rouseSkeletonsConfig
};

// Default export for backward compatibility
export default spellConfigs;