export type DataFetchOptions = {
  itemsPerPage: number;
  page: number;
  keywords: string;
};

export type ExpirableTableMapping = {
  inventory: InventoryData;
};
export type DeletableTableMapping = {
  supplies: SuppliesData;
};
export type TableMapping = {
  crew: CrewData;
  logs: LogsData;
} & ExpirableTableMapping &
  DeletableTableMapping;

export type EntityState<T> = {
  loading: boolean;
  error: string | null;
  current: { data: T[]; count: number };
};
export type ExpirableEntityState<T> = EntityState<T> & {
  personal: { data: T[]; count: number };
  expired: { data: T[]; count: number };
};

export type InventoryData = {
  supply_id: number;
  quantity: number;
  expiry_date?: string;
  id: number;
  created_at: string;
  user_id?: number;
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
export type CrewData = {
  id: number;
  first_name: string;
  last_name: string;
  created_at: string;
};
export type LogsData = {
  id: number;
  created_at: string;
  crew_member_id: number;
};
