require('dotenv').config();

const { Sequelize } = require('sequelize');
const config = require('../config/config').production;

const sequelize = new Sequelize(config);

async function main() {
  const [statusDistribution] = await sequelize.query(
    'SELECT status, COUNT(*) AS count FROM bookings GROUP BY status ORDER BY status'
  );
  const [holdingWithPayment] = await sequelize.query(
    "SELECT COUNT(*) AS violations FROM bookings b WHERE b.status = 'holding' AND EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id)"
  );
  const [confirmedWithoutSuccess] = await sequelize.query(
    "SELECT COUNT(*) AS violations FROM bookings b WHERE b.status = 'confirmed' AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status = 'success')"
  );
  const [cancelledWithSuccess] = await sequelize.query(
    "SELECT COUNT(*) AS violations FROM bookings b WHERE b.status = 'cancelled' AND EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status = 'success')"
  );
  const [pendingPaymentMismatch] = await sequelize.query(
    "SELECT COUNT(*) AS violations FROM (SELECT b.id FROM bookings b LEFT JOIN payments p ON p.booking_id = b.id WHERE b.status = 'pending_payment' GROUP BY b.id HAVING NOT (COUNT(p.id) = 1 AND SUM(p.status = 'pending') = 1)) AS mismatches"
  );
  const [paymentCount] = await sequelize.query('SELECT COUNT(*) AS payments FROM payments');

  console.log('1. booking status distribution:', statusDistribution);
  console.log('2. holding with payment:', holdingWithPayment[0]);
  console.log('3. confirmed without successful payment:', confirmedWithoutSuccess[0]);
  console.log('4. cancelled with successful payment:', cancelledWithSuccess[0]);
  console.log('5. pending_payment without exactly one pending payment:', pendingPaymentMismatch[0]);
  console.log('Total payments after semantic seed:', paymentCount[0]);
}

main()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => sequelize.close());
