import type { EquipmentSlotName } from '../equipment/equipment-model.ts';

export interface WalletEntity {
  schemaVersion: 2;
  id: string; // walletId
  accountId: string;
  gold: string; // resourceWire
  points: string; // resourceWire
  version: number;
  createdAt: number;
  updatedAt: number;
}

export type ShopCurrency = 'gold' | 'points';

export interface ShopOffer {
  offerId: string;
  itemKind: 'potion' | 'equipment';
  templateId: string;
  itemLevel?: number;
  slotKind?: EquipmentSlotName;
  quality: 'white' | 'green' | 'blue' | 'purple' | 'orange';
  priceCurrency: ShopCurrency;
  unitPrice: number;
  maxQuantity: number;
  quoteRef: string;
}

export interface ShopCatalog {
  offers: Record<string, ShopOffer>;
  quoteRef: string;
}

export const DEFAULT_SHOP_CATALOG: ShopCatalog = {
  quoteRef: 'quote_shop_v1',
  offers: {
    offer_hp_potion_minor: {
      offerId: 'offer_hp_potion_minor',
      itemKind: 'potion',
      templateId: 'potion_hp_minor',
      quality: 'white',
      priceCurrency: 'gold',
      unitPrice: 50,
      maxQuantity: 20,
      quoteRef: 'quote_shop_v1',
    },
    offer_mp_potion_minor: {
      offerId: 'offer_mp_potion_minor',
      itemKind: 'potion',
      templateId: 'potion_mp_minor',
      quality: 'white',
      priceCurrency: 'gold',
      unitPrice: 50,
      maxQuantity: 20,
      quoteRef: 'quote_shop_v1',
    },
    offer_starter_sword: {
      offerId: 'offer_starter_sword',
      itemKind: 'equipment',
      templateId: 'weapon_starter_sword',
      slotKind: 'weapon',
      itemLevel: 1,
      quality: 'white',
      priceCurrency: 'gold',
      unitPrice: 100,
      maxQuantity: 20,
      quoteRef: 'quote_shop_v1',
    },
    offer_starter_armor: {
      offerId: 'offer_starter_armor',
      itemKind: 'equipment',
      templateId: 'armor_starter_chest',
      slotKind: 'chest',
      itemLevel: 1,
      quality: 'white',
      priceCurrency: 'gold',
      unitPrice: 100,
      maxQuantity: 20,
      quoteRef: 'quote_shop_v1',
    },
    offer_points_scroll: {
      offerId: 'offer_points_scroll',
      itemKind: 'potion',
      templateId: 'scroll_exp_boost',
      quality: 'purple',
      priceCurrency: 'points',
      unitPrice: 10,
      maxQuantity: 20,
      quoteRef: 'quote_shop_v1',
    },
  },
};
