const express = require('express');
const router = express.Router();
const multer = require('multer');
const { importData } = require('../controllers/ImportController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/', verifyToken, isAdmin, upload.single('file'), importData);

module.exports = router;
