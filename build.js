const { compile } = require('nexe');
const path = require('path');
const fs = require('fs');

async function getFiles() {
    return new Promise((resolve, reject) => {
        fs.readdir('./', (err, files) => {
            if (err)
                reject(err);

            const targetFiles =
                files
                    .filter((file) => file.slice(-3) === '.js')
                    .filter((file) => file !== path.basename(__filename))
                    .map((file) => file.substr(0, file.length - 3));

            resolve(targetFiles);
        });
    });
}

(async function() {
    const files = await getFiles();

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
})();
