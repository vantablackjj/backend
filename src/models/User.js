const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('ADMIN', 'MANAGER', 'STAFF'),
    defaultValue: 'STAFF'
  },

  warehouse_id: {
    type: DataTypes.UUID,
    allowNull: true // Admin có thể không cần gắn với kho cụ thể
  },
  full_name: {
    type: DataTypes.STRING
  },
  phone: {
    type: DataTypes.STRING
  },
  can_manage_debt: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  can_delete: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  can_manage_money: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  can_manage_spare_parts: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  can_manage_master_data: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  can_manage_sales: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  can_manage_expenses: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  can_delete_ticket: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  can_edit_ticket: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  can_approve_transfer: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  expense_warehouses: {
    type: DataTypes.TEXT, // Chuỗi lưu ID kho cách nhau bởi dấu phẩy
    allowNull: true
  },
  accessible_warehouses: {
    type: DataTypes.TEXT, // Chuỗi lưu ID kho cách nhau bởi dấu phẩy (truy cập chung)
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = User;
