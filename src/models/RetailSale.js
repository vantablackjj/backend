const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RetailSale = sequelize.define('RetailSale', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  sale_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  customer_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  id_card: {
    type: DataTypes.STRING,
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  gender: {
    type: DataTypes.ENUM('Nam', 'Nữ'),
    defaultValue: 'Nam'
  },
  birthday: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  engine_no: {
    type: DataTypes.STRING,
    allowNull: false
  },
  chassis_no: {
    type: DataTypes.STRING,
    allowNull: false
  },
  total_price: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  paid_amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  sale_type: {
    type: DataTypes.ENUM('Hồ sơ xe', 'Đăng ký'),
    defaultValue: 'Hồ sơ xe'
  },
  guarantee: {
    type: DataTypes.ENUM('Có', 'Không'),
    defaultValue: 'Không'
  },
  payment_due_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  guarantor_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  guarantor_phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  seller_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  warehouse_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  payment_method: {
    type: DataTypes.ENUM('Trả thẳng', 'Trả góp', 'Trúng thưởng/Công nợ', 'Trả gộp', 'Chuyển khoản'),
    defaultValue: 'Trả thẳng'
  },
  bank_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  contract_number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  loan_amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  cash_amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  transfer_amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true
  },
  is_disbursed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  disbursed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  guarantee_book_issued: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  guarantee_book_issued_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  gifts: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
  },
  used_gifts: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
  }

}, {

  timestamps: true
});

module.exports = RetailSale;
