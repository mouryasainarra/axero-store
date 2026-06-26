// Generate an admin password hash:  node make-password.js "your-strong-password"
const bcrypt = require('bcryptjs');
const pw = process.argv[2];
if (!pw) { console.log('Usage: node make-password.js "your-password"'); process.exit(1); }
console.log('ADMIN_PASSWORD_HASH=' + bcrypt.hashSync(pw, 10));
