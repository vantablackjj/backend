const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('RETAIL_SALE', 'WHOLESALE_SALE', 'PURCHASE', 'TRANSFER', 'SYSTEM'),
    defaultValue: 'SYSTEM'
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true
  },
  warehouse_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  link: {
    type: DataTypes.STRING,
    allowNull: true
  }

}, {
  timestamps: true
});

module.exports = Notification;
