const fs = require('fs');
const path = require('path');

// Let's check the size of run-near-source.png and run-far-rebuilt.png
const nearPath = path.resolve('docs/art/characters/hunter/animation-v4/run-near-source.png');
const farPath = path.resolve('docs/art/characters/hunter/animation-v4/run-far-rebuilt.png');

console.log('Near exists:', fs.existsSync(nearPath), 'Size:', fs.statSync(nearPath).size);
console.log('Far exists:', fs.existsSync(farPath), 'Size:', fs.statSync(farPath).size);
