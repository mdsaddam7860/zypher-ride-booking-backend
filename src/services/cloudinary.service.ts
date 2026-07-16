import { v2 as cloudinary } from "cloudinary";
import { config } from "../config";
import { BadRequestError } from "../utils/errors";
import { logger } from "../utils/logger";

let configured = false;
function ensureConfigured(): void {
    if (configured) return;
    if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
        throw new Error(
            "Cloudinary is not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET"
        );
    }
    cloudinary.config({
        cloud_name: config.cloudinary.cloudName,
        api_key: config.cloudinary.apiKey,
        api_secret: config.cloudinary.apiSecret,
    });
    configured = true;
}

/**
 * Uploads an in-memory image buffer (from multer's memoryStorage) to
 * Cloudinary and returns the resulting HTTPS URL. Used for driver document
 * photos (Aadhaar, license, vehicle) — nothing is ever written to local
 * disk, so this works the same in a container/serverless environment.
 */
export async function uploadImageBuffer(buffer: Buffer, folder: string): Promise<string> {
    ensureConfigured();

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: "image" },
            (error, result) => {
                if (error || !result) {
                    logger.error("Cloudinary upload failed", { error: error?.message });
                    reject(new BadRequestError("Image upload failed"));
                    return;
                }
                resolve(result.secure_url);
            }
        );
        stream.end(buffer);
    });
}