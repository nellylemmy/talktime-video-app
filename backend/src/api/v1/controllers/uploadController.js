import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Uploads directory — relative to backend root
const UPLOADS_DIR = path.join(__dirname, '../../../../uploads/students');

// Ensure directory exists
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer config: memoryStorage, no file-size cap — sharp handles compression.
// Original buffer lives only in RAM and is GC'd after sharp writes the .webp.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'), false);
    }
};

export const upload = multer({
    storage,
    fileFilter
});

/**
 * Generate a unique filename: {timestamp}-{random}.webp
 */
function generateFilename() {
    const timestamp = Date.now();
    const random = crypto.randomBytes(6).toString('hex');
    return `${timestamp}-${random}.webp`;
}

/**
 * Process a single image buffer through sharp → webp
 * @param {Buffer} buffer - Raw image buffer from multer
 * @param {Object} options - { maxWidth, maxHeight, quality }
 * @returns {Promise<string>} - URL path like /uploads/students/xxx.webp
 */
async function processImage(buffer, { maxWidth, maxHeight, quality }) {
    const filename = generateFilename();
    const outputPath = path.join(UPLOADS_DIR, filename);

    await sharp(buffer)
        .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toFile(outputPath);

    return `/uploads/students/${filename}`;
}

/**
 * Safely delete a file at a /uploads/students/ path.
 * Validates the path is within UPLOADS_DIR to prevent path traversal.
 */
function deleteOldImage(urlPath) {
    if (!urlPath || typeof urlPath !== 'string') return;
    if (!urlPath.startsWith('/uploads/students/')) return;

    const filename = path.basename(urlPath);
    // Only allow .webp files with expected naming pattern
    if (!/^\d+-[a-f0-9]+\.webp$/.test(filename)) return;

    const filePath = path.join(UPLOADS_DIR, filename);
    // Final safety: resolved path must be inside UPLOADS_DIR
    if (!path.resolve(filePath).startsWith(path.resolve(UPLOADS_DIR))) return;

    fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
            console.error('Failed to delete old image:', filePath, err.message);
        }
    });
}

/**
 * POST /api/v1/admin/upload/student-images
 * Accepts: profilePicture (single), gallery (up to 5)
 * Optional text fields: oldProfilePicture, oldGallery (comma-separated URLs to delete)
 * Returns: { profilePicture: '/uploads/...', gallery: ['/uploads/...'] }
 */
export async function uploadStudentImages(req, res) {
    try {
        const result = {};

        // Process profile picture (400x400, quality 80)
        if (req.files && req.files.profilePicture && req.files.profilePicture.length > 0) {
            const file = req.files.profilePicture[0];
            result.profilePicture = await processImage(file.buffer, {
                maxWidth: 400,
                maxHeight: 400,
                quality: 80
            });

            // Delete old profile picture after new one is written successfully
            if (req.body && req.body.oldProfilePicture) {
                deleteOldImage(req.body.oldProfilePicture);
            }
        }

        // Process gallery images (1200x900, quality 80)
        if (req.files && req.files.gallery && req.files.gallery.length > 0) {
            const galleryPaths = [];
            for (const file of req.files.gallery) {
                const imgPath = await processImage(file.buffer, {
                    maxWidth: 1200,
                    maxHeight: 900,
                    quality: 80
                });
                galleryPaths.push(imgPath);
            }
            result.gallery = galleryPaths;

            // Delete old gallery images after new ones are written successfully
            if (req.body && req.body.oldGallery) {
                const oldUrls = req.body.oldGallery.split(',').map(s => s.trim()).filter(Boolean);
                oldUrls.forEach(deleteOldImage);
            }
        }

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Image upload error:', error);
        res.status(500).json({ error: 'Failed to process uploaded images' });
    }
}
