const sequelize = require('./src/config/database');
async function test() {
  try {
    await sequelize.authenticate();
    console.log('Auth OK');
    const [results] = await sequelize.query('SELECT 1');
    console.log('Query OK:', results);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
test();
