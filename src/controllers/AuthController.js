const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
  try {
    const { 
      username, password, role, warehouse_id, full_name, phone, 
      can_manage_debt, can_delete, can_manage_money, can_manage_spare_parts, 
      can_manage_master_data, can_manage_sales,
      can_manage_expenses, expense_warehouses
    } = req.body;
    
    // Kiểm tra xem đã tồn tại chưa
    const existing = await User.findOne({ where: { username } });
    if (existing) return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại!' });

    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await User.create({
      username,
      password: hashedPassword,
      role,
      warehouse_id,
      full_name,
      phone,
      can_manage_debt,
      can_delete,
      can_manage_money,
      can_manage_spare_parts,
      can_manage_master_data,
      can_manage_sales,
      can_manage_expenses,
      expense_warehouses
    });

    res.status(201).json({ message: 'Tạo tài khoản thành công!', user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Tìm trong DB
    const user = await User.findOne({ where: { username } });
    if (!user) return res.status(401).json({ message: 'Sai tên đăng nhập hoặc mật khẩu!' });

    // So sánh mật khẩu (Bcrypt tự giải mã và so sánh)
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Sai tên đăng nhập hoặc mật khẩu!' });

    // Tạo mã hóa chìa khóa (Token) trong 24h
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        can_manage_debt: user.can_manage_debt,
        can_delete: user.can_delete,
        can_manage_money: user.can_manage_money,
        can_manage_spare_parts: user.can_manage_spare_parts,
        can_manage_master_data: user.can_manage_master_data,
        can_manage_sales: user.can_manage_sales,
        can_manage_expenses: user.can_manage_expenses,
        expense_warehouses: user.expense_warehouses
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        warehouse_id: user.warehouse_id,
        can_manage_debt: user.can_manage_debt,
        can_delete: user.can_delete,
        can_manage_money: user.can_manage_money,
        can_manage_spare_parts: user.can_manage_spare_parts,
        can_manage_master_data: user.can_manage_master_data,
        can_manage_sales: user.can_manage_sales,
        can_manage_expenses: user.can_manage_expenses,
        expense_warehouses: user.expense_warehouses
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    let attributes = { exclude: ['password'] };
    
    // Nếu không phải ADMIN, chỉ cho xem Tên và ID (để điền vào các form chọn người bán)
    if (req.user.role !== 'ADMIN') {
        const users = await User.findAll({
            attributes: ['id', 'full_name']
        });
        return res.json(users);
    }

    const users = await User.findAll({
      attributes
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      username, password, role, warehouse_id, full_name, phone, 
      can_manage_debt, can_delete, can_manage_money, can_manage_spare_parts, 
      can_manage_master_data, can_manage_sales,
      can_manage_expenses, expense_warehouses
    } = req.body;
    
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const updateData = { 
      username, role, warehouse_id, full_name, phone, 
      can_manage_debt, can_delete, can_manage_money, can_manage_spare_parts, 
      can_manage_master_data, can_manage_sales,
      can_manage_expenses, expense_warehouses
    };
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Kiểm tra nếu đổi username thì phải không trùng với người khác
    if (username && username !== user.username) {
        if (user.username === 'admin') {
            return res.status(403).json({ message: 'Không thể đổi tên đăng nhập của tài khoản Admin hệ thống!' });
        }
        const existing = await User.findOne({ where: { username } });
        if (existing) return res.status(400).json({ message: 'Tên đăng nhập mới đã tồn tại!' });
    }

    await user.update(updateData);
    
    res.json({ message: 'Cập nhật thành công!', user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Ngăn chặn xóa tài khoản admin chính
    if (user.username === 'admin') {
      return res.status(403).json({ message: 'Không thể xóa tài khoản Admin hệ thống!' });
    }

    await user.destroy();
    res.status(200).json({ message: 'Đã xóa nhân viên' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// Hàm khởi tạo Admin mặc định nếu chưa có ai
exports.seedAdmin = async () => {
    const count = await User.count();
    if (count === 0) {
        const hashedPassword = await bcrypt.hash('123456', 10);
        await User.create({
            username: 'admin',
            password: hashedPassword,
            role: 'ADMIN',
            full_name: 'Quản trị viên Hệ thống'
        });
        console.log('✅ Đã tạo tài khoản Admin mặc định: admin / 123456');
    }
}
