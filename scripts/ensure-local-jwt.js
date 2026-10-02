// Set a local signing secret once, without printing or replacing an existing one.
const fs = require('fs');
const crypto = require('crypto');
const file = '.env';
let content=fs.readFileSync(file,'utf8');
if (/^JWT_SECRET=\S+/m.test(content)) {
  console.log('Local JWT secret is already configured.');
} else {
  content=content.replace(/^JWT_SECRET=.*\r?\n?/mg,'');
  fs.writeFileSync(file,`${content.trimEnd()}\nJWT_SECRET=${crypto.randomBytes(48).toString('hex')}\n`);
  console.log('Local JWT secret configured in ignored .env.');
}
