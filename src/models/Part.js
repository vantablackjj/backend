const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Part = sequelize.define('Part', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  code: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  unit: {
    type: DataTypes.STRING,
    allowNull: false
  },
  purchase_price: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  selling_price: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  code_type: {
      type: DataTypes.ENUM('HONDA', 'SELF_CREATED'),
      defaultValue: 'HONDA'
  },
  default_conversion_rate: {
      type: DataTypes.INTEGER,
      defaultValue: 1
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = Part;
