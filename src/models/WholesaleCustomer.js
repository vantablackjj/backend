const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WholesaleCustomer = sequelize.define('WholesaleCustomer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  customer_code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  payment_type: {
    type: DataTypes.ENUM('Trả gộp', 'Trả theo lô'),
    defaultValue: 'Trả gộp'
  }
}, {
  timestamps: true
});

module.exports = WholesaleCustomer;
