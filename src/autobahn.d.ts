/*! Copyright (c) 2020 Siemens AG. Licensed under the MIT License. */

/*
 * Type definitions for npm package autobahn@20.4.1, see https://github.com/crossbario/autobahn-js.
 * 
 * Based on type definitions in @types/autobahn@18.10.0.
 */

declare module "autobahn" {

    /* tslint:disable:variable-name */

    declare class Session {
        id: number;
        realm: string;
        isOpen: boolean;
        features: any;
        caller_disclose_me: boolean;
        publisher_disclose_me: boolean;
        subscriptions: ISubscription[][];
        registrations: IRegistration[];

        onjoin: (roleFeatures: any) => void;
        onleave: (reason: string, details: any) => void;

        constructor(transport: ITransport, defer: DeferFactory, challenge: OnChallengeHandler);

        join(realm: string, authmethods: string[], authid: string): void;

        leave(reason: string, message: string): void;

        call<TResult>(procedure: string, args?: any[], kwargs?: any, options?: ICallOptions): Promise<TResult>;

        // Publication with acknowledgment by router.
        publish(topic: string, args?: any[], kwargs?: any, options?: IPublishOptions): Promise<IPublication>;

        // Publication without acknowledgment by router.
        publish(topic: string, args?: any[], kwargs?: any, options?: IPublishOptions): void;

        subscribe(topic: string, handler: SubscribeHandler, options?: ISubscribeOptions): Promise<ISubscription>;

        register(procedure: string, endpoint: RegisterEndpoint, options?: IRegisterOptions): Promise<IRegistration>;

        unsubscribe(subscription: ISubscription): Promise<boolean>;

        unregister(registration: IRegistration): Promise<any>;

        prefix(shortcut: string, uriPrefix: string): void;

        resolve(curie: string): string;

        log(...args: any[]);
    }

    interface IInvocation {
        caller?: number;
        progress?: (args: any[], kwargs: any) => void;
        procedure: string;
    }

    declare class Invocation implements IInvocation {
        procedure: string;

        constructor(caller?: number, progress?: boolean, procedure?: string);
    }

    interface IEvent {
        publication: number;
        publisher?: number;
        topic: string;
    }

    declare class Event implements IEvent {
        publication: number;
        topic: string;

        constructor(publication?: number, publisher?: string, topic?: string);
    }

    interface IResult {
        args: any[];
        kwargs: any;
    }

    declare class Result implements IResult {
        args: any[];
        kwargs: any;

        constructor(args?: any[], kwargs?: any);
    }

    interface IError {
        error: string;
        args: any[];
        kwargs: any;
    }

    declare class Error implements IError {
        error: string;
        args: any[];
        kwargs: any;

        constructor(error?: string, args?: any[], kwargs?: any);
    }

    type SubscribeHandler = (args: any[], kwargs: any, details: IEvent) => void;

    interface ISubscription {
        topic: string;
        handler: SubscribeHandler;
        options: ISubscribeOptions;
        session: Session;
        id: number;
        active: boolean;

        unsubscribe(): Promise<boolean>;
    }

    declare class Subscription implements ISubscription {
        topic: string;
        options: ISubscribeOptions;
        session: Session;
        id: number;
        active: boolean;

        handler: SubscribeHandler;

        constructor(topic?: string, handler?: SubscribeHandler, options?: ISubscribeOptions, session?: Session, id?: number);

        unsubscribe(): Promise<boolean>;
    }

    type RegisterEndpoint = (args?: any[], kwargs?: any, details?: IInvocation) => void;

    interface IRegistration {
        procedure: string;
        options: IRegisterOptions;
        session: Session;
        id: number;
        active: boolean;

        endpoint: RegisterEndpoint;

        unregister(): Promise<any>;
    }

    declare class Registration implements IRegistration {
        procedure: string;
        options: IRegisterOptions;
        session: Session;
        id: number;
        active: boolean;

        endpoint: RegisterEndpoint;

        constructor(procedure?: string, endpoint?: RegisterEndpoint, options?: IRegisterOptions, session?: Session, id?: number);

        unregister(): Promise<any>;
    }

    interface IPublication {
        id: number;
    }

    declare class Publication implements IPublication {
        id: number;

        constructor(id: number);
    }

    interface ICallOptions {
        timeout?: number;
        receive_progress?: boolean;
        disclose_me?: boolean;
    }

    interface IPublishOptions {
        acknowledge?: boolean;
        exclude?: number[];
        exclude_authid?: string[];
        exclude_authrole?: string[];
        eligible?: number[];
        eligible_authid?: string[];
        eligible_authrole?: string[];
        retain?: boolean;
        disclose_me?: boolean;
        exclude_me?: boolean;
    }

    interface ISubscribeOptions {
        match?: "prefix" | "wildcard" | string;
        get_retained?: boolean;
    }

    interface IRegisterOptions {
        disclose_caller?: boolean;
        invoke?: "single" | "roundrobin" | "random" | "first" | "last";
    }

    declare class Connection {
        readonly isConnected: boolean;
        readonly isOpen: boolean;
        readonly isRetrying: boolean;
        readonly transport: ITransport;
        readonly session?: Session;
        readonly defer?: DeferFactory;

        onopen: (session: Session, details: any) => void;
        onclose: (reason: string, details: any) => boolean;

        constructor(options?: IConnectionOptions);

        open(): void;
        close(reason?: string, message?: string): void;
    }

    interface TlsConfiguration {
        ca: Buffer | string;
        cert: Buffer | string;
        key: Buffer | string;
    }

    interface ITransportDefinition {
        type: TransportType;
        url?: string;
        protocols?: string[];
        serializers?: ISerializer[];
        tlsConfiguration?: TlsConfiguration;
    }

    type DeferFactory = () => Promise<any>;

    type OnChallengeHandler = (session: Session, method: string, extra: any) => string | Promise<string>;

    interface IConnectionOptions {
        realm: string;

        // use explicit deferred factory, e.g. jQuery.Deferred or Q.defer
        use_deferred?: DeferFactory;

        use_es6_promises?: boolean;
        transports?: ITransportDefinition[];
        retry_if_unreachable?: boolean;
        max_retries?: number;
        initial_retry_delay?: number;
        max_retry_delay?: number;
        retry_delay_growth?: number;
        retry_delay_jitter?: number;
        url?: string;
        protocols?: string[];
        authmethods?: string[];
        authid?: string;
        authextra?: any;

        autoping_interval?: number;
        autoping_timeout?: number;
        autoping_size?: number;

        serializers?: ISerializer[];

        tlsConfiguration?: TlsConfiguration;

        onchallenge?: OnChallengeHandler;
        on_user_error: (error: any, customErrorMessage: string) => void;
        on_internal_error: (error: any, customErrorMessage: string) => void;
    }

    interface ICloseEventDetails {
        wasClean: boolean;
        reason: string;
        code: number;
    }

    type TransportType = "websocket" | "longpoll" | "rawsocket" | string;

    interface ITransportInfo {
        url?: string;
        protocol?: string;
        type: TransportType;
    }

    interface ITransport {
        info: ITransportInfo;

        onopen: () => void;
        onclose: (details: ICloseEventDetails) => void;
        onmessage: (message: any[]) => void;

        send(message: any[]): void;
        close(errorCode: number, reason?: string): void;
    }

    interface ITransportFactory {
        type: TransportType;
        create(): ITransport;
    }

    type TransportFactoryFactory = new (options: any) => ITransportFactory;

    interface ITransports {
        register(name: TransportType, factory: TransportFactoryFactory): void;
        isRegistered(name: TransportType): boolean;
        get(name: TransportType): TransportFactoryFactory;
        list(): TransportType[];
    }

    interface ISerializer {
        serialize(obj: any): any;
        unserialize(payload: any): any;
    }

    declare class JSONSerializer implements ISerializer {
        constructor(replacer, reviver);

        serialize(obj: any): string;
        unserialize(payload: any): any;
    }

    declare class MsgpackSerializer implements ISerializer {
        constructor();

        serialize(obj: any): BufferList;
        unserialize(payload: any): any;
    }

    declare class CBORSerializer implements ISerializer {
        constructor();

        serialize(obj: any): Buffer;
        unserialize(payload: any): any;
    }

    interface ILog {
        debug(...args: any[]): void;
        warn(...args: any[]): void;
    }

    interface IUtil {
        assert(condition: boolean, message: string): void;
    }

    interface IAuthCra {
        derive_key(secret: string, salt: string, iterations: number, keylen: number): string;
        sign(key: string, challenge: string): string;
    }

    declare var util: IUtil;
    declare var log: ILog;
    declare var serializer: { JSONSerializer, MsgpackSerializer, CBORSerializer };
    declare var transports: ITransports;
    declare var auth_cra: IAuthCra;
}
