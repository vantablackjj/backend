const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LiftTable = sequelize.define('LiftTable', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  warehouse_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('AVAILABLE', 'BUSY', 'MAINTENANCE'),
    defaultValue: 'AVAILABLE'
  }
}, {
  timestamps: true
});

module.exports = LiftTable;
