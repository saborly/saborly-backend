require('dotenv').config();
const mongoose = require('mongoose');
const { FoodItem } = require('../models/Category');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const res = await FoodItem.updateMany(
    { 'name.en': 'Cortado (Espresso with a splash of milk)' },
    { $set: { price: 1.60 } }
  );
  console.log('Matched:', res.matchedCount, 'Modified:', res.modifiedCount);
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
