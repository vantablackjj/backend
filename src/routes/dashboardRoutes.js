const express = require('express');
const router = express.Router();
const controller = require('../controllers/DashboardController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/stats', verifyToken, controller.getStats);

module.exports = router;
