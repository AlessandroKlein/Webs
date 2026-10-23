import { create } from 'zustand';

export interface CheckoutLine {
  id: string;
  title: string;
  price: number; // centavos
  quantity: number;
}

export interface ShippingAddress {
  street: string;
  number: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

/**
 * Intención de compra de la tienda (carrito + envío) que se entrega a la página
 * de checkout para completar el pago. Se escribe desde StorePage antes de
 * navegar y se lee (y limpia) en CheckoutPage.
 */
export interface StoreCheckoutIntent {
  lines: CheckoutLine[];
  subtotal: number; // centavos
  shippingAddress: ShippingAddress;
  shippingMethod: string | null;
  shippingCost: number; // centavos
}

interface CheckoutState {
  store: StoreCheckoutIntent | null;
  setStore: (intent: StoreCheckoutIntent) => void;
  clearStore: () => void;
}

export const useCheckoutStore = create<CheckoutState>((set) => ({
  store: null,
  setStore: (store) => set({ store }),
  clearStore: () => set({ store: null }),
}));
