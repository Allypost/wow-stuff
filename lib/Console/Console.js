const formatText = require('string-kit').format;

const printCSI = (str) => process.stdout.write(`\x1b[${str}`);

class Console {
    static moveUpLines(numLines = 1) {
        printCSI(`${numLines}F`);
    }

    static moveTo(x = 1, y = 1) {
        [ x, y ] = [ x, y ].map((x) => Math.max(1, x));

        printCSI(`${x};${y}H`);
    }

    static clearLine() {
        printCSI('2K\r');
    }

    static clearAfter() {
        printCSI('0K');
    }

    static format(str, ...args) {
        const d = (arr, i) => (arr[ i ] === undefined ? '' : arr[ i ]);
        const s = str.map((v, i) => `${v}${d(args, i)}`).join('');

        return formatText(s);
    }

    static log(...args) {
        this.clearLine();

        const prefix = this.format`^-|>^ `;

        return this.write(prefix, ...args, '\n') - prefix.length + 2;
    }

    static write(...args) {
        this.clearAfter();

        const output = [ ...args ].join(' ');
        process.stdout.write(output);

        return output.length;
    }

    static moveToColumn(column = 1) {
        column = Math.max(1, column);

        printCSI(`${column}G`);
    }
}

module.exports = Console;
