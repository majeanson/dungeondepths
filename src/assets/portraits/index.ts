/**
 * Portrait image registry — wires pixel-art PNGs into MonsterPortrait and PlayerPortrait.
 *
 * HOW TO ADD A PORTRAIT:
 *   1. Drop the PNG into:
 *        assets/portraits/monsters/<monster-id>.png
 *        assets/portraits/classes/<class-id>.png
 *   2. Uncomment the corresponding require() line below.
 *   3. The component auto-switches from glyph fallback to image. Done.
 *
 * Keep ALL require() calls here even when commented out — Metro bundler
 * resolves requires statically, so dynamic require() is not supported.
 *
 * Recommended dimensions: 64×64 px minimum, 128×128 px ideal.
 * Format: PNG with transparent background or dark (#040303) background.
 */
import type { ImageSourcePropType } from 'react-native'

// ── Monster portraits ─────────────────────────────────────────────────────────
export const MONSTER_PORTRAITS: Record<string, ImageSourcePropType | null> = {
  // Regular monsters — all available
  skeleton:      require('../../../assets/portraits/monsters/skeleton.png'),
  zombie:        require('../../../assets/portraits/monsters/zombie.png'),
  fallen:        require('../../../assets/portraits/monsters/fallen.png'),
  imp:           require('../../../assets/portraits/monsters/imp.png'),
  bone_warrior:  require('../../../assets/portraits/monsters/bone_warrior.png'),
  plague_rat:    require('../../../assets/portraits/monsters/plague_rat.png'),
  cave_troll:    require('../../../assets/portraits/monsters/cave_troll.png'),
  dark_shaman:   require('../../../assets/portraits/monsters/dark_shaman.png'),
  blood_hawk:    require('../../../assets/portraits/monsters/blood_hawk.png'),
  golem:         require('../../../assets/portraits/monsters/golem.png'),
  wraith:        require('../../../assets/portraits/monsters/wraith.png'),
  demon_lord:    require('../../../assets/portraits/monsters/demon_lord.png'),
  // Bosses
  the_warden:    require('../../../assets/portraits/monsters/the_warden.png'),
  bonekeeper:    require('../../../assets/portraits/monsters/bonekeeper.png'),
  inferno_witch: require('../../../assets/portraits/monsters/inferno_witch.png'),
  shadow_stalker:require('../../../assets/portraits/monsters/shadow_stalker.png'),
  iron_colossus: require('../../../assets/portraits/monsters/iron_colossus.png'),
  abyssal_one:   require('../../../assets/portraits/monsters/abyssal_one.png'),
}

// ── Class portraits — all available ──────────────────────────────────────────
export const CLASS_PORTRAITS: Record<string, ImageSourcePropType | null> = {
  warrior:  require('../../../assets/portraits/classes/warrior.png'),
  rogue:    require('../../../assets/portraits/classes/rogue.png'),
  sorcerer: require('../../../assets/portraits/classes/sorcerer.png'),
}
