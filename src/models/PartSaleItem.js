const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PartSaleItem = sequelize.define('PartSaleItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  sale_id: {
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
  unit_price: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  total_price: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  }
}, {
  timestamps: true
});

module.exports = PartSaleItem;
