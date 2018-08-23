const { compile } = require('nexe');
const path = require('path');

const files = [
    'darkmoon-cards',
    'test',
];

const configs = files.map((file) => ({
    name: file,
    input: path.resolve(`${file}.js`),
    output: path.resolve('build/', file),
    loglevel: 'silent',
}));

const builds = configs.map(async (config) => {
    console.log(`Building ${config.name}`);

    return compile(config)
        .then(() => {
            console.log(`Built ${config.name}`);
        });
});

Promise.all(builds)
       .then(() => console.log('Done. Finished binaries are in /build/'))
       .catch((e) => console.log('There were some errors.', '\n', e));
