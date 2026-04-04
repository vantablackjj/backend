const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('ADMIN', 'STAFF'),
    defaultValue: 'STAFF'
  },

  warehouse_id: {
    type: DataTypes.UUID,
    allowNull: true // Admin có thể không cần gắn với kho cụ thể
  },
  full_name: {
    type: DataTypes.STRING
  }
}, {
  timestamps: true
});

module.exports = User;
