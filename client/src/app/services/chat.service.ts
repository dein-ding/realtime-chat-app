import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HotToastService } from '@ngneat/hot-toast';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { Socket } from 'ngx-socket-io';
import { MonoTypeOperatorFunction, of, OperatorFunction, Subject } from 'rxjs';
import { catchError, filter, map, tap } from 'rxjs/operators';
import { Client_ChatMessagePayload } from 'src/shared/chat-event-payloads.model';
import { EventName, EventPayload, SocketEventPayloadAsFnMap } from 'src/shared/event-payload-map.model';
import { SocketEvents } from 'src/shared/socket-events.model';
import { chatsActions } from '../store/chats/chats.actions';
import { ChatRoomApiResponse, ChatRoomPreview, ChatsState, StoredChatMessage } from '../store/chats/chats.model';
import { handleError } from '../store/app.effects';
import { AppState } from '../store/app.reducer';
import { LoggedInUser } from '../store/user/user.model';
import { debounce, moveToMacroQueue } from '../utils';
import { BaseHttpClient } from './base-http-client.service';
import { SocketService } from './socket.service';
import { HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { HttpServerErrorResponse } from '../store/app.model';

@Injectable({
    providedIn: 'root',
})
export class ChatService {
    constructor(
        private socket: SocketService,
        private store: Store<AppState>,
        private httpClient: BaseHttpClient,
        private actions$: Actions,
        private toastService: HotToastService,
    ) {
        store.subscribe(state => {
            this.user = state.user.loggedInUser;
            this.chatState = state.chats;
        });
    }

    private chatState: ChatsState;
    private user: LoggedInUser | null;

    // own typing events
    private isTyping = false;
    private emitStopTypingDebounced = debounce(() => this.emitTyping(false), 2000);
    private emitTyping(isTyping: boolean) {
        this.socket.emit(SocketEvents.CLIENT__TYPING_EVENT, { isTyping, chatId: this.chatState.activeChatId! });
        this.isTyping = isTyping;
    }
    typingHandler() {
        if (!this.user) return;

        if (!this.isTyping) this.emitTyping(true);

        this.emitStopTypingDebounced();
    }

    // users typing
    private usersTypingForActiveChat = new Subject<string[]>();
    getUsersTyping() {
        return this.usersTypingForActiveChat.asObservable();
    }
    private usersTypingMap: { [chatId: string]: string[] } = {};
    private usersTypingEvents = this.socket
        .fromEvent(SocketEvents.SERVER__TYPING_EVENT)
        .pipe(
            tap(({ username, isTyping, chatId }) => {
                if (isTyping) this.usersTypingMap[chatId] = [...(this.usersTypingMap[chatId] || []), username];
                else this.usersTypingMap[chatId] = (this.usersTypingMap[chatId] || []).filter(u => u != username);
            }),
            filter(({ chatId }) => chatId == this.chatState.activeChatId),
        )
        .subscribe(({ chatId }) => this.usersTypingForActiveChat.next(this.usersTypingMap[chatId] || []));

    // users online
    private usersOnlineForActiveChat = new Subject<string[]>();
    getUsersOnline() {
        return this.usersOnlineForActiveChat.asObservable().pipe(map(usersOnline => ['You', ...usersOnline]));
    }
    private usersOnlineMap: { [chatId: string]: string[] } = {};
    private usersOnlineEvents = this.socket
        .fromEvent(SocketEvents.SERVER__USERS_ONLINE)
        .pipe(
            tap(({ chatId, usersOnline }) => {
                this.usersOnlineMap[chatId] = usersOnline;
            }),
            filter(({ chatId }) => chatId == this.chatState.activeChatId),
        )
        .subscribe(({ usersOnline }) => this.usersOnlineForActiveChat.next(usersOnline));

    private setActiveChatEvents = this.actions$.pipe(ofType(chatsActions.setActiveChatSuccess)).subscribe(({ chatId }) => {
        this.usersOnlineForActiveChat.next(this.usersOnlineMap[chatId] || []);
        this.usersTypingForActiveChat.next(this.usersTypingMap[chatId] || []);
    });

    sendMessage(payload: Client_ChatMessagePayload) {
        if (!this.user) return;

        moveToMacroQueue(() => this.emitTyping(false));
        this.socket.emit(SocketEvents.CLIENT__CHAT_MESSAGE, payload);
    }
    getChatMessageUpdates() {
        return this.socket.fromEvent(SocketEvents.SERVER__CHAT_MESSAGE).pipe(
            tap(payload => this.store.dispatch(chatsActions.newMessage(payload))),
            filter(({ chatId }) => chatId == this.chatState.activeChatId),
        );
    }

    getChatInitializationUpdates() {
        return this.actions$.pipe(
            ofType(chatsActions.loadActiveChatMessagesSuccess),
            map(({ messages }) => messages),
        );
    }

    // this is later also gonna contain join, leave, etc. events
    getUserEvents() {
        return this.socket
            .fromEvent(SocketEvents.SERVER__USER_ONLINE_STATUS_EVENT)
            .pipe(filter(({ chatIds }) => chatIds.some(id => id == this.chatState.activeChatId)));
    }

    // CRUD stuff
    getChat(chatId: string) {
        return this.httpClient.get<ChatRoomApiResponse>('/chats/chat/' + chatId);
    }
    getChatMessages(chatId: string) {
        return this.httpClient
            .get<StoredChatMessage[]>(`/chats/chat/${chatId}/messages`, {
                reportProgress: true,
                observe: 'events',
            } as any)
            .pipe(...this.reportProgress<StoredChatMessage[]>(progress => console.log('download messages:', progress)));
    }
    private reportProgress<T>(
        cb: (progress: number) => void,
    ): [
        MonoTypeOperatorFunction<T | HttpServerErrorResponse>,
        MonoTypeOperatorFunction<T | HttpServerErrorResponse>,
        OperatorFunction<T | HttpServerErrorResponse, NonNullable<T>>,
    ] {
        return [
            tap(event => {
                if ((event as unknown as HttpEvent<T>).type === HttpEventType.DownloadProgress) {
                    const progress = ((event as any).loaded / (event as any).total) * 100;
                    cb(progress);
                }
            }),
            filter(event => (event as unknown as HttpEvent<T>).type === HttpEventType.Response),
            map(res => (res as unknown as HttpResponse<T>).body!),
        ];
    }

    createChat(title: string) {
        return this.httpClient.post<ChatRoomPreview>('/chats/chat', { title });
    }

    getJoinedChats() {
        return this.httpClient.get<ChatRoomPreview[]>('/chats/joined');
    }

    getGlobalChatPreview() {
        return this.httpClient.get<ChatRoomPreview>('/chats/globalChat');
    }

    // TODO: this should be more generic and also inside the effects
    joinGlobalChat() {
        return this.httpClient
            .post<{ successMessage: string; chatRoom: ChatRoomPreview }>('/chats/globalChat/join')
            .subscribe(chatRoomResOrError => {
                console.log(chatRoomResOrError);
                const action = handleError(chatRoomResOrError, chatRoomRes => {
                    this.toastService.success(`Successfully joined chat '${chatRoomRes.chatRoom.title}'`);
                    return chatsActions.joinChatSuccess({ chat: chatRoomRes.chatRoom });
                });
                this.store.dispatch(action);
            });
    }
}
