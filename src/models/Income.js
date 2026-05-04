const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Income = sequelize.define('Income', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  income_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  vehicle_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  warehouse_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  is_internal: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  timestamps: true
});

module.exports = Income;
