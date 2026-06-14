// make-password.js — generate a secure admin password hash.
// Usage:  node make-password.js "your-chosen-password"
// Copy the printed hash into ADMIN_PASSWORD_HASH in your environment.
const bcrypt = require('bcryptjs');
const pw = process.argv[2];
if (!pw) {
  console.log('Usage: node make-password.js "your-password"');
  process.exit(1);
}
console.log('\nADMIN_PASSWORD_HASH=' + bcrypt.hashSync(pw, 10) + '\n');
