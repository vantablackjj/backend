const express = require('express');
const router = express.Router();
const controller = require('../controllers/NotificationController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', verifyToken, controller.getAll);
router.put('/:id/read', verifyToken, controller.markAsRead);

module.exports = router;
