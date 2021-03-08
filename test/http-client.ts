import 'mocha';
import should = require('should');
import express from 'express';
import { Server } from 'http'
import { Promise } from 'the-promise';

import { HttpClient, ITracker, RequestInfo } from '../src';
import { AxiosResponse } from 'axios';

const PORT = process.env.PORT || 3334;
let globalApp = express();

let globalHttp : Server | null;

globalApp.get("/", (req, res) => {
    res.send('hello');
});

globalApp.get("/foo", (req, res) => {
    res.send('foo1');
});

globalApp.get("/foo/bar", (req, res) => {
    res.send('bar1');
});


describe('backend-client', () => {

    beforeEach(() => {
        return Promise.construct((resolve, reject) => {
            globalHttp = globalApp.listen(PORT, () => {
                console.log("Listening on: ", PORT);
                resolve();
            })
        })
    });


    afterEach(() => {
        globalHttp!.close();
        globalHttp = null;
    });


    it('constructor', () => {
        let client = new HttpClient('');
        should(client.urlBase).be.equal('');
    });


    it('construct-scope', () => {
        let client = new HttpClient('');
        should(client.urlBase).be.equal('');

        let subClient = client.scope('abc');
        should(subClient.urlBase).be.equal('abc');

        let subClient2 = subClient.scope('def');
        should(subClient2.urlBase).be.equal('abc/def');
    });


    it('get-query', () => {
        let client = new HttpClient(`http://localhost:${PORT}`);
        return client.get('/')
            .then(result => {
                should(result.data).be.equal('hello');
            })
    })

    it('get-query-tracker', () => {
        const tracker = new Tracker();
        let client = new HttpClient(`http://localhost:${PORT}`, {
            tracker: tracker
        });
        return client.get('/')
            .then(result => {
                should(result.data).be.equal('hello');
            })
            .then(() => {
                should(tracker.startCount).be.equal(1);
                should(tracker.finishCount).be.equal(1);
                should(tracker.tryAttemptCount).be.equal(1);
                should(tracker.failedAttemptCount).be.equal(0);
                should(tracker.failCount).be.equal(0);
            });
    })

    it('get-failure', () => {
        const tracker = new Tracker();
        let client = new HttpClient(`http://localhost:111`, {
            tracker: tracker,
            retry: {
                initRetryDelay: 100
            }
        });
        let wasFailed = false;
        return client.get('/')
            .catch(reason => {
                wasFailed = true;
            })
            .then(() => {
                should(wasFailed).be.true();
                should(tracker.startCount).be.equal(1);
                should(tracker.finishCount).be.equal(0);
                should(tracker.tryAttemptCount).be.equal(4);
                should(tracker.failedAttemptCount).be.equal(4);
                should(tracker.failCount).be.equal(1);
            });
    })
    .timeout(30 * 1000);

    it('get-query-scope', () => {
        const tracker = new Tracker();
        let client = new HttpClient(`http://localhost:${PORT}`, {
            tracker: tracker
        });
        let scopeClient = client.scope('foo');
        return scopeClient.get('/bar')
            .then(result => {
                should(result.data).be.equal('bar1');
            })
            .then(() => {
                should(tracker.startCount).be.equal(1);
                should(tracker.finishCount).be.equal(1);
                should(tracker.tryAttemptCount).be.equal(1);
                should(tracker.failedAttemptCount).be.equal(0);
                should(tracker.failCount).be.equal(0);
            });
    })

});

class Tracker implements ITracker
{
    public startCount: number = 0;
    public finishCount: number = 0;
    public failCount: number = 0;
    public tryAttemptCount: number = 0;
    public failedAttemptCount: number = 0;

    start(requestInfo : RequestInfo)
    {
        console.log('[TRACKER::start] ', requestInfo.method, ' :: ', requestInfo.url);
        this.startCount++;
    }

    finish(requestInfo : RequestInfo, response: AxiosResponse<any>)
    {
        console.log('[TRACKER::finish] ', requestInfo.method, ' :: ', requestInfo.url);        
        this.finishCount++;
    }

    fail(requestInfo : RequestInfo, reason: any)
    {
        console.error('[TRACKER::fail] ', requestInfo.method, ' :: ', requestInfo.url , ' :: ', reason.message);
        this.failCount++;
    }

    tryAttempt(requestInfo : RequestInfo)
    {
        console.info('[TRACKER::tryAttempt] ', requestInfo.method, ' :: ', requestInfo.url);
        this.tryAttemptCount++;
    }

    failedAttempt(requestInfo : RequestInfo, reason: any, data: any, status: number)
    {
        console.warn('[TRACKER::fail] ', requestInfo.method, ' :: ', requestInfo.url , ', status:', status);
        this.failedAttemptCount++;
    }
}