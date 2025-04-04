import type { User } from "@supabase/supabase-js";

export type DataFetchOptions = {
  itemsPerPage: number;
  page: number;
  keywords: string;
};

export type PersonalTableMapping = {
  logs: LogsData;
};
export type ExpirableTableMapping = {
  inventory: InventoryData;
};
export type DeletableTableMapping = {
  supplies: SuppliesData;
  crew: CrewData;
} & ExpirableTableMapping &
  PersonalTableMapping;

export type EntityState<T> = {
  loading: boolean;
  error: string | null;
  active: { data: T[]; count: number };
};
export type ExpirableEntityState<T> = EntityState<T> & {
  expired: { data: T[]; count: number };
};
export type PersonalEntityState<T> = EntityState<T> & {
  personal: { data: T[]; count: number };
};

export type SuppliesData = {
  id: number;
  type: string;
  name: string;
  strength_or_volume: string;
  route_of_use: string;
  quantity_in_pack: number;
  possible_side_effects: string;
  location: string;
  created_at: string;
  is_deleted: boolean;
};
export type InventoryData = {
  id: number;
  created_at: string;
  quantity: number;
  expiry_date?: string;
  supply_id?: SuppliesData["id"];
  supplies?: Partial<SuppliesData>;
} & (
  | { supply_id: SuppliesData["id"]; supplies?: never }
  | { supply_id?: never; supplies: Partial<SuppliesData> }
);
export type CrewData = {
  id: User["id"];
  created_at: string;
  first_name: string;
  last_name: string;
};
export type LogsData = {
  id: number;
  created_at: string;
  inventory_id?: InventoryData["id"];
  inventory?: Partial<InventoryData>;
  user_id?: CrewData["id"];
  crew?: Partial<CrewData>;
  quantity: number;
  is_deleted: boolean;
} & (
  | { inventory_id: InventoryData["id"]; inventory?: never }
  | { inventory_id?: never; inventory: Partial<InventoryData> }
) &
  (
    | { user_id: CrewData["id"]; crew?: never }
    | { user_id?: never; crew: Partial<CrewData> }
  );
