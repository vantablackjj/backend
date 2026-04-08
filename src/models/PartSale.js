const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PartSale = sequelize.define('PartSale', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  sale_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  sale_type: {
    type: DataTypes.ENUM('Retail', 'Wholesale'),
    defaultValue: 'Retail'
  },
  customer_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  customer_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  customer_phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  total_amount: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  paid_amount: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  vat_percent: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true
  },
  warehouse_id: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = PartSale;
