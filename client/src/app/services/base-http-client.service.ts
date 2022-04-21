import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { promisifyObservable } from '../utils';
import { HttpServerErrorResponse } from '../store/models';
import { AppState } from '../store/reducers';
import { userActions } from '../store/actions/user.actions';

interface HttpClientOptions {
    bearerToken?: string;
    [header: string]: any;
}

@Injectable({
    providedIn: 'root',
})
export class BaseHttpClient {
    constructor(public http: HttpClient, private store: Store<AppState>) {
        this.store.subscribe(state => (this.bearerToken = state.user?.accessToken));
    }

    bearerToken?: string = undefined;

    private _baseUrl = environment.SERVER_BASE_URL;
    get baseUrl() {
        return this._baseUrl;
    }

    /**
     * @param endpoint Note: needs to start with a slash
     * @param options The HTTP options to send with the request.
     * @see {@link HttpClient.get}: Look at **'this'.http.get** for more info
     */
    getAsync<T>(endpoint: string, options?: HttpClientOptions) {
        const res = this.get<T>(endpoint, options);
        return promisifyObservable(res, 'if error property exists');
    }
    /**
     * @param endpoint Note: needs to start with a slash
     * @param options The HTTP options to send with the request.
     * @see {@link HttpClient.get}: Look at **'this'.http.get** for more info
     */
    get<T = any>(endpoint: string, options?: HttpClientOptions): Observable<T> {
        const url = this._baseUrl + endpoint;
        options = this.sanitizeOptions(options);

        return this.http.get<T>(url, options as object).pipe(catchError(this.handleErrorWrapper));
    }

    /**
     * @param endpoint Note: needs to start with a slash
     * @param body
     * @param options The HTTP options to send with the request.
     * @see {@link HttpClient.post}: Look at **'this'.http.post** for more info
     */
    postAsync<T>(endpoint: string, body: any, options?: HttpClientOptions) {
        const res = this.post<T>(endpoint, body, options);
        return promisifyObservable(res, 'if error property exists');
    }
    /**
     * @param endpoint Note: needs to start with a slash
     * @param body
     * @param options The HTTP options to send with the request.
     * @see {@link HttpClient.post}: Look at **'this'.http.post** for more info
     */
    post<T>(endpoint: string, body: any, options?: HttpClientOptions): Observable<T> {
        const url = this._baseUrl + endpoint;
        options = this.sanitizeOptions(options);

        return this.http.post<T>(url, body || {}, options as object).pipe(catchError(this.handleErrorWrapper));
    }

    /**
     * @param endpoint Note: needs to start with a slash
     * @param body
     * @param options The HTTP options to send with the request.
     * @see {@link HttpClient.patch}: Look at **'this'.http.post** for more info
     */
    patch<T>(endpoint: string, body: any, options?: HttpClientOptions) {
        const url = this._baseUrl + endpoint;
        options = this.sanitizeOptions(options);

        return this.http.patch<T>(url, body, options as object).pipe(catchError(this.handleErrorWrapper));
    }

    delete<T>(endpoint: string, options?: HttpClientOptions): Observable<T> {
        const url = this._baseUrl + endpoint;
        options = this.sanitizeOptions(options);

        return this.http.delete<T>(url, options as object).pipe(catchError(this.handleErrorWrapper));
    }

    /** Moves the 'bearerToken' inside of 'headers' and returns an empty object if 'options' is undefined. */
    private sanitizeOptions(options: HttpClientOptions | undefined) {
        const getHeaders = (headers?: any) => ({
            ...(headers || {}),
            Authorization: `Bearer ${this.bearerToken}`,
        });

        if (options && this.bearerToken) options.headers = getHeaders(options.headers);
        else if (this.bearerToken) options = { headers: getHeaders() };

        if (options?.bearerToken) delete options.bearerToken;
        // if (options) {
        // 	const { bearerToken, ...options_ } = options;
        // 	if (bearerToken) {
        // 		options_.headers = {
        // 			...options_.headers,
        // 			Authorization: `Bearer ${bearerToken}`,
        // 		};
        // 	}
        // 	options = options_;
        // }
        // console.log('Http options:', options);
        return options || {};
    }

    private handleErrorWrapper = (err: HttpErrorResponse, _: Observable<any>) => this.handleError(err, _);
    private handleError(err: HttpErrorResponse, _caught: Observable<any>): Observable<HttpServerErrorResponse> {
        // caught.subscribe(data => console.log('caught:', data));
        console.warn('handleError(): An error occurred:', err.error);

        if (err.status === 0) {
            // A client-side or network error occurred. Handle it accordingly.
            return of({
                error: {
                    statusCode: 0,
                    message: 'A client-side or network error occurred.',
                    error: 'client-side or network error',
                },
            });
        } else {
            // The backend returned an unsuccessful response code.
            // The response body may contain clues as to what went wrong.
            // console.warn(
            // 	`handleError(): Server returned code ${err.status}, response body: `,
            // 	err.error,
            // );

            if (err.status == 401) {
                console.warn(401, 'unauthorized');
                this.store.dispatch(userActions.logout());
            }

            return of({
                error: err.error,
            } as HttpServerErrorResponse);
        }
        // Return an observable with a user-facing error message.
        return throwError('Something bad happened. Please try again later.');
    }
}
