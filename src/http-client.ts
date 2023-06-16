import _ from 'the-lodash';
import { MyPromise, RetryOptions, BlockingResolver, Resolvable } from 'the-promise';
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { ITracker } from './tracker';
import { IHttpClient, RequestInfo, ClientResponse, HttpMethod, HttpClientError } from './types'


export type AuthorizerCb = () => Resolvable<string>;

export interface HttpClientOptions
{
    timeout?: number,
    retry?: HttpClientRetryOptions;
    headers?: Record<string, string>;
    tracker?: Partial<ITracker>;
    absorbFailures?: boolean;

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
    canContinueCb?: (reason: HttpClientError, requestInfo : RequestInfo) => Resolvable<boolean>;
}

export class HttpClient implements IHttpClient
{
    private _urlBase: string | undefined;
    private _options: HttpClientOptions;
    private _retry: HttpClientRetryOptions;
    private _tracker: Partial<ITracker>;
    private _headers: Record<string, string>;
    private _authorizerResolver: BlockingResolver<string> | undefined = undefined;

    constructor(urlBase?: string, options?: Partial<HttpClientOptions>) {
        this._urlBase = urlBase;
        this._options = options || {};        
        this._retry = this._options.retry || {};
        this._tracker = this._options.tracker || {};
        if (this._options.headers) {
            this._headers = _.clone(this._options.headers);
        } else {
            this._headers = {};
        }
        this._headers["Content-Type"] = "application/json";

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
        const parts = [];
        if (this._urlBase) {
            parts.push(this._urlBase);
        }
        if (url) {
            parts.push(url);
        }
        const scopeUrl = parts.join('/');

        const scopeOptions : HttpClientOptions = {
            timeout: this._options.timeout,
            retry: this._retry,
            headers: this._headers,
            absorbFailures: this._options.absorbFailures,
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

    get<TResponse = any, TParams = Record<string, string>, TBody = Record<string, any> | null>
    (url: string, params?: TParams)
    {
        return this.execute<TResponse, TParams, TBody>(HttpMethod.GET, url, params, null);
    }

    delete<TResponse = any, TParams = Record<string, string>, TBody = Record<string, any> | null>
    (url: string, params?: TParams)
    {
        return this.execute<TResponse, TParams, TBody>(HttpMethod.DELETE, url, params, null);
    }

    post<TResponse = any, TParams = Record<string, string>, TBody = Record<string, any> | null>
    (url: string, params?: TParams, data?: TBody)
    {
        return this.execute<TResponse, TParams, TBody>(HttpMethod.POST, url, params, data);
    }

    patch<TResponse = any, TParams = Record<string, string>, TBody = Record<string, any> | null>
    (url: string, params?: TParams, data?: TBody)
    {
        return this.execute<TResponse, TParams, TBody>(HttpMethod.PATCH, url, params, data);
    }

    put<TResponse = any, TParams = Record<string, string>, TBody = Record<string, any> | null>
    (url: string, params?: TParams, data?: TBody)
    {
        return this.execute<TResponse, TParams, TBody>(HttpMethod.PUT, url, params, data);
    }

    options<TResponse = any, TParams = Record<string, string>, TBody = Record<string, any> | null>
    (url: string, params?: TParams, data?: TBody)
    {
        return this.execute<TResponse, TParams, TBody>(HttpMethod.OPTIONS, url, params, data);
    }

    async execute<TResponse = any, TParams = Record<string, string>, TBody = Record<string, any> | null>(
        method: HttpMethod,
        url: string,
        params?: TParams,
        data?: TBody | null,
        ) : Promise<ClientResponse<TResponse>>
    {
        let finalUrl = url;
        if (this._urlBase) {
            finalUrl = this._urlBase + finalUrl;
        }

        const requestInfo : RequestInfo = {
            id: uuidv4(),
            method: method,
            url: finalUrl,
            params: params,
            data: data as any,
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
            options.canContinueCb = async (reason) => {
                const myError = this._makeError(requestInfo, reason);
                return await this._retry.canContinueCb!(myError, requestInfo);
            };
        }

        if (this._tracker.start) {
            this._tracker.start(requestInfo);
        }

        return MyPromise.construct(async (resolve, reject) => {

            try
            {
                const result : ClientResponse<TResponse> = await MyPromise.retry(() => {
                    return this._executeSingle(requestInfo);
                }, options);
                resolve(result);
            }
            catch(reason)
            {
                const myError = this._makeError(requestInfo, reason);
                if (this._tracker.fail) {
                    this._tracker.fail(requestInfo, myError);
                }
                if (!this._options.absorbFailures) {
                    reject(myError);
                }
            }
            return null;
        });

        
    }

    private _makeError(requestInfo : RequestInfo, reason: any) : HttpClientError
    {
        const axiosError = <AxiosError>reason;
        
        const myError : HttpClientError = {
            name: 'HttpClientError',
            message: axiosError?.message,
            stack: reason?.stack,

            httpUrl: requestInfo.url,
            httpMethod: requestInfo.method!,
            httpParams: (requestInfo.params as Record<string, string>) ?? {},
            httpStatusCode: axiosError?.response?.status,
            httpStatusText: axiosError?.response?.statusText
        }

        return myError;
    }

    private _executeSingle<T>(requestInfo : RequestInfo)
    {
        const config: AxiosRequestConfig = {
            method: requestInfo.method,
            url: requestInfo.url
        };

        if (requestInfo.params) {
            config.params = requestInfo.params;
        }

        if (requestInfo.data) {
            config.data = requestInfo.data;
        }

        if (_.isNotNullOrUndefined(this._options.timeout)) {
            config.timeout = this._options.timeout!;
        }

        const headers = requestInfo.headers;
        return this._prepareHeaders(headers)
            .then(() => {
                config.headers = headers;
                if (this._tracker.tryAttempt) {
                    this._tracker.tryAttempt(requestInfo);
                }

                return axios(config);
            })
            .then((result: AxiosResponse<T>) => {

                if (this._tracker.finish) {
                    this._tracker.finish(requestInfo, result);
                }
                
                return result;
            })
            .catch((reason: AxiosError) => {

                const myError = this._makeError(requestInfo, reason);

                if (myError.httpStatusCode === 401) {
                    if (this._authorizerResolver) {
                        this._authorizerResolver.reset();
                    }
                }

                if (this._tracker.failedAttempt) {
                    this._tracker.failedAttempt(requestInfo, myError);
                }

                throw reason;
            });
    }

    private _prepareHeaders(headers : Record<string, string>) : Promise<void>
    {
        if (this._authorizerResolver) {
            return this._authorizerResolver.resolve()
                .then(auth => {
                    if (auth) { 
                        headers['Authorization'] = auth;
                    }
                });
        }
        return Promise.resolve();
    }
}