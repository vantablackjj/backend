const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TransferItem = sequelize.define('TransferItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  transfer_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  vehicle_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  original_price: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  }
}, {
  timestamps: false
});

module.exports = TransferItem;
