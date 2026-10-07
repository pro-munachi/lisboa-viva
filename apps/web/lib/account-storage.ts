import { CITY, getCity } from "./cities";

/** Browser progress belongs to one authenticated account and one city. Legacy
 * shared saves remain untouched and are never silently assigned to an account. */
export function accountStorageKeys(userId: string, cityId = CITY.id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))
    throw new Error("A valid account identity is required for saved progress.");
  const city = getCity(cityId);
  const scope = `roam.${city.id}.account.${userId.toLowerCase()}`;
  return { trips: `${scope}.trips.v1`, pins: `${scope}.pins.v1` };
}
