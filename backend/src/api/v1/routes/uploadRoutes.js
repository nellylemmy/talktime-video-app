import express from 'express';
import { createJWTMiddleware } from '../../../utils/jwt.js';
import { upload, uploadStudentImages } from '../controllers/uploadController.js';

const router = express.Router();

const adminOnlyJWT = createJWTMiddleware(['admin']);

// POST /api/v1/admin/upload/student-images
// Multer fields: profilePicture (1), gallery (up to 5)
router.post(
    '/student-images',
    adminOnlyJWT,
    (req, res, next) => {
        upload.fields([
            { name: 'profilePicture', maxCount: 1 },
            { name: 'gallery', maxCount: 5 }
        ])(req, res, (err) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_COUNT') {
                    return res.status(400).json({ error: 'Too many files. Maximum 5 gallery images.' });
                }
                return res.status(400).json({ error: err.message || 'Upload failed' });
            }
            next();
        });
    },
    uploadStudentImages
);

export default router;
