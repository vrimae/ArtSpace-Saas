const fs = require('fs');
const path = require('path');

const componentsDir = path.join(__dirname, 'src', 'components');
const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.tsx'));

const regex = /const formatCurrency = \([^)]+\) => \{\s*return new Intl\.NumberFormat\('id-ID'[^}]+\}\;/g;
const regex2 = /const formatCurrency = \([^)]+\) =>\s*new Intl\.NumberFormat\('id-ID'[^\)]+\)\.format\([^)]+\)\;/g;

const replacement = `const formatCurrency = (amount: number) => {
    return 'Rp ' + amount.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".");
  };`;

for (const file of files) {
  const filePath = path.join(componentsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = false;

  if (regex.test(content)) {
    content = content.replace(regex, replacement);
    updated = true;
  }
  if (regex2.test(content)) {
    content = content.replace(regex2, replacement);
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated', file);
  }
}
