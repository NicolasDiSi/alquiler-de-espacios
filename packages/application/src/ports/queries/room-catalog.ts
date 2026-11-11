/** A room as every signed in user sees it. Rooms are shared and read only for companies. */
export type RoomView = {
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
};

export interface RoomCatalog {
  /** Every room, by name. Three rooms in v1, so no pagination. */
  listRooms(): Promise<readonly RoomView[]>;
}
