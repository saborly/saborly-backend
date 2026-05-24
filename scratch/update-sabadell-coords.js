/**
 * One-shot script: update Sabadell branch coordinates to the correct address.
 * Run: node scratch/update-sabadell-coords.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Branch = require('../models/Branch');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

  await mongoose.connect(uri);

  const result = await Branch.findOneAndUpdate(
    { name: /sabadell/i },
    {
      $set: {
        latitude: 41.5570164,
        longitude: 2.0969248,
        address: 'Av. de Francesc Macià, 47, 08206 Sabadell, Barcelona, Spain',
      },
    },
    { new: true }
  );

  if (!result) {
    console.error('Sabadell branch not found in DB');
  } else {
    console.log('Updated Sabadell branch:');
    console.log('  _id      :', result._id.toString());
    console.log('  latitude :', result.latitude);
    console.log('  longitude:', result.longitude);
    console.log('  address  :', result.address);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
