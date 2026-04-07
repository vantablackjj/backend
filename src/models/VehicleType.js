const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VehicleType = sequelize.define('VehicleType', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.STRING, // e.g., Xe ga, Xe số
    allowNull: false
  },
  chassis_prefix: {
    type: DataTypes.STRING,
    allowNull: true
  },
  engine_prefix: {
    type: DataTypes.STRING,
    allowNull: true
  },
  suggested_price: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  }
}, {
  timestamps: true
});

module.exports = VehicleType;
