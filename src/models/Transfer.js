const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Transfer = sequelize.define('Transfer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  transfer_code: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  from_warehouse_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  to_warehouse_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('PENDING_ADMIN', 'ADMIN_APPROVED', 'RECEIVED', 'CANCELLED'),
    defaultValue: 'PENDING_ADMIN'
  },
  total_amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  notes: {
    type: DataTypes.TEXT
  },
  created_by: {
    type: DataTypes.UUID
  },
  approved_by: {
    type: DataTypes.UUID
  },
  received_by: {
    type: DataTypes.UUID
  },
  requested_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  approved_at: {
    type: DataTypes.DATE
  },
  received_at: {
    type: DataTypes.DATE
  }
}, {
  timestamps: true
});

module.exports = Transfer;
