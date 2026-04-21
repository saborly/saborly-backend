/**
 * Seeds default + Sabadell branches and attaches branchId to legacy documents.
 * Run: node seed-branches.js  (from saborly-backend, with MONGODB_URI in .env)
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Branch = require('./models/Branch');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  let defaultBranch = await Branch.findOne({ name: 'Saborly — Main (Barcelona)' });
  if (!defaultBranch) {
    defaultBranch = await Branch.create({
      name: 'Saborly — Main (Barcelona)',
      location: 'Barcelona, Spain',
      address: 'Saborly, C/ de Pere IV, 208, Sant Martí, 08005 Barcelona, Spain',
      phone: '+34932112072',
      currency: 'EUR',
      language: 'es',
      timezone: 'Europe/Madrid',
      isActive: true,
    });
    console.log('Created default branch:', defaultBranch._id.toString());
  }

  let sabadell = await Branch.findOne({ name: 'Saborly — Sabadell' });
  if (!sabadell) {
    sabadell = await Branch.create({
      name: 'Saborly — Sabadell',
      location: 'Sabadell, Spain',
      address: 'Sabadell, Vallès Occidental, Spain',
      phone: '+34930000000',
      currency: 'EUR',
      language: 'es',
      timezone: 'Europe/Madrid',
      isActive: true,
    });
    console.log('Created Sabadell branch:', sabadell._id.toString());
  }

  const defaultId = defaultBranch._id;

  const collections = [
    'users',
    'categories',
    'fooditems',
    'banners',
    'offers',
    'contacts',
    'addresses',
    'settings',
  ];

  for (const name of collections) {
    try {
      const r = await db.collection(name).updateMany(
        { $or: [{ branchId: { $exists: false } }, { branchId: null }] },
        { $set: { branchId: defaultId } }
      );
      if (r.modifiedCount) console.log(`${name}: updated ${r.modifiedCount} documents with branchId`);
    } catch (e) {
      console.warn(`Skip ${name}:`, e.message);
    }
  }

  try {
    await db.collection('orders').updateMany(
      { $or: [{ branchId: { $exists: false } }, { branchId: null }] },
      { $set: { branchId: defaultId } }
    );
  } catch (e) {
    console.warn('orders migration:', e.message);
  }

  try {
    await db.collection('users').dropIndex('email_1');
    console.log('Dropped legacy users email_1 index');
  } catch (e) {
    /* ignore */
  }

  try {
    await db.collection('users').createIndex({ email: 1, branchId: 1 }, { unique: true });
    console.log('Created compound unique index on users (email, branchId)');
  } catch (e) {
    console.warn('users index:', e.message);
  }

  console.log('Done. Default branchId:', defaultId.toString());
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
