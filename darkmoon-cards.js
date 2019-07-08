const osLocale = require('os-locale');

const Console = require('./lib/Console');
const API = new (require('./lib/Blizzard/Api'))(require('./credentials.json'));

function parseAuctionData(auctions = [], deckId, deckCards) {
    const deckAuction = {
        buyout: 0,
    };
    const rawCardAuctions = {};

    auctions.forEach((auction) => {
        if (auction.buyout === 0)
            return;

        const item = auction.item;

        if (item === deckId) {
            if (
                !deckAuction.buyout
                || auction.buyout < deckAuction.buyout
            )
                Object.assign(deckAuction, auction);
        } else if (deckCards.includes(item)) {
            if (
                !rawCardAuctions[ item ]
                || auction.buyout < rawCardAuctions[ item ].buyout
            )
                rawCardAuctions[ item ] = auction;
        }
    });

    const cardAuctions = Object.values(rawCardAuctions)
                               .map(cardAuction => Math.ceil(cardAuction.buyout / 10000));

    deckAuction.buyout /= 10000;

    return { deckAuction, cardAuctions };
}

async function formatAuctionData(auctions, [ deckId, deckCards ]) {
    const { deckAuction, cardAuctions } = parseAuctionData(auctions, deckId, deckCards);

    const deckCost = Math.ceil(deckAuction.buyout);
    const cardCost = cardAuctions.reduce((s, c) => s + c, 0);
    const profit = Math.floor(deckCost * 0.95 - cardCost);

    const deckData = await API.getItemData(deckId);
    const profitPercent = Math.floor(profit / cardCost * 100);

    return {
        id: deckId,
        name: deckData.name,
        deck: deckCost,
        cost: cardCost,
        profit: profit,
        profitPercent: Math.abs(profitPercent),
    };
}

function toHHMMSS(secs) {
    const s = Math.round(secs);
    const hours = Math.floor(s / 3600) % 24;
    const minutes = Math.floor(s / 60) % 60;
    const seconds = s % 60;
    const timeNames = [ 'h', 'm', 's' ];

    return [ hours, minutes, seconds ]
               .map((v, i) => `${v}${timeNames[ i ]}`)
               .filter(t => t.substr(0, 1) !== '0')
               .join(' ') || '0s';
}

function toHHMMSSmm(milliseconds) {
    return `${toHHMMSS(milliseconds / 1000)} ${String(milliseconds % 1000).padStart(3, '0')}ms`;
}

function getProgressBar(text) {
    const startTime = Date.now();

    function eta(percent) {
        const rate = (Date.now() - startTime) / percent / 1000;
        const seconds = Math.round((1 - percent) * rate);

        return toHHMMSS(seconds);
    }

    function percent(t) {
        t *= 100;
        return `${t.toFixed(2)}%`;
    }

    const output = `${text} | `;
    let column = 0;

    let initialized = false;

    function init() {
        column = Console.log(output);
        Console.moveUpLines();
        initialized = true;
    }

    function update(percentage = 0.0) {
        if (!initialized)
            init();

        Console.moveToColumn(column);
        Console.write(`${percent(percentage)} | ETA ${eta(percentage)}`);
    }

    return { update: (percent) => update(percent) };
}

function getDeckNameColour(deck) {
    const { profit, profitPercent } = deck;
    const weighedProfitPercent = Math.sign(profit) * profitPercent;

    if (weighedProfitPercent <= -25)
        return '^R';

    if (weighedProfitPercent <= 0)
        return '^r';

    if (weighedProfitPercent <= 5)
        return '^Y';

    if (weighedProfitPercent <= 15)
        return '^y';

    if (weighedProfitPercent >= 100)
        return '^+^#^G^K';

    return '^g';
}

const lastData = {};

function getDeltas(prices, lastData = []) {
    let sign = 1;

    const deltas = prices
        .map((e, i) => [ e, lastData[ i ] ])
        .map(([ current, previous ]) => {
            if (!previous)
                return 0;

            return current - previous;
        });

    const numLen = Math.max(...deltas.map(i => String(i).length + 1));

    return (
        deltas
            .map((pureDelta) => {
                const delta = sign * pureDelta;
                const triangle = delta * sign > 0 ? '▲' : '▼';
                sign *= -1;

                const formattedDelta = String(delta).padStart(numLen, ' ');

                if (delta > 0)
                    return Console.format`^G${triangle}^ ^g${formattedDelta}^^yg^`;

                if (delta < 0)
                    return Console.format`^R${triangle}^ ^r${formattedDelta}^^yg^`;
            })
            .map((str) => str || Console.format`^y~^ 0^yg^`)
    );
}

async function displayAuctions(auctionPromises) {
    return (
        Promise.all(auctionPromises)
               .then((decks) => decks.filter((deck) => deck))
               .then((decks) => decks.sort((a, b) => b.profit - a.profit))
               .then((decks) => {
                   process.stdout.write('\x1b[0J');
                   console.log('');
                   Console.log(Console.format`^+Last results:^`);

                   return decks;
               })
               .then((decks) => Promise.all(decks.map(async (deckData) => {
                   const profitText = deckData.profit > 0 ? 'profit: ' : 'loss:   ';
                   const profitColor = getDeckNameColour(deckData);

                   const locale = String(await osLocale()).replace('_', '-');
                   const f = (num) => new Intl.NumberFormat(locale).format(num);

                   const { deck, cost, profit, profitPercent } = deckData;

                   const prices = [ deck, cost, profit ];
                   const maxLen = Math.max(...prices.map((e) => f(e).length));
                   const [ d, c, p ] = prices.map((e) => String(f(e)).padStart(maxLen, ' '));
                   const [ dd, cd, pd ] = getDeltas(prices, lastData[ deckData.id ]);
                   lastData[ deckData.id ] = prices;

                   console.log();
                   Console.log(Console.format`^+${profitColor}${deckData.name}^`);
                   Console.log('  ', Console.format`Deck sells for:   ${d}^yg^ ${dd}`);
                   Console.log('  ', Console.format`Card buyout cost: ${c}^yg^ ${cd}`);
                   Console.log('  ', Console.format`Post-Cut ${profitText} ${p}^yg^ ${pd} (${profitPercent}% of cost)`);
               })))
    );
}

async function waitFor(milliseconds = 0, text = 'Waiting for') {
    const then = Date.now();

    const column = Console.log(`${text} `);
    Console.moveUpLines();

    function write(milliseconds) {
        Console.moveToColumn(column);
        Console.write(Console.format`^+${toHHMMSSmm(milliseconds)}^`);
    }

    write(milliseconds);

    return new Promise((resolve) => {
        setTimeout(() => {
            const diff = Date.now() - then;
            const newTime = milliseconds - diff;

            write(milliseconds);
            resolve(newTime);
        }, 60);
    });
}

async function catchError(err) {
    Console.log('Something went wrong...', err.message);
    console.log();
    return doWork(5000).catch(catchError);
}

const decks = {
    // Fathoms
    159125: [
        153605, 153621, 153622, 153623, 153624, 153625, 153626, 153627,
    ],
    // Squalls
    159126: [
        153604, 153614, 153615, 153616, 153617, 153618, 153619, 153620,
    ],
    // Tides
    159127: [
        153603, 153607, 153608, 153609, 153610, 153611, 153612, 153613,
    ],
    // Blockades
    159128: [
        153606, 153628, 153629, 153630, 153631, 153632, 153633, 153634,
    ],
};

let lastDate = 0;

async function doWork(timeout = 0) {
    if (timeout > 0) {
        return waitFor(timeout)
            .then(doWork)
            .catch(catchError);
    }

    Console.clearLine();
    Console.moveTo(1, 1);
    Console.log('Fetching auction data info...');
    Console.log('');
    Console.log('');
    Console.moveUpLines(3);

    const { url, date } = await API.getAuctionUrl();
    Console.log(Console.format`Latest auction data is ^+${toHHMMSS((new Date().getTime() - date) / 1000)} old^`);

    if (lastDate >= date) {
        Console.log('Newest data is already displayed.');
        return doWork(30000).catch(catchError);
    }

    const startTime = Date.now();
    lastDate = startTime;

    const progressBar = getProgressBar('Downloading auction data...');
    const rawAuctionString = await API.fetchAuctionData(url, progressBar.update);

    Console.log(Console.format`Fetched data in ${toHHMMSS((Date.now() - startTime) / 1000)}^`);

    Console.log(`Processing data...`);
    Console.moveUpLines();

    const startTimeProcess = Date.now();
    const { auctions } = JSON.parse(rawAuctionString);
    const mapper = formatAuctionData.bind(this, auctions);
    const auctionPromises =
        Object.entries(decks)
              .map(([ deckId, cardIdList ]) => [ Number(deckId), cardIdList ])
              .map(mapper);

    Console.log(`Processed data in ${toHHMMSSmm(Date.now() - startTimeProcess)}`);

    await displayAuctions(auctionPromises);

    doWork().catch(catchError);
}

(async () => {
    console.clear();
    await API.startTokenRefresher();
    doWork()
        .catch(catchError);
})();
