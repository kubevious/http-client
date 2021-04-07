import 'mocha';
import should = require('should');
import express from 'express';
import { Server } from 'http'
import { Promise } from 'the-promise';

import { HttpClient, ITracker, RequestInfo } from '../src';
import { AxiosResponse } from 'axios';
import { HttpMethod } from '../src/types';

const PORT = process.env.PORT || 3334;
let globalApp = express();
globalApp.use(express.json({ limit: '10mb' }));

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


globalApp.post("/data", (req, res) => {
    let value = 'none';
    if (req.body && req.body.name) {
        value = 'data: ' + req.body.name;
    }
    res.send(value);
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

    it('post-no-data', () => {
        let client = new HttpClient(`http://localhost:${PORT}`);
        return client.post('/data')
            .then(result => {
                should(result.data).be.equal('none');
            })
    })

    it('post-with-data', () => {
        let client = new HttpClient(`http://localhost:${PORT}`);
        const contact : Contact = {
            name: 'John',
            phone: '1234'
        }
        return client.post('/data', {}, contact)
            .then(result => {
                should(result.data).be.equal('data: John');
            })
    })


    it('get-query-execute', () => {
        let client = new HttpClient(`http://localhost:${PORT}`);
        return client.execute(HttpMethod.GET, '/')
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


    it('failure-absorb', () => {
        const tracker = new Tracker();
        let client = new HttpClient(`http://localhost:111`, {
            tracker: tracker,
            absorbFailures: true,
            retry: {
                initRetryDelay: 100,
                maxRetryDelay: 200
            }
        });
        let wasPassed = false;
        let wasFailed = false;

        client.get('/')
            .then(result => {
                wasPassed = true;
                return null; 
            })
            .catch(reason => {
                wasFailed = true;
                return null; 
            });

        return Promise.timeout(3 * 1000)
            .then(() => {
                should(wasFailed).be.false();
                should(wasPassed).be.false();
                should(tracker.failCount).be.equal(1);
            })


        return 
    })
    .timeout(30 * 1000);

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

interface Contact
{
    name: string,
    phone: string
}