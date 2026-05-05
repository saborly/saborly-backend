const mongoose = require('mongoose');
require('dotenv').config();

async function seedBranch() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const Branch = require('./models/Branch');
    
    // Create Barcelona (Default) Branch
    const barcelona = await Branch.create({
      name: 'Barcelona (Main)',
      location: 'Barcelona, Spain',
      address: 'Calle de Mallorca, 401, 08013 Barcelona',
      phone: '+34932112072',
      isActive: true
    });
    
    console.log('✅ Barcelona branch created:', barcelona._id.toString());
    
    // Create Sabadell Branch (for testing)
    const sabadell = await Branch.create({
      name: 'Sabadell Branch',
      location: 'Sabadell, Spain',
      address: 'Plaça del Gas, 1, 08201 Sabadell',
      phone: '+34937453100',
      isActive: true
    });
    
    console.log('✅ Sabadell branch created:', sabadell._id.toString());
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seedBranch();
