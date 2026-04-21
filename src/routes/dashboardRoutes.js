const express = require('express');
const router = express.Router();
const controller = require('../controllers/DashboardController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

router.get('/stats', verifyToken, isAdmin, controller.getStats);

module.exports = router;
