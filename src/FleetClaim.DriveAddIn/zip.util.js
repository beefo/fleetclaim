const fs = require('fs');
const archiver = require('archiver');
const path = require('path');

const distPath = path.join(__dirname, 'dist');
const output = fs.createWriteStream(path.join(distPath, 'fleetclaim-drive-addin.zip'));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
    console.log(`Archive created: ${archive.pointer()} bytes`);
});

archive.on('error', (err) => {
    throw err;
});

archive.pipe(output);

archive.glob('**/*', {
    cwd: distPath,
    ignore: ['*.zip']
});

archive.finalize();
