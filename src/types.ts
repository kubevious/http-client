import { AxiosRequestConfig, AxiosError } from 'axios';

export enum HttpMethod
{
    GET = 'GET',
    POST = 'POST',
    DELETE = 'DELETE',
    PUT = 'PUT',
    OPTIONS = 'OPTIONS',
    HEAD = 'HEAD'
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

export interface IHttpClient
{
    header(name: string, value: string) : IHttpClient

    get<TResponse = any, TParams = Record<string, string>, TBody = Record<string, any> | null>
    (url: string, params?: TParams) : Promise<ClientResponse<TResponse>>

    delete<TResponse = any, TParams = Record<string, string>, TBody = Record<string, any> | null>
    (url: string, params?: TParams) : Promise<ClientResponse<TResponse>>;

    post<TResponse = any, TParams = Record<string, string>, TBody = Record<string, any> | null>
    (url: string, params?: TParams, data?: TBody) : Promise<ClientResponse<TResponse>>;

    put<TResponse = any, TParams = Record<string, string>, TBody = Record<string, any> | null>
    (url: string, params?: TParams, data?: TBody) : Promise<ClientResponse<TResponse>>;

    options<TResponse = any, TParams = Record<string, string>, TBody = Record<string, any> | null>
    (url: string, params?: TParams, data?: TBody) : Promise<ClientResponse<TResponse>>;

    execute<TResponse = any, TParams = Record<string, string>, TBody = Record<string, any> | null>(
        method: HttpMethod,
        url: string,
        params?: TParams,
        data?: TBody | null,
        ) : Promise<ClientResponse<TResponse>>;
    
}

export interface HttpClientError extends Error
{
    httpStatusCode?: number;
    httpStatusText?: string;

    sourceError?: AxiosError; 
}
