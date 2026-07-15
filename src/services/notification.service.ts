import { db } from "../db/connection";
import { fcmService } from "./fcm.service";
import { logger } from "../utils/logger";
import { NotificationRow, Role } from "../types";

/**
 * Thin notification layer. The rest of the app (owner assignment, driver
 * accept/deny, status changes, etc.) calls into this with a stable
 * interface, without being coupled to a specific push provider.
 *
 * Every notification is persisted to `notifications` (basic in-app alert
 * list) and best-effort pushed via FCM when a device token is available;
 * otherwise it falls back to a structured log line so call sites keep
 * working even before device-token storage exists.
 */
async function send(
  recipientId: string,
  recipientRole: Role,
  title: string,
  body: string,
  rideId?: string,
  deviceToken?: string
): Promise<void> {
  await db<NotificationRow>("notifications").insert({
    recipient_id: recipientId,
    recipient_role: recipientRole,
    ride_id: rideId ?? null,
    title,
    body,
  });

  if (!deviceToken) {
    logger.info("[notification:stub]", { recipientId, title, body });
    return;
  }

  const result = await fcmService.sendPushNotification({ deviceToken, title, body });
  if (!result.success) {
    logger.warn("Notification fell back to stub logging after FCM failure", {
      recipientId,
      title,
      error: result.error,
    });
  }
}

export const notificationService = {
  notifyOwnerNewPendingRide: (rideId: string) =>
    send("owner-dashboard", "owner", "New ride request", `Ride ${rideId} needs a driver assigned.`, rideId),

  notifyDriverAssigned: (driverId: string, rideId: string) =>
    send(
      driverId,
      "driver",
      "New ride assigned",
      `You've been assigned ride ${rideId}. Please accept or deny.`,
      rideId
    ),

  notifyOwnerDriverResponded: (rideId: string, accepted: boolean) =>
    send(
      "owner-dashboard",
      "owner",
      accepted ? "Driver accepted" : "Driver denied",
      `Ride ${rideId}: driver ${accepted ? "accepted" : "denied"} the assignment.`,
      rideId
    ),

  // Basic status-change alert — fired on every ride status transition.
  notifyRiderRideUpdated: (riderId: string, rideId: string, status: string) =>
    send(riderId, "rider", "Ride update", `Your ride ${rideId} is now ${status}.`, rideId),

  notifyRiderDriverArrived: (riderId: string, rideId: string) =>
    send(
      riderId,
      "rider",
      "Driver has arrived",
      `Your driver has arrived at the pickup point for ride ${rideId}.`,
      rideId
    ),

  notifyStatusChange: (recipientId: string, recipientRole: Role, rideId: string, status: string) =>
    send(recipientId, recipientRole, "Ride status changed", `Ride ${rideId} is now ${status}.`, rideId),

  notifyDriverRideOffer: (driverId: string, rideId: string) =>
    send(
      driverId,
      "driver",
      "New ride offer",
      `A nearby ride ${rideId} is available. Accept or decline.`,
      rideId
    ),

  notifyOwnerAutoDispatchExhausted: (rideId: string) =>
    send(
      "owner-dashboard",
      "owner",
      "Auto-dispatch found no driver",
      `Ride ${rideId} couldn't be auto-assigned — needs manual assignment.`,
      rideId
    ),

  notifyDriverDocumentsApproved: (driverId: string) =>
    send(
      driverId,
      "driver",
      "Documents approved",
      "Your documents have been verified. You can now go online and accept rides."
    ),

  notifyDriverDocumentsRejected: (driverId: string, reason: string) =>
    send(
      driverId,
      "driver",
      "Documents rejected — resubmission required",
      reason
        ? `Your documents were rejected: ${reason}. Please correct and resubmit.`
        : "Your documents were rejected. Please review and resubmit."
    ),
};