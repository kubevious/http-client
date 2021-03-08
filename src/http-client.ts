import _ from 'the-lodash';
import { Promise, RetryOptions, BlockingResolver, Resolvable } from 'the-promise';
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { ITracker } from './tracker';

export type AuthorizerCb = () => string;

export interface HttpClientOptions
{
    retry?: HttpClientRetryOptions;
    headers?: Record<string, string>;
    tracker?: Partial<ITracker>;

    authorizerCb?: AuthorizerCb;
    authorizerResolverCb?: BlockingResolver<string>;
}

export interface HttpClientRetryOptions
{
    unlimitedRetries?: boolean;
    retryCount?: number;
    initRetryDelay?: number;
    maxRetryDelay?: number;
    retryDelayCoeff?: number;
    canContinueCb?: (reason: any, requestInfo : RequestInfo) => Resolvable<boolean>;
}

export class HttpClient
{
    private _urlBase: string;
    private _options: HttpClientOptions;
    private _retry: HttpClientRetryOptions;
    private _tracker: Partial<ITracker>;
    private _headers: Record<string, string>;
    private _authorizerResolver: BlockingResolver<string> | undefined = undefined;

    constructor(urlBase: string, options?: Partial<HttpClientOptions>) {
        this._urlBase = urlBase;
        this._options = options || {};        
        this._retry = this._options.retry || {};
        this._tracker = this._options.tracker || {};
        if (this._options.headers) {
            this._headers = _.clone(this._options.headers);
        } else {
            this._headers = {};
        }
        if (this._options.authorizerResolverCb) {
            this._authorizerResolver = this._options.authorizerResolverCb;
        } else {
            if (this._options.authorizerCb) {
                this._authorizerResolver = new BlockingResolver(this._options.authorizerCb);
            }
        }
    }

    get urlBase() {
        return this._urlBase;
    }

    scope(url: string) {
        let parts = [];
        if (this._urlBase) {
            parts.push(this._urlBase);
        }
        if (url) {
            parts.push(url);
        }
        const scopeUrl = parts.join('/');

        const scopeOptions : HttpClientOptions = {
            retry: this._retry,
            headers: this._headers,
            tracker: this._tracker,
            authorizerResolverCb: this._authorizerResolver
        }

        return new HttpClient(scopeUrl, scopeOptions);
    }

    header(name: string, value: string)
    {
        this._headers[name] = value;
        return this;
    }

    get<T>(url: string, params?: Record<string, string> | unknown) {
        return this._execute<T>('get', url, params, null);
    }

    delete<T>(url: string, params?: Record<string, string> | unknown) {
        return this._execute<T>('delete', url, params, null);
    }

    post<T>(url: string, data: Record<string, any>, params?: Record<string, string>) {
        return this._execute<T>('post', url, params, data);
    }

    put<T>(url: string, data: Record<string, any>, params: Record<string, string>) {
        return this._execute<T>('put', url, params, data);
    }

    options<T>(url: string, data: Record<string, any>, params: Record<string, string>) {
        return this._execute<T>('options', url, params, data);
    }

    private _execute<T>(
        method: AxiosRequestConfig['method'],
        url: string,
        params?: Record<string, string> | unknown,
        data?: Record<string, any> | null,
        ) : Promise<ClientResponse<T>>
    {
        const requestInfo : RequestInfo = {
            id: uuidv4(),
            method: method,
            url: url,
            params: params,
            data: data,
            headers: this._headers ? _.clone(this._headers) : {}
        }

        const options : RetryOptions = {
            unlimitedRetries: this._retry.unlimitedRetries,
            retryCount: this._retry.retryCount,
            initRetryDelay: this._retry.initRetryDelay,
            maxRetryDelay: this._retry.maxRetryDelay,
            retryDelayCoeff: this._retry.retryDelayCoeff,
        }

        if (this._retry.canContinueCb)
        {
            options.canContinueCb = (reason) => {
                return this._retry.canContinueCb!(reason, requestInfo);
            };
        }

        if (this._tracker.start) {
            this._tracker.start(requestInfo);
        }

        return Promise.retry<ClientResponse<T>>(() => {
            return this._executeSingle(requestInfo);
        }, options)
        .catch(reason => {
            if (this._tracker.fail) {
                this._tracker.fail(requestInfo, reason);
            }
            throw reason;
        })
    }

    private _executeSingle<T>(requestInfo : RequestInfo)
    {
        let url = requestInfo.url;
        if (this._urlBase) {
            url = this._urlBase + url;
        }

        const config: AxiosRequestConfig = {
            method: requestInfo.method,
            url: url,
            headers: requestInfo.headers,
        };

        let headers : Record<string, string>;
        if (this._headers) {
            headers = _.clone(this._headers);
        } else {
            headers = {};
        }

        if (requestInfo.params) {
            config.params = requestInfo.params;
        }

        if (requestInfo.data) {
            config.data = requestInfo.data;
        }

        if (this._tracker.tryAttempt) {
            this._tracker.tryAttempt(requestInfo);
        }

        return Promise.resolve()
            .then(() => this._prepareHeaders(headers))
            .then(() => axios(config))
            .then((result: AxiosResponse<T>) => {

                if (this._tracker.finish) {
                    this._tracker.finish(requestInfo, result);
                }
                
                return result;
            })
            .catch((reason: AxiosError<any>) => {

                let data = reason.message;
                let status = 0;
                if (reason.response) {
                    data = reason.response.data;
                    status = reason.response.status;
                }
                if (status == 401) {
                    if (this._authorizerResolver) {
                        this._authorizerResolver.reset();
                    }
                }

                if (this._tracker.failedAttempt) {
                    this._tracker.failedAttempt(requestInfo, reason, data, status);
                }

                throw reason;
            });
    }

    private _prepareHeaders(headers : Record<string, string>)
    {
        if (this._authorizerResolver) {
            return this._authorizerResolver.resolve()
                .then(auth => {
                    if (auth) { 
                        headers['Authorization'] = auth;
                    }
                });
        }
    }
}

export interface ClientResponse<T>
{
    data: T;
    status: number;
    statusText: string;
}

export interface RequestInfo
{
    id: string,
    method: AxiosRequestConfig['method'],
    url: string,
    params?: Record<string, string> | unknown,
    data?: Record<string, any> | null,
    headers : Record<string, string>
}