/*! Copyright (c) 2020 Siemens AG. Licensed under the MIT License. */

import { Connection, IConnectionOptions, IEvent, ISubscription, log as autobahnLog, serializer, Session } from "autobahn";

import {
    CommunicationBinding,
    CommunicationBindingJoinOptions,
    CommunicationBindingLogLevel,
    CommunicationBindingOptions,
    CommunicationBindingWithOptions,
    CommunicationEventLike,
    CommunicationEventType,
    CommunicationState,
} from "@coaty/core";

import { WampTopic } from "./wamp-topic";

// Enable autobahn warnings only if global variable `AUTOBAHN_WARN` has been set
// to true.
if (!("AUTOBAHN_WARN" in global && global["AUTOBAHN_WARN"])) {
    // tslint:disable-next-line: no-empty
    autobahnLog.warn = () => { };
}

/**
 * Options provided by the WAMP communication binding.
 */
export interface WampBindingOptions extends CommunicationBindingOptions {

    /**
     * Connection Url to WAMP router (schema `protocol://host:port/path`, e.g.
     * `ws://localhost:8080/ws`).
     *
     * Supported protocols include WebSocket transports `ws` and `wss`. The path
     * can be configured on your WAMP router which allows serving different Web
     * assets under different paths on the same host IP.
     */
    routerUrl: string;

    /**
     * The WAMP realm, a routing namespace and an administrative domain for WAMP
     * (optional).
     *
     * If not specified, the default realm is "coaty".
     *
     * Specify your own realm, if you want to configure your WAMP router with
     * custom realm roles and permissions different from the default realm.
     */
    realm?: string;

    /**
     * The authentication ID for WAMP "cryptosign" authentication method
     * (optional).
     * 
     * Not needed for default "anonymous" authentication method.
     */
    authId?: string;

    /**
     * A challenge function called by binding when WAMP router sends a challenge
     * (optional).
     */
    onChallenge?: (session: Session, method: string, extra: any) => string | Promise<string>;

    /**
     * TLS client authentication options (optional).
     *
     * @remarks This option is only applicable on secure websocket transports
     * (wss) where the underlying platform is Node.js / Electron.
     */
    tlsOptions?: {

        /**
         * Trusted CA certificate.
         */
        ca: Buffer | string,

        /**
         * Certificate Public Key.
         */
        cert: Buffer | string,

        /**
         * Certificate Private Key.
         */
        key: Buffer | string;
    };

    /**
     * Enables automatic reconnect if host is unreachable (optional).
     * 
     * Defaults to true.
     */
    retryIfUnreachable?: boolean;

    /**
     * Maximum number of reconnection attempts (optional).
     * 
     * Defaults to 15. Unlimited if set to -1.
     */
    maxRetries?: number;

    /**
     * Initial delay for reconnection attempt in seconds (optional).
     * 
     * Defaults to 1.5.
     */
    initialRetryDelay?: number;

    /** 
     * Maximum delay for reconnection attempts in seconds (optional).
     *
     * Defaults to 300.
     */
    maxRetryDelay?: number;

    /**
     * The growth factor applied to the retry delay between reconnection
     * attempts (optional).
     *
     * Defaults to 1.5.
     */
    retryDelayGrowth?: number;

    /**
     * The standard deviation of a Gaussian to jitter the delay on each retry
     * cycle as a fraction of the mean (optional).
     *
     * Defaults to 0.1.
     */
    retryDelayJitter?: number;

    /**
     * Seconds between automatic pings (optional).
     * 
     * Defaults to 10 secs.
     *
     * @remarks This option is only applicable on websocket transports where
     * the underlying platform is Node.js / Electron.
     */
    autoPingInterval?: number;

    /**
     * Seconds until a ping is considered timed out (optional).
     * 
     * Defaults to 5 secs.
     *
     * @remarks This option is only applicable on websocket transports where
     * the underlying platform is Node.js / Electron.
     */
    autoPingTimeout?: number;

    /**
     * Number of bytes of random data to send in ping messages, must be between
     * 4 and 125 (optional).
     *
     * Defaults to 4.
     *
     * @remarks This option is only applicable on websocket transports where
     * the underlying platform is Node.js / Electron.
     */
    autoPingSize?: number;
}

/**
 * Defines a communication binding for transmitting Coaty communication events
 * via the WAMP publish-subscribe messaging protocol.
 *
 * This binding is compatible with any WAMP router that supports the WAMP v2
 * protocol.
 *
 * This binding provides the following WAMP specific publication options for Raw
 * events:
 * - retain: false | true (defaults to false)
 * - acknowledge: false | true (defaults to false)
 *
 * This binding provides the following WAMP specific subscription options for
 * Raw events:
 * - match: "exact" | "prefix" | "wildcard" (defaults to "exact")
 *
 * @remarks To enable debug mode of the underlying `autobahn` library, set
 * global variable `AUTOBAHN_DEBUG` to true *before* loading this binding.
 * Likewise, to enable output of warnings of the underlying `autobahn` library,
 * set global variable `AUTOBAHN_WARN` to true.
 */
export class WampBinding extends CommunicationBinding<WampBindingOptions> {

    private _joinOptions: CommunicationBindingJoinOptions;
    private _pendingPublicationItems: PublicationItem[];
    private _issuedSubscriptionItems: SubscriptionItem[];
    private _isPublishingDeferred: boolean;
    private _connection: Connection;
    private _sessionIdLogItem: string;

    /**
     * Provides the WAMP binding with application-specific options as value of the
     * `CommunicationOptions.binding` property in the agent container configuration.
     *
     * To be used as follows:
     *
     * ```ts
     * import { WampBinding } from "@coaty/binding.wamp";
     *
     * const configuration: Configuration = {
     *   ...
     *   communication: {
     *       binding: WampBinding.withOptions({
     *           routerUrl: ... ,
     *           ...
     *       }),
     *       ...
     *   },
     *   ...
     * };
     * ```
     *
     * @param options options available for WAMP binding
     */
    static withOptions(options: WampBindingOptions): CommunicationBindingWithOptions<WampBinding, WampBindingOptions> {
        return { type: WampBinding, options };
    }

    /* Communication Binding Protocol */

    get apiName(): string {
        return "WAMP";
    }

    get apiVersion() {
        return 1;
    }

    createIoRoute(ioSourceId: string) {
        return WampTopic.getTopicName(
            this.apiVersion,
            this.options.namespace,
            CommunicationEventType.IoValue,
            undefined,
            ioSourceId,
            undefined,
        );
    }

    /* Communication Binding Protocol Handlers */

    protected onInit() {
        this._reset();
    }

    protected onJoin(joinOptions: CommunicationBindingJoinOptions) {
        this._joinOptions = joinOptions;

        // Set up WAMP connection and session.

        // Provide connection info and options for autobahn-js client. Note:
        // @types/autobahn declarations are not up to date. Some options are
        // missing.
        const connectionOptions: IConnectionOptions = {
            realm: this.options.realm || "coaty",

            // Do not use JSON serializer as it will serialize binary data
            // (Uint8Array or Buffer) to a JSON object so binary data is not
            // preserved. That's because autobahn-js doesn't implement the
            // conversion algorithm for binary data to JSON strings as described
            // in the WAMP protocol specification:
            // https://wamp-proto.org/_static/gen/wamp_latest.html#json
            //
            // Use msgpack5 serializer as it preserves binary data (a serialized
            // Uint8Array is returned as Buffer in Node.js) and as it also
            // supports serialization coercion by WAMP routers such as crossbar
            // (for MQTT bridging).
            transports: [{
                type: "websocket",
                url: this.options.routerUrl,
                serializers: [new serializer.MsgpackSerializer()],
                tlsConfiguration: this.options.tlsOptions,
            }],

            // Do not use the when Promise implementation (no need for Progressive Call Results).
            use_es6_promises: true,

            authid: this.options.authId,

            onchallenge: this.options.onChallenge,

            retry_if_unreachable: this.options.retryIfUnreachable ?? true,
            max_retries: this.options.maxRetries,
            initial_retry_delay: this.options.initialRetryDelay,
            max_retry_delay: this.options.maxRetryDelay,
            retry_delay_growth: this.options.retryDelayGrowth,
            retry_delay_jitter: this.options.retryDelayJitter,

            autoping_interval: this.options.autoPingInterval,
            autoping_timeout: this.options.autoPingTimeout,
            autoping_size: this.options.autoPingSize,

            on_user_error: (error: any, customErrorMessage: string) =>
                this.log(CommunicationBindingLogLevel.error, customErrorMessage, " ", this._error(error)),

            on_internal_error: (error: any, customErrorMessage: string) =>
                this.log(CommunicationBindingLogLevel.error, customErrorMessage, " ", this._error(error)),
        };

        this._connection = new Connection(connectionOptions);

        // Fired on successful (re)-connection. The passed-in session is created anew each time.
        this._connection.onopen = (session, details) => {
            try {
                this._sessionIdLogItem = `[${session.id}] `;
                this.log(CommunicationBindingLogLevel.info, "Connection opened on protocol ",
                    this._connection.transport.info.protocol, " to ", this._connection.transport.info.url);
                if (this.options.logLevel === CommunicationBindingLogLevel.debug) {
                    this.log(CommunicationBindingLogLevel.debug, "Session opened on realm '", session.realm,
                        "' with details: ", JSON.stringify(details));
                } else {
                    this.log(CommunicationBindingLogLevel.info, "Session opened on realm '", session.realm, "'");
                }
                this.emit("communicationState", CommunicationState.Online);

                // Ensure testaments are announced to router.
                this._addSessionTestaments(session);

                // Ensure all issued subscription items are (re)subscribed.
                this._subscribeItems(this._issuedSubscriptionItems);

                // Ensure join events are published first on (re)connection in the given order.
                const joinEvents = this._joinOptions.joinEvents;
                for (let i = joinEvents.length - 1; i >= 0; i--) {
                    this._addPublicationItem(joinEvents[i], true, true);
                }

                // Start emitting all deferred offline publications.
                this._drainPublications();
            } catch (error) {
                // Websocket library can throw "Error: not opened" in case the connection is
                // just connected and session is opened, and one of the synchronous
                // initialization functions (e.g. adding testaments) are ongoing, but
                // connection.close() by unjoin method has been invoked in the meantime. This
                // can happen e.g. on Container.resolve(...).shutdown(). Note that afterwards,
                // connection.onclose is never called.
                // 
                // This kind of error should not be dispatched as a user_error but silently ignored.
                this._reset();
            }
        };

        // Fired when the connection has been closed explicitly, was lost or
        // could not be established in the first place.
        this._connection.onclose = (reason: "closed" | "lost" | "unreachable" | "unsupported", details) => {
            switch (reason) {
                case "closed":
                    this.log(CommunicationBindingLogLevel.info, "Connection closed: unjoin");
                    this._reset();
                    break;
                case "lost":
                    this.log(CommunicationBindingLogLevel.info, "Connection closed: lost");
                    // Keep issued publications and subscriptions for retry.
                    this._resetSession();
                    break;
                case "unreachable":
                    this.log(CommunicationBindingLogLevel.info, "Connection closed: routerUrl invalid or unreachable");
                    this._reset();
                    break;
                case "unsupported":
                    this.log(CommunicationBindingLogLevel.info, "Connection closed: no WebSocket transport could be created");
                    this._reset();
                    break;
                default:
                    this.log(CommunicationBindingLogLevel.info, "Connection closed: ", reason);
                    this._reset();
                    break;
            }

            // Do not cancel any subsequent retry attempt in case connection was lost.
            return false;
        };

        this.log(CommunicationBindingLogLevel.info, "Connecting to ", this.options.routerUrl);

        this._connection.open();
    }

    protected onUnjoin() {
        if (!this._connection?.isConnected) {
            this._reset();
            return Promise.resolve();
        }

        // No need to explicitely unsubscribe issued subscriptions as the WAMP router
        // session will be destroyed. No need to publish the Unjoin event as testaments
        // have been set up in the router so that they are also executed when the WAMP
        // session is detached by closing the connection normally.
        this._connection.close();

        // Delay resolving returned promise on the next iteration of the event loop so
        // that log messages and errors emitted by the binding's event emitter are
        // dispatched.
        return new Promise<void>(resolve => {
            setImmediate(() => resolve());
        });
    }

    protected onPublish(eventLike: CommunicationEventLike) {
        // Check whether raw topic is in a valid format; otherwise ignore it.
        if (eventLike.eventType === CommunicationEventType.Raw &&
            (WampTopic.isCoatyTopicLike(eventLike.eventTypeFilter) ||
                !WampTopic.isValidTopic(eventLike.eventTypeFilter, false))) {
            this.log(CommunicationBindingLogLevel.error, "Raw publication topic is invalid: ", eventLike.eventTypeFilter);
            return;
        }

        this._addPublicationItem(eventLike);
        this._drainPublications();
    }

    protected onSubscribe(eventLike: CommunicationEventLike) {
        // Check whether raw topic is in a valid format; otherwise ignore it.
        if (eventLike.eventType === CommunicationEventType.Raw &&
            (WampTopic.isCoatyTopicLike(eventLike.eventTypeFilter) ||
                !WampTopic.isValidTopic(eventLike.eventTypeFilter, true))) {
            this.log(CommunicationBindingLogLevel.error, "Raw subscription topic is invalid: ", eventLike.eventTypeFilter);
            return;
        }

        // Check whether IO route is in a valid format; otherwise ignore it. Since the
        // IO route topic name is used both for publication and subscription it must
        // must not be pattern-based.
        if (eventLike.eventType === CommunicationEventType.IoValue &&
            ((eventLike.isExternalIoRoute && WampTopic.isCoatyTopicLike(eventLike.eventTypeFilter)) ||
                !WampTopic.isValidTopic(eventLike.eventTypeFilter, false))) {
            this.log(CommunicationBindingLogLevel.error, "IO route topic is invalid: ", eventLike.eventTypeFilter);
            return;
        }

        this._addSubscriptionItem(eventLike);
    }

    protected onUnsubscribe(eventLike: CommunicationEventLike) {
        this._removeSubscriptionItem(eventLike);
    }

    protected log(logLevel: CommunicationBindingLogLevel, arg1: string, arg2?: any, arg3?: any, arg4?: any) {
        super.log(logLevel, this._sessionIdLogItem, arg1, arg2, arg3, arg4);
    }

    /* Private */

    private _error(error: any) {
        if (typeof error === "object" && !(error instanceof Error)) {
            // Stringify autobahn errors caught in rejected promises to make
            // them inspectable in the log output.
            return JSON.stringify(error);
        }
        return error;
    }

    private _reset() {
        this._connection = undefined;
        this._joinOptions = undefined;
        this._isPublishingDeferred = true;
        this._pendingPublicationItems = [];
        this._issuedSubscriptionItems = [];
        this._resetSession();
    }

    private _resetSession() {
        this._sessionIdLogItem = "[---] ";
        this._issuedSubscriptionItems?.forEach(i => delete i.subscription);
        this.emit("communicationState", CommunicationState.Offline);
    }

    private _getTopicFor(eventLike: CommunicationEventLike) {
        if (eventLike.eventType === CommunicationEventType.Raw) {
            return eventLike.eventTypeFilter;
        }
        if (eventLike.eventType === CommunicationEventType.IoValue) {
            return eventLike.eventTypeFilter;
        }
        return WampTopic.getTopicName(
            this.apiVersion,
            this.options.namespace,
            eventLike.eventType,
            eventLike.eventTypeFilter,
            eventLike.sourceId,
            eventLike.correlationId,
        );
    }

    private _getTopicFilterFor(eventLike: CommunicationEventLike) {
        if (eventLike.eventType === CommunicationEventType.Raw) {
            return [eventLike.eventTypeFilter, eventLike.options?.match || "exact"];
        }
        if (eventLike.eventType === CommunicationEventType.IoValue) {
            return [eventLike.eventTypeFilter, "exact"];
        }
        return [
            WampTopic.getTopicFilter(
                this.apiVersion,
                this.options.shouldEnableCrossNamespacing ? undefined : this.options.namespace,
                eventLike.eventType,
                eventLike.eventTypeFilter,
                eventLike.correlationId),
            "wildcard",
        ];
    }

    private _addSessionTestaments(session) {
        const unjoinEventLike = this._joinOptions.unjoinEvent;
        const topic = this._getTopicFor(unjoinEventLike);
        const payload = unjoinEventLike.data;

        // Add testament for when the WAMP transport is lost.
        session.call("wamp.session.add_testament", [topic, [], payload], { scope: "destroyed" })
            .then(id => this.log(CommunicationBindingLogLevel.debug, "Added testament for destroyed scope: ", id))
            .catch(err => this.log(CommunicationBindingLogLevel.error, "Add testament failed for destroyed scope: ", this._error(err)));

        // Add testament for when the WAMP session is left (see unjoin()).
        session.call("wamp.session.add_testament", [topic, [], payload], { scope: "detached" })
            .then(id => this.log(CommunicationBindingLogLevel.debug, "Added testament for detached scope: ", id))
            .catch(err => this.log(CommunicationBindingLogLevel.error, "Add testament failed for detached scope: ", this._error(err)));
    }

    /* Inbound Message Dispatch */

    private _dispatchMessage(item: SubscriptionItem, topicName: string, payload: any) {
        const topic = WampTopic.createByName(topicName);

        // Dispatch Raw or IoValue event for the given subscription item.
        if (item.eventType === CommunicationEventType.Raw || item.eventType === CommunicationEventType.IoValue) {
            this.log(CommunicationBindingLogLevel.debug,
                "Inbound message as ",
                CommunicationEventType[item.eventType],
                " on ",
                topicName);
            this.emit("inboundEvent", {
                eventType: item.eventType,
                eventTypeFilter: topicName,
                sourceId: topic?.sourceId,
                correlationId: item.topic,
                data: payload,
            });

            return;
        }

        // Dispatch Coaty event (except IoValue event) for the given subscription item.
        this.log(CommunicationBindingLogLevel.debug, "Inbound message on ", topicName);
        this.emit("inboundEvent", {
            eventType: topic.eventType,
            eventTypeFilter: topic.eventTypeFilter,
            sourceId: topic.sourceId,
            correlationId: topic.correlationId,
            data: payload,
        });
    }

    /* Publication Management */

    private _addPublicationItem(
        eventLike: CommunicationEventLike,
        shouldAddFirst = false,
        once = false) {
        const topic = this._getTopicFor(eventLike);
        const payload = eventLike.data;
        const isKwargsPayload = !eventLike.isDataRaw && eventLike.eventType !== CommunicationEventType.IoValue;
        const options = eventLike.options;

        if (once && this._pendingPublicationItems.some(i => i.topic === topic)) {
            return;
        }
        if (shouldAddFirst) {
            this._pendingPublicationItems.unshift({ topic, payload, isKwargsPayload, options });
        } else {
            this._pendingPublicationItems.push({ topic, payload, isKwargsPayload, options });
        }
    }

    private _drainPublications() {
        if (!this._isPublishingDeferred) {
            return;
        }
        this._isPublishingDeferred = false;
        this._doDrainPublications();
    }

    private _doDrainPublications() {
        // In Joined state, try to publish each pending publication draining them in the
        // order they were queued.
        if (!this._connection?.isOpen || this._pendingPublicationItems.length === 0) {
            this._isPublishingDeferred = true;
            return;
        }

        const { topic, payload, isKwargsPayload, options } = this._pendingPublicationItems[0];
        const args = isKwargsPayload ? [] : [payload];
        const kwargs = isKwargsPayload ? payload : {};
        const promise = this._connection.session.publish(topic, args, kwargs, {
            retain: options?.retain || false,
            acknowledge: options?.acknowledge || false,
            exclude_me: false,
        });

        // Publish returns undefined for non-acknowledged publications. 
        if (promise !== undefined) {
            promise
                .then(pub => {
                    this.log(CommunicationBindingLogLevel.debug, "Published on ", topic);
                    this._pendingPublicationItems.shift();
                    this._doDrainPublications();
                })
                .catch(error => {
                    // If acknowledgement fails, stop draining, but keep this publication
                    // and all other pending ones queued for next reconnect.
                    this.log(CommunicationBindingLogLevel.error, "Publish failed on ", topic, " error: ", this._error(error));
                    this._isPublishingDeferred = true;
                });
        } else {
            this.log(CommunicationBindingLogLevel.debug, "Publishing on ", topic);
            this._pendingPublicationItems.shift();
            this._doDrainPublications();
        }
    }

    /* Subscription Management */

    private _subscriptionItemPredicate(eventType: CommunicationEventType, topic: string, match: string) {
        return (item: SubscriptionItem) => item.eventType === eventType && item.topic === topic && item.match === match;
    }

    private _addSubscriptionItem(eventLike: CommunicationEventLike) {
        const [topicFilter, match] = this._getTopicFilterFor(eventLike);
        const item: SubscriptionItem = {
            eventType: eventLike.eventType,
            topic: topicFilter,
            match,
            isKwargsPayload: !eventLike.isDataRaw && eventLike.eventType !== CommunicationEventType.IoValue,
        };

        // For Raw and external IoValue events we need to store separate subscriptions
        // for the same (maybe pattern-based) topic filter as they can be unsubscribed
        // individually.
        const index = this._issuedSubscriptionItems.findIndex(this._subscriptionItemPredicate(item.eventType, item.topic, item.match));

        if (index === -1) {
            this._issuedSubscriptionItems.push(item);
            this._subscribeItems(item);
        } else {
            const existingSubscription = this._issuedSubscriptionItems[index];
            this._issuedSubscriptionItems[index] = item;
            this._subscribeItems(item);

            // Unsubscribe the existing subscription handler to avoid multiple event dispatches.
            this._unsubscribeItems(existingSubscription);
        }
    }

    private _removeSubscriptionItem(eventLike: CommunicationEventLike) {
        const [topicFilter, match] = this._getTopicFilterFor(eventLike);
        const index = this._issuedSubscriptionItems.findIndex(this._subscriptionItemPredicate(eventLike.eventType, topicFilter, match));

        if (index === -1) {
            // Already unsubscribed.
            return;
        }

        const item = this._issuedSubscriptionItems.splice(index, 1);

        // As each subscription item has its own WAMP subscription ID, we can safely
        // unsubscribe an item with a topic which is still subscribed by another item.
        // This can happen for Raw and external IoValue events sharing the same (maybe
        // pattern-based) subscription topic.
        this._unsubscribeItems(item);
    }

    private _subscribeItems(items: SubscriptionItem | SubscriptionItem[]) {
        const subscribe = (item: SubscriptionItem) => {
            // If no session is open, items will be subscribed on next reconnect.
            if (this._connection?.isOpen) {
                this._connection.session.subscribe(
                    item.topic,
                    (args: any[], kwargs: any, details: IEvent) => {
                        const payload = item.isKwargsPayload ? kwargs : args[0];
                        this._dispatchMessage(item, details.topic, payload);
                    },
                    { match: item.match })
                    .then(sub => {
                        if (this.options.logLevel === CommunicationBindingLogLevel.debug) {
                            this.log(CommunicationBindingLogLevel.debug, "Subscribed on ", sub.topic,
                                " with ", JSON.stringify(sub.options));
                        }
                        item.subscription = sub;
                    })
                    .catch(err => {
                        this.log(CommunicationBindingLogLevel.error, "Subscribe failed on ", item.topic, " error: ", this._error(err));
                        delete item.subscription;
                    });
            }
        };

        if (Array.isArray(items)) {
            items.forEach(item => subscribe(item));
        } else {
            subscribe(items);
        }
    }

    private _unsubscribeItems(items: SubscriptionItem | SubscriptionItem[]) {
        const unsubscribe = (item: SubscriptionItem) => {
            //  Unsubscribe to perform side effects in WAMP client even if session is not open.
            if (item.subscription !== undefined) {
                this._connection?.session.unsubscribe(item.subscription)
                    .then(gone => {
                        // gone is false if handlers are still left on the subscription topic.
                        if (this.options.logLevel === CommunicationBindingLogLevel.debug) {
                            this.log(CommunicationBindingLogLevel.debug, "Unsubscribed on ", item.topic,
                                " with ", JSON.stringify(item.subscription.options));
                        }
                        delete item.subscription;
                    })
                    .catch(err => {
                        // Throws if session is not open or subscription not active.
                        this.log(CommunicationBindingLogLevel.debug, "Unsubscribe failed on ", item.topic, " error: ", this._error(err));
                        delete item.subscription;
                    });
            }
        };

        if (Array.isArray(items)) {
            items.forEach(item => unsubscribe(item));
        } else {
            unsubscribe(items);
        }
    }
}

/** Represents an item to be published. */
interface PublicationItem {
    topic: string;
    payload: any;
    isKwargsPayload: boolean;
    options: { [key: string]: any };
}

/** Represents an item to be subscribed or unsubscribed. */
interface SubscriptionItem {
    eventType: CommunicationEventType;
    topic: string;
    match: string;
    isKwargsPayload: boolean;
    subscription?: ISubscription;
}
