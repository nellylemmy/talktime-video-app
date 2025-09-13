/**
 * Volunteer Credit System Routes
 * API routes for volunteer profile management, credit tracking, and certificate generation
 */
import express from 'express';
import multer from 'multer';
import { createJWTMiddleware } from '../../../utils/jwt.js';

// Create volunteer-specific JWT middleware
const volunteerJWTMiddleware = createJWTMiddleware(['volunteer']);

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

import { 
    getVolunteerProfile, 
    getProfileCompletion, 
    updateVolunteerProfile, 
    getVolunteerCredits, 
    getVolunteerPerformance,
    uploadProfileImage,
    serveProfileImage,
    deleteProfileImage,
    generateCertificatePreview,
    downloadCertificate
} from '../controllers/volunteerCreditController.js';

const router = express.Router();

// All routes require volunteer authentication
router.use(volunteerJWTMiddleware);

// Volunteer profile management
router.get('/profile', getVolunteerProfile);
router.put('/profile', updateVolunteerProfile);

// Profile image upload and deletion
router.post('/profile/image', upload.single('profileImage'), uploadProfileImage);
router.delete('/profile/image', deleteProfileImage);

// Serve profile images
router.get('/profile/image/:filename', serveProfileImage);

// Profile completion
router.get('/profile/completion', getProfileCompletion);

// Credit tracking
router.get('/credits', getVolunteerCredits);

// Performance metrics
router.get('/performance', getVolunteerPerformance);

// Certificate generation
router.get('/certificate/preview', generateCertificatePreview);
router.get('/certificate/download', downloadCertificate);

export default router;
