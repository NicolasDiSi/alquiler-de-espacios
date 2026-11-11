declare const brand: unique symbol;

/** Nominal type: a `RoomId` is a string that cannot be mixed up with a `TenantId`. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** A client company. Every tenant-owned row belongs to exactly one. */
export type TenantId = Brand<string, "TenantId">;
