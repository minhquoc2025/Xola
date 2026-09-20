const fs = require('fs');
const path = require('path');

const rendererPath = path.join(__dirname, '..', 'src', 'renderer', 'renderer.js');
const content = fs.readFileSync(rendererPath, 'utf8');

const expected = [
  'Cửu Chuyển Hồi Xuân',
  'Kim Đan Phá Sát',
  'Tam Muội Chân Hỏa',
];

for (const name of expected) {
  if (!content.includes(name)) {
    throw new Error(`Missing skill: ${name}`);
  }
}

console.log('Skill list check passed');
