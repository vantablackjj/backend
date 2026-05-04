const express = require('express');
const router = express.Router();
const backupController = require('../controllers/BackupController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

// Chỉ ADMIN mới được quyền quản lý backup
router.get('/backups', verifyToken, isAdmin, backupController.listBackups);
router.post('/backups', verifyToken, isAdmin, backupController.createBackup);
router.post('/backups/restore', verifyToken, isAdmin, backupController.restoreBackup);
router.get('/backups/download', verifyToken, isAdmin, backupController.getDownloadUrl);

module.exports = router;
