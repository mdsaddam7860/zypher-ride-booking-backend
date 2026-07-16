import multer from "multer";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB per image

const storage = multer.memoryStorage();

function imageFileFilter(_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) {
    if (!file.mimetype.startsWith("image/")) {
        cb(new Error("Only image files are allowed"));
        return;
    }
    cb(null, true);
}

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: imageFileFilter,
});

/**
 * Accepts up to one file each for aadharPhoto/licensePhoto/vehiclePhoto,
 * alongside the regular text fields (aadharNumber, licenseNumber, etc.) in
 * the same multipart/form-data request. Files land in req.files (buffers,
 * not written to disk); text fields land in req.body as usual.
 */
export const uploadDriverDocumentPhotos = upload.fields([
    { name: "aadharPhoto", maxCount: 1 },
    { name: "licensePhoto", maxCount: 1 },
    { name: "vehiclePhoto", maxCount: 1 },
]);

/**
 * Single-file upload for a driver's profile photo (used on
 * PATCH /api/drivers/me — accepts either this file field or a plain
 * `profilePhotoUrl` JSON/form string, same fallback pattern as the
 * document photos above).
 */
export const uploadProfilePhoto = upload.single("profilePhoto");