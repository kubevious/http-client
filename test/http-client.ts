import 'mocha';
import should = require('should');
import express from 'express';
import { Server } from 'http'
import { Promise } from 'the-promise';

import { HttpClient, ITracker, RequestInfo, HttpClientError, HttpMethod, AxiosResponse } from '../src';

const PORT = process.env.PORT || 3334;
const globalApp = express();
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
        const client = new HttpClient('');
        should(client.urlBase).be.equal('');
    });


    it('construct-scope', () => {
        const client = new HttpClient('');
        should(client.urlBase).be.equal('');

        const subClient = client.scope('abc');
        should(subClient.urlBase).be.equal('abc');

        const subClient2 = subClient.scope('def');
        should(subClient2.urlBase).be.equal('abc/def');
    });


    it('get-query', () => {
        const client = new HttpClient(`http://localhost:${PORT}`);
        return client.get('/')
            .then(result => {
                should(result.data).be.equal('hello');
            })
    })

    it('post-no-data', () => {
        const client = new HttpClient(`http://localhost:${PORT}`);
        return client.post('/data')
            .then(result => {
                should(result.data).be.equal('none');
            })
    })

    it('post-with-data', () => {
        const client = new HttpClient(`http://localhost:${PORT}`);
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
        const client = new HttpClient(`http://localhost:${PORT}`);
        return client.execute(HttpMethod.GET, '/')
            .then(result => {
                should(result.data).be.equal('hello');
            })
    })

    it('get-query-tracker', () => {
        const tracker = new Tracker();
        const client = new HttpClient(`http://localhost:${PORT}`, {
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
 
    it('get-failure-connection-error', () => {
        const tracker = new Tracker();
        const client = new HttpClient(`http://localhost:111`, {
            tracker: tracker,
            retry: {
                initRetryDelay: 100
            }
        });
        let wasFailed = false;
        return client.get('/do-something')
            .catch(reason => {
                wasFailed = true;

                should(reason).be.ok();
                should(reason.name).be.equal('HttpClientError');
                should(reason.message).be.equal('connect ECONNREFUSED 127.0.0.1:111');
                should(reason.stack).be.String();
                should(reason.httpUrl).be.equal('http://localhost:111/do-something')
                should(reason.httpParams).be.eql({ })
                should(reason.httpMethod).be.equal('GET')
                should(reason.httpStatusCode).be.undefined();
                should(reason.httpStatusText).be.undefined();
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
     
    
    it('get-failure-404', () => {
        const tracker = new Tracker();
        const client = new HttpClient(`http://localhost:${PORT}/v1`, {
            tracker: tracker,
            retry: {
                initRetryDelay: 100
            }
        });
        let wasFailed = false;
        return client.post('/missing-url', { foo: 'bar' })
            .catch((reason : HttpClientError) => {
                wasFailed = true;

                should(reason).be.ok();
                should(reason.name).be.equal('HttpClientError');
                should(reason.message).be.equal('Request failed with status code 404');
                should(reason.stack).be.String();
                should(reason.httpUrl).be.equal(`http://localhost:${PORT}/v1/missing-url`)
                should(reason.httpParams).be.eql({ foo: 'bar' })
                should(reason.httpMethod).be.equal('POST')
                should(reason.httpStatusCode).be.equal(404);
                should(reason.httpStatusText).be.equal('Not Found');
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
        const client = new HttpClient(`http://localhost:${PORT}`, {
            tracker: tracker
        });
        const scopeClient = client.scope('foo');
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
        const client = new HttpClient(`http://localhost:111`, {
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
    public startCount = 0;
    public finishCount = 0;
    public failCount = 0;
    public tryAttemptCount = 0;
    public failedAttemptCount = 0;

    start(requestInfo : RequestInfo)
    {
        console.log('    [TRACKER::start] ', requestInfo.method, ' :: ', requestInfo.url);
        this.startCount++;
    }

    finish(requestInfo : RequestInfo, response: AxiosResponse)
    {
        console.log('    [TRACKER::finish] ', requestInfo.method, ' :: ', requestInfo.url);        
        this.finishCount++;
    }

    fail(requestInfo : RequestInfo, reason: HttpClientError)
    {
        console.error('    [TRACKER::fail] ', requestInfo.method, ' :: ', requestInfo.url , ' :: ', reason.message, ' :: ', reason.httpStatusCode);
        this.failCount++;
    }

    tryAttempt(requestInfo : RequestInfo)
    {
        console.info('        [TRACKER::tryAttempt] ', requestInfo.method, ' :: ', requestInfo.url);
        this.tryAttemptCount++;
    }

    failedAttempt(requestInfo : RequestInfo, reason: HttpClientError)
    {
        console.warn('            [TRACKER::failAttempt] ', requestInfo.method, ' :: ', requestInfo.url , ', status:', reason.httpStatusCode);
        this.failedAttemptCount++;
    }
}

interface Contact
{
    name: string,
    phone: string
}