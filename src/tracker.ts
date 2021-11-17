import { AxiosResponse } from 'axios';
import { HttpClientError } from '.';
import { RequestInfo } from './types';
export interface ITracker
{
    start(requestInfo : RequestInfo) : void;
    finish(requestInfo : RequestInfo, response: AxiosResponse) : void;
    fail(requestInfo : RequestInfo, reason: HttpClientError) : void;

    tryAttempt(requestInfo : RequestInfo) : void;
    failedAttempt(requestInfo : RequestInfo, reason: HttpClientError) : void;
}