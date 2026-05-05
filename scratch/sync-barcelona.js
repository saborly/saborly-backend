const mongoose = require('mongoose');
require('dotenv').config();

async function fixBarcelonaId() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const Branch = require('../models/Branch');
    const targetId = '68dbd4267fe1403440fb5d88';
    
    // 1. Delete any branch with the same phone to avoid conflicts
    await Branch.deleteMany({ phone: '+34932112072' });
    
    // 2. Create the branch with your specific ID
    const barcelona = await Branch.create({
      _id: new mongoose.Types.ObjectId(targetId),
      name: 'saborly_main',
      location: 'Barcelona, Spain',
      address: 'Saborly, C/ de Pere IV, 208, Sant Martí, 08005 Barcelona, Spain',
      phone: '+34932112072',
      latitude: 41.405,
      longitude: 2.2009,
      isActive: true,
      currency: 'EUR',
      language: 'es',
      timezone: 'Europe/Madrid'
    });
    
    console.log('✅ Barcelona branch synced with ID:', barcelona._id.toString());
    process.exit(0);
  } catch (err) {
    console.error('❌ Error syncing branch:', err.message);
    process.exit(1);
  }
}

fixBarcelonaId();
