import { Router } from 'express';
import { globalSearchController } from '../controllers/search.controller';
import { requireAuth } from '../middlewares/auth.middleware'; 

const router = Router();

// Endpoint: GET /api/search?q=tu_khoa
router.get('/', requireAuth, globalSearchController);

export default router;