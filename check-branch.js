const mongoose = require('mongoose');
require('dotenv').config();

const Branch = require('./models/Branch'); // Adjust path as needed

async function checkBranches() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Check specific branch
        const specificBranch = await Branch.findById('68dbd4267fe1403440fb5d88');
        console.log('Specific branch:', specificBranch);

        // List all branches
        const allBranches = await Branch.find({});
        console.log('\nAll branches in database:');
        allBranches.forEach(branch => {
            console.log(`- ID: ${branch._id}, Name: ${branch.name}, Active: ${branch.isActive}`);
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkBranches();