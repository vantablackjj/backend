const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TransferPayment = sequelize.define('TransferPayment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  transfer_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  amount_paid_vnd: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  payment_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  payment_method: {
    type: DataTypes.STRING,
    defaultValue: 'Cash'
  },
  notes: {
    type: DataTypes.TEXT
  },
  created_by: {
    type: DataTypes.UUID
  }
}, {
  timestamps: true
});

module.exports = TransferPayment;
