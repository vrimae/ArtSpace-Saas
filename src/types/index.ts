export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  date: string; // ISO string
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  date: string; // ISO string
  unit?: string;
}

export type ProductCategory = string;

export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  category: ProductCategory;
}

export interface ExtraItem {
  inventoryId: string;
  name: string;
  unit: string;
  quantity: number;
  pricePerUnit: number;
}

export interface ActivityLog {
  id: string;
  action: string;
  description: string;
  actor_name?: string;
  reason?: string;
  created_at: string;
}
