const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');


// /api/auth/register (Dùng để tạo mới NV, CHỉ ADMIN mới được tạo)
router.post('/register', verifyToken, isAdmin, authController.register);

// /api/auth/login (CÔNG KHAI)
router.post('/login', authController.login);

// Employee Management (CRUD)
router.get('/users', verifyToken, authController.getAll); // Tất cả NV đều xem được danh sách tên NV
router.put('/users/:id', verifyToken, isAdmin, authController.update);
router.delete('/users/:id', verifyToken, isAdmin, authController.delete);


module.exports = router;

