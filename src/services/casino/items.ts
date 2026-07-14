export interface ShopItem {
  id: string;
  name: string;
  description: string;
  priceDollars: number;
  /** Applied to net winnings when equipped, e.g. 1.1 = +10%. */
  payoutMultiplier: number;
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'tinfoil_hat',
    name: 'Tinfoil Hat',
    description: 'Blocks casino mind-control rays. +5% winnings.',
    priceDollars: 25,
    payoutMultiplier: 1.05,
  },
  {
    id: 'rabbits_foot',
    name: "Lucky Rabbit's Foot",
    description: 'Definitely not haunted. +10% winnings.',
    priceDollars: 50,
    payoutMultiplier: 1.1,
  },
  {
    id: 'loaded_dice',
    name: 'Suspiciously Loaded Dice',
    description: "The pit boss hasn't noticed yet. +12% winnings.",
    priceDollars: 75,
    payoutMultiplier: 1.12,
  },
  {
    id: 'cursed_monkey_paw',
    name: 'Cursed Monkey Paw',
    description: 'Grants wishes, technically. +15% winnings.',
    priceDollars: 100,
    payoutMultiplier: 1.15,
  },
  {
    id: 'golden_horseshoe',
    name: 'Golden Horseshoe',
    description: 'Extremely lucky, mildly uncomfortable to hold. +20% winnings.',
    priceDollars: 150,
    payoutMultiplier: 1.2,
  },
  {
    id: 'four_leaf_toupee',
    name: 'Four-Leaf Clover Toupee',
    description: 'Grass-fed luck, stylishly balding. +25% winnings.',
    priceDollars: 250,
    payoutMultiplier: 1.25,
  },
];

export function getShopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((item) => item.id === id);
}
