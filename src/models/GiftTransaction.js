const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GiftTransaction = sequelize.define('GiftTransaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  gift_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  warehouse_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('IMPORT', 'EXPORT_RETAIL', 'EXPORT_EVENT', 'OTHER_EXPORT'),
    allowNull: false
  },
  quantity: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  transaction_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  event_name: {
    type: DataTypes.STRING,
    allowNull: true
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

module.exports = GiftTransaction;
