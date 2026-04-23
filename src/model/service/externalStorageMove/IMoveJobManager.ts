import * as apid from '../../../../api';

export interface MoveJobOption {
    recordedIds: apid.RecordedId[];
    storageName: string;
    subDirectory?: string | null;
}

export interface MoveJobError {
    recordedId: apid.RecordedId;
    message: string;
}

export interface MoveJob {
    id: string;
    storageName: string;
    subDirectory: string | null;
    recordedIds: apid.RecordedId[];
    status: 'pending' | 'running' | 'completed' | 'cancelled' | 'error';
    processed: number;
    total: number;
    currentRecordedId: apid.RecordedId | null;
    successIds: apid.RecordedId[];
    errors: MoveJobError[];
    cancelRequested: boolean;
    createdAt: number;
    startedAt: number | null;
    finishedAt: number | null;
}

export default interface IMoveJobManager {
    submit(option: MoveJobOption): MoveJob;
    list(limit?: number): MoveJob[];
    get(id: string): MoveJob | null;
    cancel(id: string): boolean;
}
