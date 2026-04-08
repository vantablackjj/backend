const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PartPurchase = sequelize.define('PartPurchase', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  supplier_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  warehouse_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  purchase_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  invoice_no: {
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
  }
}, {
  timestamps: true
});

module.exports = PartPurchase;
