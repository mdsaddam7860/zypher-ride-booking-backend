import fs from "fs";
import admin from "firebase-admin";
import { config } from "../config";
import { logger } from "../utils/logger";

/**
 * Firebase Cloud Messaging via the HTTP v1 API (Firebase Admin SDK).
 *
 * Replaces the deprecated legacy `Authorization: key=<FCM_SERVER_KEY>` REST
 * call to https://fcm.googleapis.com/fcm/send. The Admin SDK handles OAuth2
 * access tokens (via the service account's private key) and the v1 endpoint
 * (https://fcm.googleapis.com/v1/projects/<project-id>/messages:send) under
 * the hood — there's no server key to manage or rotate.
 */

let app: admin.app.App | null = null;
let initAttempted = false;

function loadServiceAccount(): admin.ServiceAccount | null {
  const { serviceAccountJson, serviceAccountPath } = config.firebase;

  if (serviceAccountPath) {
    const raw = fs.readFileSync(serviceAccountPath, "utf-8");
    return JSON.parse(raw) as admin.ServiceAccount;
  }

  if (serviceAccountJson) {
    // Accept either raw JSON or base64-encoded JSON.
    const trimmed = serviceAccountJson.trim();
    const raw = trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf-8");
    return JSON.parse(raw) as admin.ServiceAccount;
  }

  return null;
}

function getApp(): admin.app.App | null {
  if (app || initAttempted) return app;
  initAttempted = true;

  try {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      logger.warn("FCM not configured: no FIREBASE_SERVICE_ACCOUNT_JSON/PATH set — push notifications disabled");
      return null;
    }

    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: config.firebase.projectId || undefined,
    });

    logger.info("Firebase Admin SDK initialized for FCM (HTTP v1)");
    return app;
  } catch (err) {
    logger.error("Failed to initialize Firebase Admin SDK", { error: (err as Error).message });
    return null;
  }
}

export interface PushNotificationOptions {
  deviceToken: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends a single push notification via FCM HTTP v1.
 *
 * v1 request shape differs from the legacy API:
 *  - No `to` field — the token goes in `message.token`.
 *  - `data` payload values MUST all be strings (v1 is stricter than legacy).
 *  - Platform-specific options (sound, priority, etc.) move under
 *    `message.android` / `message.apns` / `message.webpush` instead of
 *    living at the top level.
 */
async function sendPushNotification({
  deviceToken,
  title,
  body,
  data,
}: PushNotificationOptions): Promise<PushResult> {
  const firebaseApp = getApp();

  if (!firebaseApp) {
    logger.debug("[fcm:stub] would send push notification", { deviceToken, title, body, data });
    return { success: false, error: "FCM not configured" };
  }

  const message: admin.messaging.Message = {
    token: deviceToken,
    notification: { title, body },
    data: data ?? {},
    android: {
      priority: "high",
      notification: { sound: "default" },
    },
    apns: {
      payload: {
        aps: { sound: "default" },
      },
    },
  };

  try {
    const messageId = await admin.messaging(firebaseApp).send(message);
    logger.info("Push notification sent", { deviceToken, messageId });
    return { success: true, messageId };
  } catch (err) {
    const error = err as admin.FirebaseError;
    logger.error("Push notification failed", {
      deviceToken,
      code: error.code,
      message: error.message,
    });
    return { success: false, error: error.message };
  }
}

/**
 * Sends the same notification to multiple device tokens in one batch
 * (v1's equivalent of the legacy "registration_ids" multicast — the Admin
 * SDK calls this a "multicast message" under sendEachForMulticast).
 */
async function sendMulticastPushNotification(
  deviceTokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<admin.messaging.BatchResponse | null> {
  const firebaseApp = getApp();
  if (!firebaseApp || deviceTokens.length === 0) {
    logger.debug("[fcm:stub] would send multicast push notification", { deviceTokens, title, body, data });
    return null;
  }

  try {
    const response = await admin.messaging(firebaseApp).sendEachForMulticast({
      tokens: deviceTokens,
      notification: { title, body },
      data: data ?? {},
    });
    logger.info("Multicast push notification sent", {
      successCount: response.successCount,
      failureCount: response.failureCount,
    });
    return response;
  } catch (err) {
    logger.error("Multicast push notification failed", { error: (err as Error).message });
    return null;
  }
}

export const fcmService = {
  sendPushNotification,
  sendMulticastPushNotification,
};
