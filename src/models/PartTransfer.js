const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PartTransfer = sequelize.define('PartTransfer', {
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
  approved_at: {
    type: DataTypes.DATE
  },
  received_at: {
    type: DataTypes.DATE
  }
}, {
  timestamps: true
});

module.exports = PartTransfer;
