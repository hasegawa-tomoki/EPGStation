import * as http from 'http';
import AuthService from '../auth/AuthService';

export default interface ISocketIOManageModel {
    initialize(servers: http.Server[]): void;
    notifyClient(): void;
    notifyUpdateEncodeProgress(): void;
    setAuthService(auth: AuthService): void;
}
