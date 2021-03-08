import _ from 'the-lodash';
import { Promise, RetryOptions, BlockingResolver } from 'the-promise';
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { IRemoteTracker, RemoteTrackOperation } from './remote-tracker';

export type AuthorizerCb = () => string;

export interface HttpClientOptions
{
    retry: RetryOptions
}

export class HttpClient
{
    private _urlBase: string;
    private _remoteTracker?: IRemoteTracker;
    private _headers: Record<string, string>;
    private _cb: BlockingResolver<string> | null = null;

    constructor(urlBase: string, remoteTracker?: IRemoteTracker, headers?: Record<string, string>) {
        this._urlBase = urlBase;
        this._remoteTracker = remoteTracker;
        if (headers) {
            this._headers = _.clone(headers);
        } else {
            this._headers = {};
        }
    }

    header(name: string, value: string)
    {
        this._headers[name] = value;
        return this;
    }

    setupAuthorizer(cb: AuthorizerCb)
    {
        this._cb = new BlockingResolver<string>(cb);
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
        return Promise.retry(() => {
            return this._executeSingle(method, url, params, data);
        })
    }

    private _executeSingle<T>(
            method: AxiosRequestConfig['method'],
            url: string,
            params?: Record<string, string> | unknown,
            data?: Record<string, any> | null,
        )
    {
        if (this._urlBase) {
            url = this._urlBase + url;
        }

        const config: AxiosRequestConfig = {
            method: method,
            url: url,
            headers: this._headers,
        };

        let headers : Record<string, string>;
        if (this._headers) {
            headers = _.clone(this._headers);
        } else {
            headers = {};
        }

        if (params) {
            config.params = params;
        }

        if (data) {
            config.data = data;
        }

        let operation : RemoteTrackOperation | null = null;
        if (this._remoteTracker) {
            operation = this._remoteTracker.start(`${config.method!.toUpperCase()}::${config.url}`, config);
        }

        return Promise.resolve()
            .then(() => this._prepareHeaders(headers))
            .then(() => axios(config))
            .then((result: AxiosResponse<T>) => {
                if (operation) {
                    operation.complete();
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
                    if (this._cb) {
                        this._cb.reset();
                    }
                }
                if (operation) {
                    operation.fail({
                        data,
                        status,
                    });
                }
                throw reason;
            });
    }

    private _prepareHeaders(headers : Record<string, string>)
    {
        if (this._cb) {
            return this._cb.resolve()
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