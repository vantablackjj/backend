const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WholesaleSale = sequelize.define('WholesaleSale', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  customer_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sale_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  total_amount_vnd: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  total_amount_usd: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  paid_amount_vnd: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  paid_amount_usd: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  warehouse_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true
  }

}, {

  timestamps: true
});

module.exports = WholesaleSale;
