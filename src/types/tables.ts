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
  id: number;
  supply_id?: number;
  supplies?: Partial<SuppliesData>;
  quantity: number;
  expiry_date?: string;
  created_at: string;
} & (
  | { supply_id: number; supplies?: never }
  | { supply_id?: never; supplies: Partial<SuppliesData> }
);
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
  crew_member_id?: number;
  crew?: Partial<CrewData>;
} & (
  | { crew_member_id: number; crew?: never }
  | { crew_member_id?: never; crew: Partial<CrewData> }
);
