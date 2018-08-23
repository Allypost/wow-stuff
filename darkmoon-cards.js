const request = require('request-promise');
const moment = require('moment');
const formatText = require('string-kit').format;

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

async function getItemData(itemId) {
    const uri = `https://eu.api.battle.net/wow/item/${itemId}?locale=en_GB&apikey=ajb6j8226ywqrt2mx6npqyut57czggau`;

    return request(
        {
            uri,
            json: true,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Allypost Profit Bot',
            },
        },
    );
}

function moveUpLines(numLines = 1) {
    process.stdout.write(`\x1b[${numLines}F`);
}

function clearLine() {
    process.stdout.write('\x1b[2K\r');
}

function fmt(str, ...args) {
    const d = (arr, i) => (arr[ i ] === undefined ? '' : arr[ i ]);
    const s = str.map((v, i) => `${v}${d(args, i)}`).join('');

    return formatText(s);
}

function log(...args) {
    clearLine();
    console.log(fmt`^-|>^ `, ...args);
}

function toHHMMSS(secs) {
    const sec_num = parseInt(secs, 10);
    const hours = Math.floor(sec_num / 3600) % 24;
    const minutes = Math.floor(sec_num / 60) % 60;
    const seconds = sec_num % 60;
    const timeNames = [ 'h', 'm', 's' ];

    return [ hours, minutes, seconds ]
        .map((v, i) => `${v}${timeNames[ i ]}`)
        .filter(t => t.substr(0, 1) !== '0')
        .join(' ');
}

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
        }
        else if (deckCards.includes(item)) {
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

function loadingBar(timeout) {
    const then = Date.now();
    clearLine();
    process.stdout.write(fmt`Waiting for ^+${toHHMMSS(Math.ceil(timeout / 1000))} ${timeout % 1000}ms^`);

    return new Promise((resolve) => {
        setTimeout(() => {
            const diff = Date.now() - then;

            resolve(timeout - diff);
        }, 60);
    });
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

async function doWork(timeout = 0) {
    if (timeout > 0)
        return loadingBar(timeout)
            .then((remaining) => doWork(remaining));

    const initCallTime = Date.now();

    clearLine();
    process.stdout.write('\x1b[1;1H');
    log('Fetching auction data locations...');
    log('');
    log('');
    moveUpLines(3);

    const { url, lastModified: latestFileModified } =
        await request({ uri: 'https://eu.api.battle.net/wow/auction/data/draenor?locale=en_GB&apikey=ajb6j8226ywqrt2mx6npqyut57czggau', json: true })
            .then(({ files }) => files.sort((a, b) => b.lastModified - a.lastModified).pop());

    if (!url)
        return;

    log(fmt`Latest auction data is ^+${toHHMMSS((moment().utc() - latestFileModified) / 1000)} old^`);

    const startTimeFetch = Date.now();

    log('Fetching auction data... (this will take a while)');
    moveUpLines(1);

    const { auctions } = await request({ uri: url, json: true });

    const diffFetch = toHHMMSS((Date.now() - startTimeFetch) / 1000);

    log(`Fetched auction data in ${diffFetch}`);

    const startTimeProcess = Date.now();
    log(`Processing data...`);
    moveUpLines(1);


    const dataParser = async ([ deckId, deckCards ]) => {
        const { deckAuction, cardAuctions } = parseAuctionData(auctions, deckId, deckCards);

        const deckCost = Math.ceil(deckAuction.buyout);
        const cardCost = cardAuctions.reduce((s, c) => s + c, 0);
        const profit = Math.floor((deckCost - cardCost) * 0.95);

        const deckData = await getItemData(deckId);
        const profitPercent = Math.floor(profit / cardCost * 100);

        return {
            name: deckData.name,
            deck: deckCost,
            cost: cardCost,
            profit: profit,
            profitPercent: Math.abs(profitPercent),
        };
    };

    const data =
        Object.entries(decks)
              .map(([ deckId, cardIdList ]) => [ Number(deckId), cardIdList ])
              .map(dataParser);

    const diffProcess = (Date.now() - startTimeProcess);

    log(`Processed data in ${diffProcess}ms`);

    return (
        Promise.all(data)
               .then((decks) => decks.filter((deck) => deck))
               .then((decks) => decks.sort((a, b) => b.profitPercent * Math.sign(b.profit) - a.profitPercent * Math.sign(a.profit)))
               .then((decks) => {
//                   term.eraseDisplayBelow();
                   process.stdout.write('\x1b[0J');
                   console.log('');
                   log(fmt`^+Last results:^`);

                   return decks;
               })
               .then((decks) => decks.forEach((deck) => {
                   const profitText = deck.profit > 0 ? 'profit: ' : 'loss:   ';
                   const profitColor = getDeckNameColour(deck);

                   console.log();
                   log(fmt`^+${profitColor}${deck.name}^`);
                   log('  ', fmt`Deck sells for:   ${deck.deck}^yg^`);
                   log('  ', fmt`Card buyout cost: ${deck.cost}^yg^`);
                   log('  ', fmt`Post-Cut ${profitText} ${Math.abs(deck.profit)}^yg^ (${deck.profitPercent}% of cost)`);
               }))
               .finally(() => {
                   const waitTime = 2 * 60 * 1000;
                   const fnTime = Date.now() - initCallTime;

                   console.log();
                   doWork(waitTime - fnTime);
               })
    );
}

console.clear();
doWork();
