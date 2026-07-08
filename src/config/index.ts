import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Guards against .env.example placeholder text being copied verbatim into a
// real .env and silently breaking the mapping service (see GOOGLE_MAPS_API_KEY).
function isRealApiKey(value: string | undefined): boolean {
  if (!value) return false;
  const placeholderPattern = /your[-_]?.*key/i;
  return !placeholderPattern.test(value);
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "3000", 10),

  database: {
    url: required("DATABASE_URL"),
  },

  jwt: {
    secret: required("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  },

  maps: {
    googleApiKey: isRealApiKey(process.env.GOOGLE_MAPS_API_KEY) ? process.env.GOOGLE_MAPS_API_KEY! : "",
  },

  fare: {
    currency: process.env.FARE_CURRENCY ?? "INR",
    estimateTtlMinutes: parseInt(process.env.FARE_ESTIMATE_TTL_MINUTES ?? "5", 10),
    // Long-distance rides (>= this) are the app's focus, but shorter trips
    // are still accepted — this only flags `is_long_distance`, it never blocks booking.
    longDistanceThresholdMeters: parseInt(
      process.env.LONG_DISTANCE_THRESHOLD_METERS ?? "20000",
      10
    ),
    // Per-vehicle-type pricing, in INR.
    vehiclePricing: {
      "4_seater": {
        baseFee: parseFloat(process.env.FARE_4SEATER_BASE_FEE ?? "80"),
        perKm: parseFloat(process.env.FARE_4SEATER_PER_KM ?? "14"),
        perMinute: parseFloat(process.env.FARE_4SEATER_PER_MINUTE ?? "1.5"),
      },
      "7_seater": {
        baseFee: parseFloat(process.env.FARE_7SEATER_BASE_FEE ?? "120"),
        perKm: parseFloat(process.env.FARE_7SEATER_PER_KM ?? "19"),
        perMinute: parseFloat(process.env.FARE_7SEATER_PER_MINUTE ?? "2"),
      },
    },
  },

  cancellation: {
    // Refund tiers, keyed by hours-before-scheduled-start.
    fullRefundHours: 24,
    partialRefundHours: 12,
    partialRefundPercent: 75,
    lateRefundPercent: 50,
  },

  // Firebase Cloud Messaging — HTTP v1 API (via firebase-admin), not the
  // deprecated legacy Server Key API.
  //
  // Provide credentials ONE of two ways:
  //  1. FIREBASE_SERVICE_ACCOUNT_JSON — the full service account JSON, either
  //     as a raw JSON string or base64-encoded (handy for platforms where
  //     multi-line env vars are awkward, e.g. most PaaS dashboards).
  //  2. FIREBASE_SERVICE_ACCOUNT_PATH — a path to the service account JSON
  //     file on disk (handy for local dev).
  // If neither is set, the notification service falls back to logging only.
  firebase: {
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "",
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "",
    projectId: process.env.FIREBASE_PROJECT_ID ?? "",
  },

  betterStack: {
    sourceToken: process.env.BETTERSTACK_SOURCE_TOKEN ?? process.env.LOGTAIL_SOURCE_TOKEN ?? "",
    // Regional/self-hosted ingesting host, e.g. "https://in.logs.betterstack.com".
    // Leave blank to use Logtail's default endpoint.
    ingestingHost: process.env.BETTERSTACK_INGESTING_HOST ?? "",
  },
} as const;
