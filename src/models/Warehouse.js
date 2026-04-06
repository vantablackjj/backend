const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Warehouse = sequelize.define('Warehouse', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  warehouse_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  location: {
    type: DataTypes.STRING
  },
  address: {
    type: DataTypes.TEXT
  },
  phone: {
    type: DataTypes.STRING
  },
  mobile: {
    type: DataTypes.STRING
  },
  manager_name: {
    type: DataTypes.STRING
  },
  manager_id: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = Warehouse;
