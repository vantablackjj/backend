require('dotenv').config();
const { Sequelize } = require('sequelize');

async function check() {
  const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });
  try {
    console.log('--- HH2 records on April 30th ---');
    const [results] = await sequelize.query(`SELECT id, expense_date, "createdAt", amount, content FROM "Expenses" WHERE expense_date::date = '2026-04-30'`);
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error(err);
  }
  await sequelize.close();
  process.exit();
}

check();
