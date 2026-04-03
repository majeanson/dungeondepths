/**
 * Horadric Cube recipe definitions.
 * Each recipe consumes specific item inputs and produces an output item.
 * All crafting is deterministic given an rng seed.
 */

export type RecipeInputType =
  | { type: 'rune';       runeId: string;       count: number }
  | { type: 'quality';    quality: string;       count: number; slot?: string }
  | { type: 'potion';     potionId: string;      count: number }
  | { type: 'gem';        gemId: string;         count: number }
  | { type: 'any';        count: number }

export type RecipeOutput =
  | { type: 'item';     slot?: string; quality: string; floorBoost?: number }
  | { type: 'potion';   potionId: string; count: number }
  | { type: 'rune';     runeId: string }
  | { type: 'unique';   uniqueId?: string }

export interface RecipeDef {
  id: string
  name: string
  description: string
  inputs: RecipeInputType[]
  output: RecipeOutput
}

export const RECIPES: RecipeDef[] = [
  {
    id: 'recipe_normal_to_magic',
    name: 'Imbue Weapon',
    description: '3 normal weapons → 1 magic weapon of the same type',
    inputs: [{ type: 'quality', quality: 'normal', slot: 'weapon', count: 3 }],
    output: { type: 'item', slot: 'weapon', quality: 'magic' },
  },
  {
    id: 'recipe_magic_to_rare',
    name: 'Reforge',
    description: '3 magic items → 1 rare item (random slot from inputs)',
    inputs: [{ type: 'quality', quality: 'magic', count: 3 }],
    output: { type: 'item', quality: 'rare' },
  },
  {
    id: 'recipe_rune_upgrade',
    name: 'Rune Fusion',
    description: '3 identical runes → 1 rune of the next tier',
    inputs: [{ type: 'rune', runeId: 'any', count: 3 }],
    output: { type: 'rune', runeId: 'upgrade' },
  },
  {
    id: 'recipe_identify_rare',
    name: 'Deep Sight',
    description: '1 rare item + El Rune → identified rare with a random extra affix',
    inputs: [
      { type: 'quality', quality: 'rare', count: 1 },
      { type: 'rune', runeId: 'rune_el', count: 1 },
    ],
    output: { type: 'item', quality: 'rare', floorBoost: 2 },
  },
  {
    id: 'recipe_potion_upgrade',
    name: 'Vial Concentrate',
    description: '3 Health Potions → 1 Mana Vial',
    inputs: [{ type: 'potion', potionId: 'hp_potion', count: 3 }],
    output: { type: 'potion', potionId: 'mana_potion', count: 1 },
  },
  {
    id: 'recipe_rare_to_unique',
    name: 'Soul Forge',
    description: '1 rare item + Sol Rune + Tir Rune → attempt to produce a unique of the same base (30% chance)',
    inputs: [
      { type: 'quality', quality: 'rare', count: 1 },
      { type: 'rune', runeId: 'rune_sol', count: 1 },
      { type: 'rune', runeId: 'rune_tir', count: 1 },
    ],
    output: { type: 'unique' },
  },
  {
    id: 'recipe_floor_push',
    name: 'Infuse',
    description: '1 magic item + Nef Rune → same item re-rolled as if from 3 floors deeper',
    inputs: [
      { type: 'quality', quality: 'magic', count: 1 },
      { type: 'rune', runeId: 'rune_nef', count: 1 },
    ],
    output: { type: 'item', quality: 'magic', floorBoost: 3 },
  },
  {
    id: 'recipe_gem_upgrade',
    name: 'Gem Polish',
    description: '3 identical gems → 1 gem of the next tier (chipped→flawed→perfect)',
    inputs: [{ type: 'gem', gemId: 'any', count: 3 }],
    output: { type: 'rune', runeId: 'gem_upgrade' },  // handled specially in transmute
  },
]

export function getRecipeById(id: string): RecipeDef | undefined {
  return RECIPES.find(r => r.id === id)
}
