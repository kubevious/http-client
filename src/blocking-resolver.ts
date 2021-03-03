import _ from 'the-lodash';
import { Promise, Resolvable } from 'the-promise';

export type Callback<T> = () => T;

export class BlockingResolver<T>
{
    private _cb: Callback<T>;
    private _value: T | null = null;
    private _isBusy: boolean = false;

    private _resolveWaiters : ((thenableOrResult?: Resolvable<T>) => void)[] = [];
    private _rejectWaiters : ((error?: any) => void)[] = [];

    constructor(cb: Callback<T>)
    {
        this._cb = cb;
    }

    reset() {
        this._value = null;
    }

    resolve() : Promise<T>
    {
        if (_.isNotNullOrUndefined(this._value)) {
            return Promise.resolve(this._value!);
        }

        if (this._isBusy) {
            return Promise.construct<T>((resolve, reject) => {
                this._resolveWaiters.push(resolve);
                this._rejectWaiters.push(reject);
            })    
        }

        this._isBusy = true;
        return Promise.resolve()
            .then(() => this._cb())
            .then(result => {
                this._isBusy = false;

                const waiters = this._resolveWaiters;
                this._resolveWaiters = [];
                this._rejectWaiters = [];

                this._value = result;

                for(let waiter of waiters) {
                    waiter(result);
                }

                return result;
            })
            .catch(reason => {
                this._isBusy = false;

                const waiters = this._rejectWaiters;
                this._resolveWaiters = [];
                this._rejectWaiters = [];

                for(let waiter of waiters) {
                    waiter(reason);
                }
                
                throw reason;
            })
    }
}