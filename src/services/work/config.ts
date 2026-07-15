export const WORK_ACTIVITY_IDS = ['typing', 'fishing', 'connect4'] as const;
export type WorkActivityId = (typeof WORK_ACTIVITY_IDS)[number];

export const WORK_COOLDOWNS_MS: Record<WorkActivityId, number> = {
  typing: 10 * 60 * 1_000,
  fishing: 15 * 60 * 1_000,
  connect4: 20 * 60 * 1_000,
};

export const TYPING_REWARD_XP = 12;
export const TYPING_TIME_LIMIT_MS = 15_000;
export const TYPING_CHALLENGE_OFFER_MS = 2 * 60 * 1_000;

export const CONNECT4_REWARDS = {
  won: 25,
  draw: 12,
  lost: 5,
} as const;
export const CONNECT4_GAME_TIMEOUT_MS = 5 * 60 * 1_000;

export interface FishDefinition {
  id: string;
  name: string;
  emoji: string;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic';
  weight: number;
  xp: number;
  saleValue: number;
}

export const FISH: readonly FishDefinition[] = [
  {
    id: 'fish_minnow',
    name: 'Minnow',
    emoji: '🐟',
    rarity: 'Common',
    weight: 50,
    xp: 8,
    saleValue: 1,
  },
  {
    id: 'fish_trout',
    name: 'Trout',
    emoji: '🐟',
    rarity: 'Uncommon',
    weight: 30,
    xp: 12,
    saleValue: 2,
  },
  {
    id: 'fish_salmon',
    name: 'Salmon',
    emoji: '🐠',
    rarity: 'Rare',
    weight: 15,
    xp: 18,
    saleValue: 4,
  },
  {
    id: 'fish_golden_carp',
    name: 'Golden Carp',
    emoji: '✨',
    rarity: 'Epic',
    weight: 5,
    xp: 28,
    saleValue: 8,
  },
];

export function getFish(id: string): FishDefinition | undefined {
  return FISH.find((fish) => fish.id === id);
}

export const TYPING_WORDS = [
  'accomplishment',
  'acknowledgement',
  'administration',
  'apprenticeship',
  'architecture',
  'characteristic',
  'communication',
  'concentration',
  'congratulations',
  'consideration',
  'constellation',
  'determination',
  'disappointment',
  'encyclopedia',
  'entertainment',
  'environmental',
  'extraordinary',
  'friendliness',
  'fundamentally',
  'hallucination',
  'identification',
  'implementation',
  'independently',
  'infrastructure',
  'international',
  'investigation',
  'knowledgeable',
  'manufacturing',
  'misunderstanding',
  'neighbourhood',
  'opportunity',
  'organisation',
  'participation',
  'philosophical',
  'photographer',
  'possibilities',
  'pronunciation',
  'recommendation',
  'reconciliation',
  'refrigerator',
  'representation',
  'responsibility',
  'simultaneously',
  'sophisticated',
  'straightforward',
  'transportation',
  'uncomfortable',
  'understanding',
  'unfortunately',
  'vulnerability',
] as const;
