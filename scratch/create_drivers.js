require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');

function randomPassword() {
  return 'Sb' + crypto.randomBytes(8).toString('base64').replace(/[+/=]/g, '').slice(0, 10) + '!';
}

const drivers = [
  {
    branchId: '68dbd4267fe1403440fb5d88', // Saborly Barcelona
    firstName: 'Driver',
    lastName: 'Barcelona',
    email: 'driver.barcelona@saborly.es',
    phone: '+34600000001',
  },
  {
    branchId: '69e70e2f3a6b3f6814c6e8e3', // Saborly Sabadell
    firstName: 'Driver',
    lastName: 'Sabadell',
    email: 'driver.sabadell@saborly.es',
    phone: '+34600000002',
  },
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const results = [];
  for (const d of drivers) {
    const password = randomPassword();

    const existing = await User.findOne({ email: d.email });
    if (existing) {
      existing.password = password;
      existing.role = 'driver';
      existing.branchId = d.branchId;
      existing.isActive = true;
      await existing.save();
      results.push({ ...d, password, id: existing._id.toString(), action: 'updated' });
      continue;
    }

    const user = await User.create({
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      phone: d.phone,
      password,
      branchId: d.branchId,
      role: 'driver',
      authProvider: 'email',
      isActive: true,
      emailVerified: true,
    });

    results.push({ ...d, password, id: user._id.toString(), action: 'created' });
  }

  console.log(JSON.stringify(results, null, 2));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
