const mongoose = require('mongoose');
require('dotenv').config();

async function checkRawBranches() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const branches = await db.collection('branches').find({}).toArray();
    console.log('Raw Branches:', JSON.stringify(branches, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkRawBranches();
