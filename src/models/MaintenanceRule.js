const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MaintenanceRule = sequelize.define('MaintenanceRule', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  min_km: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  max_km: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  suggestion: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  time_gap_months: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  timestamps: true
});

module.exports = MaintenanceRule;
