const sequelize = require('../src/config/database');
const User = require('../src/models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createAdmin() {
  try {
    const hashedPassword = await bcrypt.hash('admin', 10);
    await User.create({
      username: 'admin',
      password: hashedPassword,
      full_name: 'Administrator',
      role: 'ADMIN',
      warehouse_id: null
    });
    console.log('✅ Đã tạo tài khoản Admin mặc định (admin/admin)');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khi tạo admin:', error);
    process.exit(1);
  }
}

createAdmin();
