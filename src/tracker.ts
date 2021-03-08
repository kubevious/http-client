import { AxiosResponse } from 'axios';
import { RequestInfo } from './http-client';
export interface ITracker
{
    start(requestInfo : RequestInfo) : void;
    finish(requestInfo : RequestInfo, response: AxiosResponse<any>) : void;
    fail(requestInfo : RequestInfo, reason: any) : void;

    tryAttempt(requestInfo : RequestInfo) : void;
    failedAttempt(requestInfo : RequestInfo, reason: any, data: any, status: number) : void;
}