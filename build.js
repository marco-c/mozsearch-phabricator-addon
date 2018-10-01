'use strict';

const fs = require('fs');
const https = require('https');
const archiver = require('archiver');

const includeFiles = [
  'tippy.all.min.js', 'tippy-light.css',
  'phabricator.js'
];
const zipName = './searchfox-phabricator.zip';
fs.readFile('manifest.json', 'utf8', function(err, data) {
  if (err) throw err;
  let manObj = JSON.parse(data);
  fs.readFile('package.json', 'utf8', function(err, data) {
      if (err) throw err;
      let packObj = JSON.parse(data);
      if (manObj["version"] != packObj["version"]) {
          throw "Different versions of manifest.json and package.json";
      }
  });
});

fs.readdir('.', (e, files) => {
  if (e) {
    throw e;
  }

  const resultFiles = files.filter(file => includeFiles.includes(file));

  makeZip(resultFiles);
});

function makeZip(list){
  const output = fs.createWriteStream(zipName);

  let archive = archiver('zip', {
    zlib: { level: 9 }
  });

  archive.on('error', e => { throw e; });

  archive.pipe(output);

  list.forEach(file => archive.file(file));

  archive.finalize();
}
