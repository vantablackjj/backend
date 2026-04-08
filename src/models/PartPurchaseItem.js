const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PartPurchaseItem = sequelize.define('PartPurchaseItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  purchase_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  part_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  quantity: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  unit: {
    type: DataTypes.STRING,
    allowNull: false
  },
  conversion_rate: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 1
  },
  base_quantity: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  unit_price: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  total_price: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = PartPurchaseItem;
