---
layout: default
title: Coaty WAMP Communication Protocol
---

# Coaty WAMP Communication Protocol

> This specification conforms to Coaty WAMP Communication Protocol Version 1

## Version History

* **Version 1**: initial specification

## Table of Contents

* [Introduction](#introduction)
* [Requirements](#requirements)
* [Topic Structure](#topic-structure)
* [Topic Filters](#topic-filters)
* [Message Payloads](#message-payloads)

## Introduction

This document specifies the common Coaty WAMP Communication Protocol that must
be implemented by all language-specific Coaty WAMP communication bindings to be
interoperable.

The *reference implementation* of this protocol can be found in the
[binding.wamp.js](https://github.com/coatyio/binding.wamp.js) repository on
GitHub.

With a Coaty WAMP binding, Coaty communication events are transmitted via the
WAMP (Web Application Messaging Protocol) publish-subscribe messaging protocol.
The format of WAMP topic names and payloads conforms to the [WAMP
Protocol](https://wamp-proto.org/).

## Requirements

General requirements for WAMP bindings are as follows:

* The binding should be compatible with any WAMP router (e.g.
  [Crossbar.io](https://crossbar.io/docs/Installation/)) that supports the WAMP
  v2 protocol with the following features:
  * WAMP Basic Profile
  * Publisher Exclusion of Advanced Profile
  * Pattern-based Subscriptions of Advanced Profile
  * Testament Meta API of Advanced Profile
  * WebSocket transport
  * MessagePack serialization
* Always connect to the WAMP router with a clean WAMP session without requesting
  event history on each (re)-connection.
* Emit communication state `Online` on connection to the WAMP router, and
  `Offline` on disconnection.
* If connection is broken, defer publications until next reconnection.
* If connection is broken, support automatic resubscription of all subscribed
  topics on every reconnection.
* On successful (re)connection, add two session testaments to router to be
  published for the unjoin event, one for scope `destroyed`, one for scope
  `detached`.
* On successful (re)connection, join events must be published first in the given
  order.

## Topic Structure

[Coaty communication event
patterns](https://coatyio.github.io/coaty-js/man/communication-events/) are
mapped onto WAMP publication and subscription messages. Coaty defines its own
topic structure that comprises the following WAMP topic URI components:

* **ProtocolName** - the name of the protocol, i.e. `coaty`.
* **ProtocolVersion** - for versioning the communication protocol. The protocol
  version number conforming to this specification is shown at the top of this
  page.
* **Namespace** - namespace used to isolate different Coaty applications.
  Communication events are only routed between agents within a common namespace.
* **Event** - event type and filter of a [Coaty communication
  event](https://coatyio.github.io/coaty-js/man/communication-events/).
* **SourceObjectID** - globally unique ID (UUID) of the event source that is
  publishing a topic, either an agent's identity or that of the publishing IO
  source.
* **CorrelationID** - UUID that correlates a response message with its request
  message. This component is only present in two-way event patterns, i.e.
  Discover-Resolve, Query-Retrieve, Update-Complete, and Call-Return event
  patterns.

UUIDs (Universally Unique Identifiers) must conform to the UUID version 4 format
as specified in [RFC 4122](https://www.ietf.org/rfc/rfc4122.txt). In the string
representation of a UUID the hexadecimal values "a" through "f" are output as
lower case characters.

> **Note**: Raw events and external IoValue events do not conform to this topic
> structure. They are published and subscribed on an application-specific topic
> string, which can be any valid WAMP topic that must not start with
> `<ProtocolName>.`.

A topic name for publication is composed as follows:

```
// Publication of one-way event
<ProtocolName>.<ProtocolVersion>.<Namespace>.<Event>.<SourceObjectId>

// Publication of two-way event (both request and response)
<ProtocolName>.<ProtocolVersion>.<Namespace>.<Event>.<SourceObjectId>.<CorrelationId>
```

The ProtocolVersion topic component represents the communication protocol
version of the publishing party, as a positive integer.

The Namespace topic component **must** specify a non-empty string. It must not
contain the characters `NULL (U+0000)`, `# (U+0023)`, `+ (U+002B)`, and `/
(U+002F)`.

To denote event types in the Event topic component, 3-character shortcuts are
used:

| Event Type            | Shortcut       |
|-------------------    |--------------- |
| Advertise             | ADV            |
| Deadvertise           | DAD            |
| Channel               | CHN            |
| Associate             | ASC            |
| IoValue               | IOV            |
| Discover              | DSC            |
| Resolve               | RSV            |
| Query                 | QRY            |
| Retrieve              | RTV            |
| Update                | UPD            |
| Complete              | CPL            |
| Call                  | CLL            |
| Return                | RTN            |

When publishing an Advertise event the Event topic component **must** include a
filter of the form: `ADV<filter>`. The filter must not be empty. It must not
contain the characters `NULL (U+0000)`, `# (U+0023)`, `+ (U+002B)`, and `/
(U+002F)`. Framework implementations specify the core type (`ADV<coreType>`) or
the object type (`ADV:<objectType>`) of the advertised object as filter in
order to allow subscribers to listen just to objects of a specific core or
object type.

When publishing an Update event the Event topic component **must** include a
filter of the form: `UPD<filter>`. The filter must not be empty. It must not
contain the characters `NULL (U+0000)`, `# (U+0023)`, `+ (U+002B)`, and `/
(U+002F)`. Framework implementations specify the core type (`UPD<coreType>`) or
the object type (`UPD:<objectType>`) of the updated object as filter in order
to allow subscribers to listen just to objects of a specific core or object
type.

When publishing a Channel event the Event topic component **must** include a
channel identifier of the form: `CHN<channelId>`. The channel ID must not be
empty. It must not contain the characters `NULL (U+0000)`, `# (U+0023)`, `+
(U+002B)`, and `/ (U+002F)`.

When publishing a Call event the Event topic component **must** include an
operation name of the form: `CLL<operationname>`. The operation name must not
be empty. It must not contain the characters `NULL (U+0000)`, `# (U+0023)`, `+
(U+002B)`, and `/ (U+002F)`.

When publishing an Associate event the Event topic component **must** include an
IO context name of the form: `ASC<contextName>`. The context name must not be
empty. It must not contain the characters `NULL (U+0000)`, `# (U+0023)`, `+
(U+002B)`, and `/ (U+002F)`.

For any request-response event pattern the receiving party must respond with an
outbound message topic containing the original CorrelationID of the incoming
message topic. Note that the Event topic component of response events **must
never** include a filter field.

As the Unicode character `Dot (U+00B7)` and whitespace characters are not
allowed inside WAMP topic URI components, both event filter and namespace
strings must be encoded/decoded specially: The `NULL (U+0000)` character is used
as an escape character as it is not allowed in a given input string. Any Dot
character is replaced by three NULL characters; any whitespace character is
replaced by a NULL character followed by a two character sequence that uniquely
identifies each whitespace character. The two character sequence is computed by
mapping the character index of a whitespace character in the string
`"\u0020\f\n\r\t\v\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"`
to its decimal string representation of length 2, left padded with "0". For
example, the whitespace character `\u1680` is mapped to the sequence "07".

## Topic Filters

Each WAMP binding must subscribe to topics according to the defined topic
structure with pattern-based *wildcard* subscription option enabled:

```
// Subscription for one-way events without or with cross-namespacing
<ProtocolName>.<ProtocolVersion>.<Namespace>/<Event>.
<ProtocolName>.<ProtocolVersion>..<Event>.

// Subscription for two-way request events without or with cross-namespacing
<ProtocolName>.<ProtocolVersion>.<Namespace>.<Event>..
<ProtocolName>.<ProtocolVersion>..<Event>..

// Subscription for two-way response events without or with cross-namespacing
<ProtocolName>.<ProtocolVersion>.<Namespace>.<Event>..<CorrelationID>
<ProtocolName>.<ProtocolVersion>..<Event>..<CorrelationID>
```

These subscriptions, especially response subscriptions, should be unsubscribed
as soon as they are no longer needed by the agent. Since Coaty uses Reactive
Programming `Observables` to observe communication events, WAMP subscription
topics should be unsubscribed whenever the corresponding observable is
unsubscribed by the application.

Note that the Namespace topic component **must** either specify a non-empty
string or a single-component wildcard (`..`), depending on whether the agent
should restrict communication to a given namespace or enable cross-namespacing
communication.

When subscribing to a response event, the Event topic component **must not**
include an event filter.

When subscribing to an Advertise event, the Event topic component **must**
include the Advertise filter: `ADV<filter>`.

When subscribing to a Channel event, the Event topic component **must** include
the channel ID: `CHN<channelId>`.

When subscribing to an Update event, the Event topic component **must** include
the Update filter: `UPD<filter>`.

When subscribing to a Call event, the Event topic component **must** include the
operation name: `CLL<operationname>`.

When subscribing to an Associate event, the Event topic component **must**
include the IO context name: `ASC<contextName>`.

When subscribing to a response event, the CorrelationID topic component **must**
include the CorrelationID of the correlated request.

## Message Payloads

Message payloads for the Coaty events described above consist of attribute-value
pairs in JavaScript Object Notation format ([JSON](http://www.json.org), see
[RFC 4627](https://www.ietf.org/rfc/rfc4627.txt)).

Message payloads for Raw and IoValue events **must** be published on WAMP
`Arguments` as an array with one element containing the raw data; all other
events **must** be published on WAMP `Keyword Arguments` as JSON object data
directly.

Message payloads **must** be serialized with the WAMP MessagePack v5 serializer
(not with the JSON serializer). This serializer can also directly serialize
binary data of Raw events and raw IoValue events. Event data of these events
consists of a byte array encoded in any application-specific format.

---
Copyright (c) 2020 Siemens AG. This work is licensed under a
[Creative Commons Attribution-ShareAlike 4.0 International License](http://creativecommons.org/licenses/by-sa/4.0/).
