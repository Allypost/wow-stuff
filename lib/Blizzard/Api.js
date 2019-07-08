const http = require('http');
const request = require('request-promise');

module.exports = class Api {
    constructor({ id, secret, region = 'eu', server = 'draenor' }) {
        this.id = id;
        this.secret = secret;
        this.region = region;
        this.baseUrl = `https://${region}.api.blizzard.com`;
        this.serverName =
            server
                .toLowerCase()
                .replace(' ', '-');

        this.accessToken = '';
        this._tokenRefresherTimeout = null;
    }

    async getItemData(itemId) {
        return this.apiRequest(`/wow/item/${itemId}`);
    }

    async getAuctionUrl() {
        const apiResponse =
            await
                this
                    .apiRequest(`/wow/auction/data/${this.serverName}`)
                    .then(
                        ({ files }) =>
                            files
                                .sort((a, b) => b.lastModified - a.lastModified)
                                .pop()
                    );

        const { url, lastModified } = apiResponse;

        if (!url)
            return { url: '', date: 0 };

        return { url, date: lastModified };
    }

    async fetchAuctionData(url, tick = () => 0) {
        if (!url)
            return Promise.reject(null);

        let auctionData = '';

        return new Promise((resolve, reject) => {
            http.get(url, (res) => {
                const totalLength = Number(res.headers[ 'content-length' ] || Number.MAX_SAFE_INTEGER);

                res.on('data', (chunk) => {
                    auctionData += chunk;

                    tick(auctionData.length / totalLength);
                });

                res.on('end', () => {
                    tick(1);
                    resolve(auctionData);
                });

                res.on('error', () => {
                    reject(null);
                });
            });
        });
    }

    async getToken() {
        const uri = `https://${this.region}.battle.net/oauth/token`;
        const auth = {
            username: this.id,
            password: this.secret,
        };
        const formData = {
            grant_type: 'client_credentials'
        };

        const data = {
            auth,
            formData,
            method: 'POST',
        };

        return this.apiRequest(uri, data);
    }

    async startTokenRefresher() {
        if (this._tokenRefresherTimeout)
            clearTimeout(this._tokenRefresherTimeout);

        const { access_token, expires_in } = await this.getToken();
        const timeout = Math.round(expires_in * 1000 * 3 / 4);

        this.accessToken = access_token;

        this._tokenRefresherTimeout = setTimeout(async () => await this.startTokenRefresher(), timeout);
    }

    async apiRequest(uri, additionalData = {}) {
        const url = this._getAbsoluteUrl(uri);
        const data = Object.assign(additionalData, {
            json: true,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Allypost Profit Bot',
                'Authorization': `Bearer ${this.accessToken}`
            },
        });

        return request(url, data);
    }

    _getAbsoluteUrl(uri) {
        try {
            new URL(uri);

            return uri;
        } catch (e) {
            return `${this.baseUrl}${uri}`;
        }
    }

};
