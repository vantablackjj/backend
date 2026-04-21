const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PartTransferItem = sequelize.define('PartTransferItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  transfer_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  part_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  unit: {
      type: DataTypes.STRING
  }
}, {
  timestamps: true
});

module.exports = PartTransferItem;
