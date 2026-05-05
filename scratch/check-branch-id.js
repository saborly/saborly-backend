const mongoose = require('mongoose');
require('dotenv').config();

async function checkBranch() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const Branch = require('../models/Branch');
    const branchId = '68dbd4267fe1403440fb5d88';
    
    const branch = await Branch.findById(branchId);
    if (branch) {
      console.log('Branch found:', JSON.stringify(branch, null, 2));
    } else {
      console.log('Branch NOT found for ID:', branchId);
      const allBranches = await Branch.find({}, { _id: 1, name: 1, isActive: 1 });
      console.log('All available branches:', JSON.stringify(allBranches, null, 2));
    }
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkBranch();
