[![Build Status][ci-img]][ci-url]
[![Code Coverage][cov-img]][cov-url]
[![Code Climate][clim-img]][clim-url]
[![NPM][npm-img]][npm-url]

# Ship Postfix Logs to Elasticsearch

Parses postfix log files from log files into a normalized JSON document and saves them to Elasticsearch.


# Overview

Turns this:

````
Jul 26 04:18:34 mx12 postfix/pickup[20280]: 3mfHGL1r9gzyQP: uid=1208 from=<system>
Jul 26 04:18:34 mx12 postfix/cleanup[20659]: 3mfHGL1r9gzyQP: message-id=<3mfHGL1r9gzyQP@mx15.example.net>
Jul 26 04:18:34 mx12 postfix/qmgr[28761]: 3mfHGL1r9gzyQP: from=<system>, size=813, nrcpt=1 (queue active)
Jul 26 04:18:34 mx12 postfix/smtp[20662]: 3mfHGL1r9gzyQP: to=<system>, relay=127.0.0.2[127.0.0.2]:25, delay=0.53, delays=0.13/0/0.23/0.16, dsn=2.0.0, status=sent (250 Queued! (#2.0.0))
Jul 26 04:18:34 mx12 postfix/qmgr[28761]: 3mfHGL1r9gzyQP: removed
````

Into this:

```json
{
    "id": "3mfHGL1r9gzyQP",
    "host": "mx12",
    "events": [
      {
        "date": "2015-07-26T04:18:34-04:00",
        "action": "queued"
      },
      {
        "to": "system",
        "relay": "127.0.0.2[127.0.0.2]:25",
        "dsn": "2.0.0",
        "status": "sent (250 Queued! (#2.0.0))",
        "date": "2015-07-26T04:18:34-04:00"
      },
      {
        "date": "2015-07-26T04:18:34-04:00",
        "action": "removed"
      }
    ],
    "date": "2015-07-26T04:18:34-04:00",
    "isFinal": true,
    "uid": "1208",
    "message-id": "3mfHGL1r9gzyQP@mx15.example.net",
    "from": "system",
    "size": "813",
    "nrcpt": "1",
    "delay": "0.53",
    "delays": "0.13/0/0.23/0.16"
  }
```


# How it Works

- read a batch of log entries
- parse lines with [postfix-parser](https://github.com/msimerson/postfix-parser)
- fetch matching docs from Elasticsearch
- update/create normalized docs
- save new/updated docs to Elasticsearch


# Install

    npm i log-ship-elastic-postfix

Edit log-ship-elastic-postfix.ini, then launch with:

    node server.js

With a custom config directory:

    node server.js -config ~/etc/


# Versions

- For Elastic v5, use at least version 1.0.0 of this module.
- Versions of log-ship-elastic-postfix < 1.0.0 work with Elastic versions < 5.


# Features

- [x] drop in modules for: reader, parser, and elasticsearch
- [x] official [elasticsearch client](https://www.npmjs.com/package/elasticsearch) load balances among ES hosts
- [x] config file is human friendly ini
- [x] can replay logs w/o duplicate ES documents
- [ ] streams multiple files simultaneously
- [ ] cronolog naming syntax (/var/log/http/YYYY/MM/DD/access.log)
    - [ ] watches existing directory ancestor
- [ ] winston naming syntax (app.log1, app.log2, etc.)
- [ ] email alerts for unrecoverable errors


# But, Logstash?!

Version 0.3 of this project used Logstash in [The Usual Way](https://www.elastic.co/guide/en/logstash/current/deploying-and-scaling.html), to ship logs to Elasticsearch and do basic line parsing.

The second stage was a normalization script that extracted log data from Elasticsearch, normalized it as above, and saved the normalized documents to another index. In that normalization process we discovered millions of missing logs (~30% of log lines) and millions (~10%) of duplicate log entries. In poring over the logs for Logstash Forwarder, Logstash, and Elasticsearch, observing the error messages, correlating our experience with open GitHub Issues in both Logstash and Logstash Forwarder, we came to realize that the Logstash pipeline is ... less reliable than we hoped.

Logstash is supposed to apply back-pressure on the pipeline to prevent overrunning the parser or the Elasticsearch indexer. In reality, it does not (the docs *almost* admit this), recommending making the Logstash pipeline **more** complicated by adding a queue. The 8 separate bugs (all open issues) we ran into with Logstash and LSF convinced us even with a queue, we would still have issues.

We decided a simpler solution would be better.

## Thoughts

* Logs are *already* safely queued on disk. Queueing them again is an expensive "solution" to the "Logstash eats logs" problem.
* Postfix logs, where a single message has 4+ log entries, Logstash is insufficient for assembling lines into a document, requiring extensive post-processing.

## Instead

1. log-ship-elastic-postfix reads locally generated log files with:
    * [safe-log-reader](https://www.npmjs.com/package/safe-log-reader)
    * parses log lines with [postfix-parser](https://www.npmjs.com/package/postfix-parser)
    * retrieves matching docs from ES
    * applies updated log entries against matching / new docs
    * saves to...
2. Elasticsearch
    * using the bulk API

When saving to ES fails, retry, and only advance the file bookmark after a retry succeeds. By checking for the existence of documents matches *first*, we avoid duplicates in the case of "300 of your 1024 batch were saved" issues.

## Results

* Way, way, way faster.
* Uses far less ES storage.
* Far less ES traffic


<sub>Copyright 2015 by eFolder, Inc.</sub>


[ci-img]: https://travis-ci.org/msimerson/log-ship-elastic-postfix.svg
[ci-url]: https://travis-ci.org/msimerson/log-ship-elastic-postfix
[cov-img]: https://codecov.io/github/msimerson/log-ship-elastic-postfix/coverage.svg
[cov-url]: https://codecov.io/github/msimerson/log-ship-elastic-postfix
[clim-img]: https://codeclimate.com/github/msimerson/log-ship-elastic-postfix/badges/gpa.svg
[clim-url]: https://codeclimate.com/github/msimerson/log-ship-elastic-postfix
[npm-img]: https://nodei.co/npm/log-ship-elastic-postfix.png
[npm-url]: https://www.npmjs.com/package/log-ship-elastic-postfix
