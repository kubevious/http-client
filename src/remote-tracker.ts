export interface IRemoteTracker
{
    start(action: string, options?: any) : RemoteTrackOperation;
}

export interface RemoteTrackOperation
{
    request: string,
    complete: () => void,
    fail: (error: any) => void,
}