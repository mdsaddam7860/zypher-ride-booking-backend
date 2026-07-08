import { config } from "../config";
import { LatLng } from "../types";
import { haversineDistanceMeters } from "../utils/geoutils";

export interface RouteEstimate {
  distanceMeters: number;
  durationSeconds: number;
}

const AVERAGE_CITY_SPEED_METERS_PER_SECOND = 8.3; // ~30 km/h, used only for the offline fallback

/**
 * Wraps whatever routing provider is configured (Google Directions API here).
 * If no API key is configured, falls back to a haversine-distance estimate so
 * the rest of the app is fully runnable in local/dev environments.
 */
export async function getRouteEstimate(pickup: LatLng, dropoff: LatLng): Promise<RouteEstimate> {
  if (!config.maps.googleApiKey) {
    const distanceMeters = Math.round(haversineDistanceMeters(pickup, dropoff));
    const durationSeconds = Math.round(distanceMeters / AVERAGE_CITY_SPEED_METERS_PER_SECOND);
    return { distanceMeters, durationSeconds };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${pickup.lat},${pickup.lng}`);
  url.searchParams.set("destination", `${dropoff.lat},${dropoff.lng}`);
  url.searchParams.set("key", config.maps.googleApiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Directions API request failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    status: string;
    routes: Array<{ legs: Array<{ distance: { value: number }; duration: { value: number } }> }>;
  };

  if (data.status !== "OK" || data.routes.length === 0) {
    throw new Error(`Directions API returned no route (status: ${data.status})`);
  }

  const leg = data.routes[0].legs[0];
  return { distanceMeters: leg.distance.value, durationSeconds: leg.duration.value };
}
