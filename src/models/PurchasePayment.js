const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PurchasePayment = sequelize.define('PurchasePayment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  purchase_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  payment_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  amount_paid_vnd: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  amount_paid_usd: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = PurchasePayment;
