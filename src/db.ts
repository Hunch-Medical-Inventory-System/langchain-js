import { createClient, PostgrestSingleResponse } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DataFetchOptions,
  EntityState,
  ExpirableTableMapping,
  DeletableTableMapping,
  TableMapping,
  ExpirableEntityState,
} from "@/types/tables";

// Load environment variables
import dotenv from "dotenv";
dotenv.config();
const supabaseURL = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseURL || !supabaseAnonKey) {
  throw new Error("Supabase URL and Anon Key must be provided");
}

// Class to centralize functions dealing with supabase database
class SupabaseController {
  public client: SupabaseClient;
  private static instance: SupabaseController | null = null;
  public isAuthenticated: boolean = false;
  public userId: string | null = null;

  constructor(apiKey: string, supabaseUrl: string) {
    this.client = createClient(apiKey as string, supabaseUrl as string);
    this.checkSession();
    this.getUserId();
  }

  private checkSession = async () => {
    const {
      data: { session },
    } = await this.client.auth.getSession();
    this.isAuthenticated = !!session; // Set authenticated based on session
  };

  private getUserId = async () => {
    const { data: { user } } = await this.client.auth.getUser();
    this.userId = user?.id ?? null;
  };

  /**
   * Handles the response from a Supabase query.
   *
   * @template T - The type of the data expected in the response.
   * @param {PostgrestSingleResponse<T[]>} response - The response object from Supabase.
   * @returns {Promise<{ data: T[]; count: number }>} A promise that resolves to an object containing the data and count.
   * @throws {Error} If there is an error in the response, it logs the error and throws an exception.
   */
  private handleResponse = async <T>(
    response: PostgrestSingleResponse<T[]>
  ): Promise<{ data: T[]; count: number }> => {
    if (response.error) {
      console.error("Supabase Error:", response.error.message);
      throw new Error(response.error.message);
    }
    return {
      data: response.data || [],
      count: response.count || 0,
    };
  };

  /**
   * Reads rows from a specified table in the database.
   *
   * @template T - The key of the table mapping.
   * @param {T} table - The name of the table to read from.
   * @param {string} seperator - The column name to filter by.
   * @param {Array<any>} seperatorValue - The value to filter the column by.
   * @param {Array<"*" | keyof TableMapping[T]>} [columns=["*"]] - The columns to select from the table. Defaults to all columns.
   * @returns {Promise<Partial<TableMapping[T]>[]>} A promise that resolves to an array of partial rows from the table.
   * @throws Will throw an error if the database query fails.
   */
  public readRowsFromTable = async <T extends keyof TableMapping>(
    table: T,
    seperator: string,
    seperatorValue: Array<any>,
    columns: Array<"*" | keyof TableMapping[T]> = ["*"] as const
  ): Promise<Partial<TableMapping[T]>[]> => {
    try {
      const response = await this.client
        .from(table)
        .select(columns.join(","))
        .eq(seperator, seperatorValue.join(","));
      if (response.error || !response.data) {
        throw new Error(response.error?.message ?? "Unknown error");
      }
      return response.data as unknown as Partial<TableMapping[T]>[];
    } catch (error: any) {
      console.error(`Error fetching row from ${table}:`, error.message);
      return [];
    }
  }

  /**
   * Fetches data from a specified table with pagination and filtering options.
   *
   * @template T - The type of the table name.
   * @param {T} table - The name of the table to fetch data from.
   * @param {DataFetchOptions} options - The options for data fetching, including pagination.
   * @param {(query: any) => any} filters - A function to apply filters to the query.
   * @param {Array<"*" | keyof TableMapping[T]>} [columns=["*"]] - The columns to select.
   * @returns {Promise<{ data: any[]; count: number }>} A promise that resolves to an object containing the fetched data and the total count.
   * @throws Will throw an error if the data fetching fails.
   */
  private fetchTableData = async <T extends keyof TableMapping>(
    table: T,
    options: DataFetchOptions,
    filters: (query: any) => any = () => {},
    columns: Array<"*" | keyof TableMapping[T]> = ["*"] as const
  ): Promise<{ data: any[]; count: number }> => {
    const startRange = options.itemsPerPage * (options.page - 1);
    const endRange = options.itemsPerPage * options.page - 1;

    try {
      const query = this.client
        .from<T, any>(table)
        .select(columns.join(","), { count: "exact" });
      filters(query);
      const response = await query
        .order("id", { ascending: true })
        .range(startRange, endRange);
      return this.handleResponse(response);
    } catch (error: any) {
      console.error(`Error fetching data from ${table}:`, error.message);
      throw error;
    }
  };

  /**
   * Reads expirable data from a specified table and categorizes it into current, deleted, and expired data.
   *
   * @template T - The type of the table, which extends the keys of ExpirableTableMapping.
   * @param {T} table - The name of the table to read data from.
   * @param {DataFetchOptions} options - The options for fetching data.
   * @param {Array<"*" | keyof ExpirableTableMapping[T]>} [columns=["*"]] - The columns to select.
   * @returns {Promise<EntityState<ExpirableTableMapping[T]>>} - A promise that resolves to an EntityState object containing the categorized data.
   *
   * The returned EntityState object has the following structure:
   * - loading: A boolean indicating if the data is still being loaded.
   * - error: An error message if an error occurred, otherwise null.
   * - current: An object containing the current data and its count.
   * - deleted: An object containing the deleted data and its count.
   * - expired: An object containing the expired data and its count.
   *
   * The function fetches data in three categories:
   * - Current data: Records where `user_id` is null and `expiry_date` is greater than or equal to the current date.
   * - Deleted data: Records where `user_id` is not null.
   * - Expired data: Records where `user_id` is null and `expiry_date` is less than the current date.
   *
   * If an error occurs during data fetching, the error message is set in the `error` property of the returned EntityState object.
   * The `loading` property is set to false once the data fetching is complete, regardless of success or failure.
   */
  public readExpirableDataFromTable = async <
    T extends keyof ExpirableTableMapping
  >(
    table: T,
    options: DataFetchOptions,
    columns: Array<"*" | keyof ExpirableTableMapping[T]> = ["*"] as const
  ): Promise<ExpirableEntityState<ExpirableTableMapping[T]>> => {
    const data: ExpirableEntityState<ExpirableTableMapping[T]> = {
      loading: true,
      error: null,
      current: { data: [], count: 0 },
      personal: { data: [], count: 0 },
      expired: { data: [], count: 0 },
    };

    try {
      data.current = await this.fetchTableData(table, options, (query) =>
        query.is("user_id", null).gte("expiry_date", new Date().toISOString()), columns
      );

      data.personal = await this.fetchTableData(table, options, (query) =>
        query.not("user_id", "is", null), columns
      );

      data.expired = await this.fetchTableData(table, options, (query) =>
        query.is("user_id", null).lt("expiry_date", new Date().toISOString()), columns
      );
    } catch (error: any) {
      data.error = error.message || "An error occurred";
    } finally {
      data.loading = false;
      return data;
    }
  };

  /**
   * Reads deletable data from a specified table and returns the data in an EntityState format.
   *
   * @template T - The key of the TableMapping which represents the table name.
   * @param {T} table - The name of the table to read data from.
   * @param {DataFetchOptions} options - The options to use when fetching data from the table.
   * @param {Array<"*" | keyof DeletableTableMapping[T]>} [columns=["*"]] - The columns to select.
   * @returns {Promise<EntityState<DeletableTableMapping[T]>>} - A promise that resolves to an EntityState object containing the fetched data.
   *
   * The returned EntityState object has the following structure:
   * - loading: A boolean indicating if the data is still being loaded.
   * - error: An error message if an error occurred, otherwise null.
   * - current: An object containing the fetched data and its count.
   *
   * If an error occurs during data fetching, the error message is set in the `error` property of the returned EntityState object.
   * The `loading` property is set to false once the data fetching is complete, regardless of success or failure.
   */
  public readDeletableDataFromTable = async <
    T extends keyof DeletableTableMapping
  >(
    table: T,
    options: DataFetchOptions,
    columns: Array<"*" | keyof DeletableTableMapping[T]> = ["*"] as const
  ): Promise<EntityState<DeletableTableMapping[T]>> => {
    const data: EntityState<DeletableTableMapping[T]> = {
      loading: true,
      error: null,
      current: { data: [], count: 0 },
    };

    try {
      data.current = await this.fetchTableData(table, options, () => {}, columns);
    } catch (error: any) {
      data.error = error.message || "An error occurred";
    } finally {
      data.loading = false;
      return data;
    }
  };

  /**
   * Reads data from a specified table and returns the data in an EntityState format.
   *
   * @template T - The key of the TableMapping which represents the table name.
   * @param {T} table - The name of the table to read data from.
   * @param {DataFetchOptions} options - The options to use when fetching data from the table.
   * @param {Array<"*" | keyof TableMapping[T]>} [columns=["*"]] - The columns to select.
   * @returns {Promise<EntityState<TableMapping[T]>>} - A promise that resolves to an EntityState object containing the fetched data.
   *
   * The returned EntityState object has the following structure:
   * - loading: A boolean indicating if the data is still being loaded.
   * - error: An error message if an error occurred, otherwise null.
   * - current: An object containing the fetched data and its count.
   *
   * If an error occurs during data fetching, the error message is set in the `error` property of the returned EntityState object.
   * The `loading` property is set to false once the data fetching is complete, regardless of success or failure.
   */
  public readDataFromTable = async <T extends keyof TableMapping>(
    table: T,
    options: DataFetchOptions,
    columns: Array<"*" | keyof TableMapping[T]> = ["*"] as const,
  ): Promise<EntityState<TableMapping[T]>> => {
    const data: EntityState<TableMapping[T]> = {
      loading: true,
      error: null,
      current: { data: [], count: 0 },
    };

    try {
      data.current = await this.fetchTableData(table, options, () => {}, columns);
    } catch (error: any) {
      data.error = error.message || "An error occurred";
    } finally {
      data.loading = false;
      return data;
    }
  };

  /**
   * Adds a new row to the specified table in the database.
   *
   * @template T - The key of the table in the TableMapping.
   * @param {T} table - The name of the table to insert the data into.
   * @param {Partial<TableMapping[T]>} data - The data to be inserted into the table. It should be a partial object of the table's type.
   * @returns {Promise<number | string>} - A promise that resolves to either the id of the inserted record (number) or an error message (string).
   *
   * @throws {Error} - Throws an error if the insertion fails or no data is returned from the insert operation.
   */
  public AddRowInTable = async <T extends keyof TableMapping>(
    table: T,
    data: Partial<TableMapping[T]>
  ): Promise<number | string> => {
    // Promise will resolve to either number (id) or string (error message)
    try {
      console.log("Data being inserted:", data);
      const response = await this.client.from(table).insert(data).select(); // .select() to fetch inserted data

      console.log("Insert response:", response);

      if (response.error) {
        throw new Error(response.error.message); // If there is an error, throw it
      }

      const insertedRecord = response.data
        ? (response.data[0] as { id: number })
        : null; // Get the first inserted record
      if (!insertedRecord) {
        throw new Error("No data returned from insert operation");
      }

      return insertedRecord.id; // Return the id of the inserted record
    } catch (error: any) {
      console.error(`Error adding data to ${table}:`, error.message);
      return error.message; // Return the error message if the insertion fails
    }
  };

  /**
   * Updates a row in the specified table with the given data.
   *
   * @template T - The type of the table, which must be a key of TableMapping.
   * @param {T} table - The name of the table to update.
   * @param {number} id - The ID of the row to update.
   * @param {Partial<TableMapping[T]>} data - The data to update the row with.
   * @returns {Promise<boolean>} - A promise that resolves to true if the update was successful, or false if there was an error.
   *
   * @throws {Error} - Throws an error if the update operation fails.
   */
  public updateRowInTable = async <T extends keyof TableMapping>(
    table: T,
    id: number,
    data: Partial<TableMapping[T]>
  ): Promise<boolean> => {
    try {
      const response = await this.client.from(table).upsert(data).eq("id", id);

      if (response.error) {
        throw new Error(response.error.message);
      }

      return true;
    } catch (error: any) {
      console.error(`Error updating row in ${table}:`, error.message);
      return false;
    }
  };

  /**
   * Deletes a row in the specified table by marking it as deleted.
   *
   * @template T - The type of the table, which extends the keys of DeletableTableMapping.
   * @param {T} table - The name of the table from which the row should be deleted.
   * @param {number} id - The ID of the row to be deleted.
   * @returns {Promise<boolean>} - A promise that resolves to true if the row was successfully marked as deleted, or false if an error occurred.
   *
   * @throws {Error} - Throws an error if the deletion operation fails.
   */
  public deleteRowInTable = async <T extends keyof DeletableTableMapping>(
    table: T,
    id: number
  ): Promise<boolean> => {
    try {
      const response = await this.client.from(table).upsert({ is_deleted: true }).eq("id", id);

      if (response.error) {
        throw new Error(response.error.message);
      }

      return true;
    } catch (error: any) {
      console.error(`Error deleting row in ${table}:`, error.message);
      return false;
    }
  };

  /**
   * Claims a row in the specified table by updating the `user_id` field with the current user's ID.
   *
   * @template T - The type of the table, which extends the keys of `ExpirableTableMapping`.
   * @param {T} table - The name of the table to update.
   * @param {number} id - The ID of the row to claim.
   * @returns {Promise<boolean>} - A promise that resolves to `true` if the row was successfully claimed, or `false` if an error occurred.
   * @throws {Error} - Throws an error if the upsert operation fails.
   */
  public claimRowInTable = async <T extends keyof ExpirableTableMapping>(
    table: T,
    id: number
  ): Promise<boolean> => {
    try {
      const response = await this.client.from(table).upsert({ user_id: this.userId }).eq("id", id);

      if (response.error) {
        throw new Error(response.error.message);
      }

      return true;
    } catch (error: any) {
      console.error(`Error deleting row in ${table}:`, error.message);
      return false;
    }
  };

  /**
   * Returns a singleton instance of the SupabaseController class.
   *
   * @param {string} supabaseUrl - The URL of the Supabase instance.
   * @param {string} supabaseAnonKey - The anonymous key of the Supabase instance.
   * @returns {SupabaseController} - The singleton instance of the SupabaseController class.
   *
   * The singleton instance is created only once, on the first call to getInstance.
   * Subsequent calls return the same instance.
   */
  public static getInstance(
    supabaseUrl: string,
    supabaseAnonKey: string
  ): SupabaseController {
    if (!SupabaseController.instance) {
      SupabaseController.instance = new SupabaseController(
        supabaseUrl,
        supabaseAnonKey
      );
    }
    return SupabaseController.instance;
  }
}

const supabaseController = SupabaseController.getInstance(
  supabaseURL,
  supabaseAnonKey
);

export default supabaseController;
