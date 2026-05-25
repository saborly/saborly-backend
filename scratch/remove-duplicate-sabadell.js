/**
 * Finds duplicate Sabadell branches and removes the one WITHOUT correct coordinates.
 * Keeps the branch with latitude: 41.5570164 / longitude: 2.0969248.
 * Run: node scratch/remove-duplicate-sabadell.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Branch = require('../models/Branch');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  await mongoose.connect(uri);

  const sabadells = await Branch.find({ name: /sabadell/i }).lean();
  console.log(`Found ${sabadells.length} Sabadell branch(es):`);
  sabadells.forEach(b => console.log(`  [${b._id}] "${b.name}" lat=${b.latitude} lng=${b.longitude} address="${b.address}"`));

  if (sabadells.length <= 1) {
    console.log('Nothing to remove.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Keep the one with the correct coordinates; delete the rest
  const CORRECT_LAT = 41.5570164;
  const CORRECT_LNG = 2.0969248;

  const keeper = sabadells.find(b => b.latitude === CORRECT_LAT && b.longitude === CORRECT_LNG)
    ?? sabadells[0]; // fallback: keep first if none match exactly

  const toDelete = sabadells.filter(b => b._id.toString() !== keeper._id.toString());

  console.log(`\nKeeping: [${keeper._id}] "${keeper.name}"`);
  for (const b of toDelete) {
    console.log(`Deleting: [${b._id}] "${b.name}"`);
    await Branch.deleteOne({ _id: b._id });
  }

  // Ensure keeper has correct coords and address
  await Branch.updateOne(
    { _id: keeper._id },
    { $set: {
      latitude: CORRECT_LAT,
      longitude: CORRECT_LNG,
      address: 'Av. de Francesc Macià, 47, 08206 Sabadell, Barcelona, Spain',
    }}
  );

  console.log('\nDone. Remaining Sabadell branches:');
  const remaining = await Branch.find({ name: /sabadell/i }).lean();
  remaining.forEach(b => console.log(`  [${b._id}] "${b.name}" lat=${b.latitude} lng=${b.longitude}`));

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
