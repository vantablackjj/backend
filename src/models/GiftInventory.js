const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GiftInventory = sequelize.define('GiftInventory', {
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
  quantity: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  }
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['gift_id', 'warehouse_id']
    }
  ]
});

module.exports = GiftInventory;
