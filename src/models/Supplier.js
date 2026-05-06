const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Supplier = sequelize.define('Supplier', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  payment_type: {
    type: DataTypes.ENUM('Trả gộp', 'Trả theo lô'),
    defaultValue: 'Trả gộp'
  },
  type: {
    type: DataTypes.ENUM('VEHICLE', 'PART', 'BOTH'),
    defaultValue: 'BOTH'
  }
}, {
  timestamps: true
});

module.exports = Supplier;
