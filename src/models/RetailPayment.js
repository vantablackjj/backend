const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RetailPayment = sequelize.define('RetailPayment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  retail_sale_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  payment_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  payment_method: {
    type: DataTypes.STRING,
    defaultValue: 'Tiền mặt'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = RetailPayment;
