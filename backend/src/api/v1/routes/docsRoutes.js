/**
 * API Documentation Routes
 * Serves Swagger UI and API documentation
 */
import express from 'express';
const router = express.Router();
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from '../docs/swagger.json' assert { type: 'json' };

// Serve Swagger UI
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(swaggerDocument, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "TalkTime API Documentation"
}));

export default router;
