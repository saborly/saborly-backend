/**
 * Corrects prices that drifted from the current printed menu (coffees + fries).
 * Matches existing items by name.en per branch, updates price only — nothing else touched.
 * Run: node scratch/fix-price-mismatches.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const { FoodItem } = require('../models/Category');

const PRICE_FIXES = [
  { name: 'French Fries', price: 2.50 },
  { name: 'With Milk', price: 1.80 },
  { name: 'Cortado', price: 1.60 },
  { name: 'Black (No Milk)', price: 1.40 },
  { name: 'Espresso', price: 1.40 },
  { name: 'Americano Coffee', price: 1.80 },
  { name: 'Decaffeinated Coffee', price: 1.80 },
];

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }
  await mongoose.connect(uri);

  const branches = await Branch.find({});
  let updated = 0;
  let notFound = 0;

  for (const branch of branches) {
    console.log('Branch:', branch.name);
    for (const fix of PRICE_FIXES) {
      const item = await FoodItem.findOne({ branchId: branch._id, 'name.en': fix.name });
      if (!item) {
        console.warn('  Not found, skipping:', fix.name);
        notFound += 1;
        continue;
      }
      if (item.price === fix.price) {
        console.log('  Already correct:', fix.name, '->', fix.price);
        continue;
      }
      const oldPrice = item.price;
      item.price = fix.price;
      await item.save();
      console.log(`  Updated: ${fix.name} ${oldPrice}€ -> ${fix.price}€`);
      updated += 1;
    }
  }

  console.log(`Done. Updated ${updated}, not found ${notFound}.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
