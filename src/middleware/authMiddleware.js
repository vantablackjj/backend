const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware xác thực Token (Kiểm tra xem đã đăng nhập chưa)
exports.verifyToken = async (req, res, next) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) return res.status(401).json({ message: 'Bạn chưa đăng nhập! (Thiếu Token)' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);

    if (!user) return res.status(401).json({ message: 'Tài khoản không tồn tại!' });

    // Đính kèm thông tin người dùng vào yêu cầu để dùng ở các bước sau
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn!' });
  }
};

// Middleware kiểm tra quyền ADMIN
exports.isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'ADMIN') {
    next();
  } else {
    return res.status(403).json({ message: 'Bạn không có quyền thực hiện hành động này! (Yêu cầu quyền Admin)' });
  }
};
