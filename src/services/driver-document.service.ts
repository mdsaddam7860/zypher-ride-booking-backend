import { db } from "../db/connection";
import { DriverDocumentsRow, DriverRow } from "../types";
import { NotFoundError } from "../utils/errors";

export interface SubmitDocumentsInput {
  aadharNumber?: string;
  aadharPhotoUrl?: string;
  licenseNumber?: string;
  licenseExpiry?: Date;
  licensePhotoUrl?: string;
  vehicleRegistrationNumber?: string;
  vehicleModel?: string;
  vehiclePhotoUrl?: string;
}

function serializeDocuments(doc: DriverDocumentsRow) {
  return {
    driverId: doc.driver_id,
    aadharNumber: doc.aadhar_number,
    aadharPhotoUrl: doc.aadhar_photo_url,
    licenseNumber: doc.license_number,
    licenseExpiry: doc.license_expiry,
    licensePhotoUrl: doc.license_photo_url,
    vehicleRegistrationNumber: doc.vehicle_registration_number,
    vehicleModel: doc.vehicle_model,
    vehiclePhotoUrl: doc.vehicle_photo_url,
    isVerified: doc.is_verified,
    verifiedAt: doc.verified_at,
    updatedAt: doc.updated_at,
  };
}

/**
 * Recomputes `drivers.is_active` from the current documents row: verified by
 * an owner, all three required fields present, and (if a license expiry is
 * set) it hasn't passed. Call this any time the documents row or the
 * current-date-relevant fields might have changed.
 */
async function recomputeIsActive(driverId: string): Promise<boolean> {
  const doc = await db<DriverDocumentsRow>("driver_documents").where({ driver_id: driverId }).first();

  const hasRequiredFields = Boolean(
    doc?.aadhar_number && doc?.license_number && doc?.vehicle_registration_number
  );
  const licenseNotExpired = !doc?.license_expiry || new Date(doc.license_expiry) >= new Date();
  const isActive = Boolean(doc?.is_verified) && hasRequiredFields && licenseNotExpired;

  await db<DriverRow>("drivers").where({ id: driverId }).update({ is_active: isActive });

  // If a driver's documents lapse (expired license) while they're online,
  // knock them offline rather than leaving a now-invalid driver "available".
  if (!isActive) {
    await db<DriverRow>("drivers")
      .where({ id: driverId, status: "available" })
      .update({ status: "offline" });
  }

  return isActive;
}

export const driverDocumentService = {
  async getByDriverId(driverId: string) {
    const doc = await db<DriverDocumentsRow>("driver_documents").where({ driver_id: driverId }).first();
    return doc ? serializeDocuments(doc) : null;
  },

  /** Driver submits/updates their own documents. Any change resets verification — an owner must re-review. */
  async submit(driverId: string, input: SubmitDocumentsInput) {
    const patch: Record<string, unknown> = {
      driver_id: driverId,
      aadhar_number: input.aadharNumber,
      aadhar_photo_url: input.aadharPhotoUrl,
      license_number: input.licenseNumber,
      license_expiry: input.licenseExpiry,
      license_photo_url: input.licensePhotoUrl,
      vehicle_registration_number: input.vehicleRegistrationNumber,
      vehicle_model: input.vehicleModel,
      vehicle_photo_url: input.vehiclePhotoUrl,
      is_verified: false,
      verified_by: null,
      verified_at: null,
      updated_at: new Date(),
    };
    // Strip undefined keys so a partial update doesn't null out existing fields.
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

    const existing = await db<DriverDocumentsRow>("driver_documents").where({ driver_id: driverId }).first();
    let doc: DriverDocumentsRow;
    if (existing) {
      [doc] = await db<DriverDocumentsRow>("driver_documents")
        .where({ driver_id: driverId })
        .update(patch)
        .returning("*");
    } else {
      [doc] = await db<DriverDocumentsRow>("driver_documents").insert(patch).returning("*");
    }

    await recomputeIsActive(driverId);
    return serializeDocuments(doc);
  },

  /** Owner reviews and verifies (or rejects) a driver's submitted documents. */
  async setVerification(driverId: string, ownerId: string, isVerified: boolean) {
    const existing = await db<DriverDocumentsRow>("driver_documents").where({ driver_id: driverId }).first();
    if (!existing) throw new NotFoundError("Driver has not submitted documents yet");

    const [doc] = await db<DriverDocumentsRow>("driver_documents")
      .where({ driver_id: driverId })
      .update({
        is_verified: isVerified,
        verified_by: isVerified ? ownerId : null,
        verified_at: isVerified ? new Date() : null,
        updated_at: new Date(),
      })
      .returning("*");

    const isActive = await recomputeIsActive(driverId);
    return { ...serializeDocuments(doc), driverIsActive: isActive };
  },
};