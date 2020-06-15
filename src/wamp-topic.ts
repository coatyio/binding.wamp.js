/*! Copyright (c) 2020 Siemens AG. Licensed under the MIT License. */

import { CommunicationEventType, Uuid } from "@coaty/core";

/**
 * Represents WAMP publication and subscription topics for Coaty communication
 * events (except Raw and external IoValue).
 */
export class WampTopic {

    get eventType() {
        return this._eventType;
    }

    get eventTypeFilter() {
        return this._eventTypeFilter;
    }

    get sourceId() {
        return this._sourceId;
    }

    get correlationId() {
        return this._correlationId;
    }

    get version() {
        return this._version;
    }

    get namespace() {
        return this._namespace;
    }

    private static readonly PROTOCOL_NAME = "coaty";
    private static readonly PROTOCOL_NAME_PREFIX = WampTopic.PROTOCOL_NAME + ".";
    private static readonly WHITESPACE_CHARS = " \f\n\r\t\v\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
    private static readonly WHITESPACE_CHARS_ENCODING = new Map(Array.from(WampTopic.WHITESPACE_CHARS)
        .map((c, i) => [c, i.toString().padStart(2, "0")]));
    private static readonly WHITESPACE_CHARS_DECODING = new Map(Array.from(WampTopic.WHITESPACE_CHARS_ENCODING.entries())
        .map(([k, v]) => [v, k]));


    // Rexexp for non-strict topic URI check allowing empty URI components (used
    // for wildcard matching subsciptions).
    private static readonly REGEX_URI_LOOSE_EMPTY = /^(([^\s\.#]+\.)|\.)*([^\s\.#]+)?$/;

    // Rexexp for non-strict topic URI check disallowing empty URI components
    // (used for publications).
    private static readonly REGEX_URI_LOOSE_NON_EMPTY = /^([^\s\.#]+\.)*([^\s\.#]+)$/;

    private static EVENT_TYPE_TOPIC_COMPONENTS: { [component: string]: CommunicationEventType };
    private static TOPIC_COMPONENTS_BY_EVENT_TYPE: string[];

    private _version: number;
    private _namespace: string;
    private _eventType: CommunicationEventType;
    private _eventTypeFilter: string;
    private _sourceId: Uuid;
    private _correlationId: Uuid;

    private constructor() {
        /* tslint:disable:empty-block */
        /* tslint:enable:empty-block */
    }

    /**
     * Create a new topic instance from the given WAMP publication topic.
     *
     * @param topicName the structured name of a Coaty publication topic
     * @returns a Coaty communication topic instance or undefined if the topic
     * name represents a Raw or external IO value event.
     */
    static createByName(topicName: string): WampTopic {
        if (!WampTopic.isCoatyTopicLike(topicName)) {
            return undefined;
        }

        const topic = new WampTopic();
        const [, version, namespace, event, sourceId, corrId] = topicName.split(".");
        const v = parseInt(version, 10);
        const [eventType, eventTypeFilter] = this._parseEvent(event);

        topic._version = v;
        topic._namespace = this._decodeTopicComponent(namespace);
        topic._eventType = eventType;
        topic._eventTypeFilter = eventTypeFilter && this._decodeTopicComponent(eventTypeFilter);
        topic._sourceId = sourceId;
        topic._correlationId = corrId === "" ? undefined : corrId;

        return topic;
    }

    /**
     * Gets the WAMP publication topic name for the given topic components.
     *
     * @param version the protocol version
     * @param namepace the messaging namespace
     * @param eventType an event type
     * @param eventTypeFilter a filter for an event type, or undefined
     * @param sourceId ID from which this event originates
     * @param correlationId correlation ID for two-way message or undefined
     */
    static getTopicName(
        version: number,
        namespace: string,
        eventType: CommunicationEventType,
        eventTypeFilter: string,
        sourceId: Uuid,
        correlationId: Uuid,
    ): string {
        let event = WampTopic._getEventTopicComponentPrefix(eventType);
        if (eventTypeFilter) {
            event += this._encodeTopicComponent(eventTypeFilter);
        }
        let topic = `${WampTopic.PROTOCOL_NAME}.${version}.${this._encodeTopicComponent(namespace)}.${event}.${sourceId}`;
        if (!WampTopic._isOneWayEvent(eventType)) {
            topic += `.${correlationId}`;
        }
        return topic;
    }

    /**
     * Gets a pattern-based WAMP topic filter with wildcards for subscription.
     *
     * @param version the protocol version
     * @param namepace the messaging namespace or undefined
     * @param eventType the event type
     * @param eventTypeFilter the event filter or undefined
     * @param correlationId correlation ID for response message, or undefined
     * for request message
     */
    static getTopicFilter(
        version: number,
        namespace: string,
        eventType: CommunicationEventType,
        eventTypeFilter: string,
        correlationId: Uuid): string {
        let event = WampTopic._getEventTopicComponentPrefix(eventType);
        if (eventTypeFilter) {
            event += this._encodeTopicComponent(eventTypeFilter);
        }
        let comps = `${this.PROTOCOL_NAME}.${version}.${namespace ? this._encodeTopicComponent(namespace) : ""}.${event}.`;
        if (!this._isOneWayEvent(eventType)) {
            comps += correlationId ? `.${correlationId}` : ".";
        }

        return comps;
    }

    /**
     * Determines whether the given topic name starts with the same topic
     * component as a Coaty topic.
     *
     * @param topicName a topic name
     * @returns true if the given topic name is a potential Coaty topic; false
     * otherwise
     */
    static isCoatyTopicLike(topicName: string) {
        return topicName.startsWith(this.PROTOCOL_NAME_PREFIX);
    }

    /**
     * Determines whether the given name is a valid WAMP URI topic for
     * publication or subscription.
     *
     * @remarks A valid topic URI must not be empty. A non-strict check on the
     * URI is performed according to the WAMP specification: URI components (the
     * parts between two dots, the head part up to the first dot, the tail part
     * after the last dot) MUST NOT contain a dot, # or whitespace characters
     * and MUST NOT be empty (zero-length strings). For subscription URIs
     * non-empty components are allowed to support pattern-based subscriptions
     * for wildcard matching.
     *
     * @param name a topic URI
     * @param forSubscription indicates whether the name is used for
     * subscription (true) or publication (false)
     * @returns true if the given topic name can be used as requested; false
     * otherwise
     */
    static isValidTopic(name: string, forSubscription = false): boolean {
        if (!name) {
            return false;
        }
        return forSubscription ?
            WampTopic.REGEX_URI_LOOSE_EMPTY.test(name) :
            WampTopic.REGEX_URI_LOOSE_NON_EMPTY.test(name);
    }

    /**
     * Encode a valid Coaty topic event filter or namespace as a WAMP topic URI
     * component.
     *
     * The characters `Dot (U+00B7)` and whitespace characters are not allowed
     * inside WAMP topic URI components. Any Dot character is replaced by three
     * `NULL (U+0000)` characters; any whitespace character is replaced by a
     * `NULL (U+0000)` character followed by a two character sequence that
     * uniquely identifies each whitespace character. The NULL character is used
     * as an escape character as it is forbidden thus never contained in a given
     * input string.
     *
     * @remarks No need to substitute `# (U+0023)` as this is not a valid Coaty
     * topic level. No need to substitute a `Colon (U+003A)` as this binding
     * does not defined any URI shortcuts (CURIEs).
     *
     * @param component a Coaty topic event filter or namespace
     * @returns encoded WAMP URI component
     */
    private static _encodeTopicComponent(component: string) {
        return component.replace(/[.\s]/g, char => {
            if (char === ".") {
                return "\u0000\u0000\u0000";
            }
            let encode = WampTopic.WHITESPACE_CHARS_ENCODING.get(char);
            if (encode === undefined) {
                encode = "00";
            }
            return "\u0000" + encode;
        });
    }

    private static _decodeTopicComponent(encodedComponent: string) {
        return encodedComponent.replace(/\u0000(..)/g, (match, c1) => {
            if (c1.startsWith("\u0000")) {
                return ".";
            }
            return WampTopic.WHITESPACE_CHARS_DECODING.get(c1);
        });
    }

    private static _isOneWayEvent(eventType: CommunicationEventType) {
        return eventType > CommunicationEventType.OneWay && eventType < CommunicationEventType.TwoWay;
    }

    private static _parseEvent(event: string): [CommunicationEventType, string] {
        const typeLen = 3;
        const hasEventFilter = event.length > typeLen;
        const type = hasEventFilter ? event.substr(0, typeLen) : event;
        const filter = hasEventFilter ? event.substring(typeLen) : undefined;
        return [this._getEventType(type), filter];
    }

    private static _initTopicComponents() {
        if (this.EVENT_TYPE_TOPIC_COMPONENTS === undefined) {
            this.EVENT_TYPE_TOPIC_COMPONENTS = {
                ADV: CommunicationEventType.Advertise,
                DAD: CommunicationEventType.Deadvertise,
                CHN: CommunicationEventType.Channel,
                ASC: CommunicationEventType.Associate,
                IOV: CommunicationEventType.IoValue,

                DSC: CommunicationEventType.Discover,
                RSV: CommunicationEventType.Resolve,
                QRY: CommunicationEventType.Query,
                RTV: CommunicationEventType.Retrieve,
                UPD: CommunicationEventType.Update,
                CPL: CommunicationEventType.Complete,
                CLL: CommunicationEventType.Call,
                RTN: CommunicationEventType.Return,
            };
        }
        if (this.TOPIC_COMPONENTS_BY_EVENT_TYPE === undefined) {
            this.TOPIC_COMPONENTS_BY_EVENT_TYPE = [];
            Object.keys(this.EVENT_TYPE_TOPIC_COMPONENTS).findIndex(key => {
                const eventType = this.EVENT_TYPE_TOPIC_COMPONENTS[key];
                this.TOPIC_COMPONENTS_BY_EVENT_TYPE[eventType] = key;
            });
        }
    }

    private static _getEventType(topicComponent: string) {
        this._initTopicComponents();
        return this.EVENT_TYPE_TOPIC_COMPONENTS[topicComponent];
    }

    private static _getEventTopicComponentPrefix(eventType: CommunicationEventType) {
        this._initTopicComponents();
        return this.TOPIC_COMPONENTS_BY_EVENT_TYPE[eventType];
    }

}
