const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VehicleColor = sequelize.define('VehicleColor', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  color_name: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  timestamps: true
});

module.exports = VehicleColor;
