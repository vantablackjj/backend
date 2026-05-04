const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PartInventory = sequelize.define('PartInventory', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  part_id: {
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
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true
  },

}, {
  timestamps: true
});

module.exports = PartInventory;
