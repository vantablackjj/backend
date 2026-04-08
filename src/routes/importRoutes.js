const express = require('express');
const router = express.Router();
const multer = require('multer');
const { importData, downloadTemplate } = require('../controllers/ImportController');
const { verifyToken } = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/', verifyToken, upload.single('file'), importData);
router.get('/template', verifyToken, downloadTemplate);

module.exports = router;
