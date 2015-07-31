[![Build Status][ci-img]][ci-url]
[![Coverage Status][cov-img]][cov-url]
[![Code Climate][clim-img]][clim-url]

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

````json
{
    "qid": "3mfHGL1r9gzyQP",
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
  ````


# How it Works

- read a batches of log entries
- parse each with [postfix-parser](https://github.com/DoubleCheck/postfix-parser)
- fetch matching docs from Elasticsearch
- update/create normalized docs
- saves new/updated docs to Elasticsearch


# Install

    npm i log-ship-elastic-postfix

Edit log-ship-elastic-postfix.ini, then launch with:

    node server.js


# Features

- [x] drop in modules for: reader, parser, and elasticsearch
- [x] official [elasticsearch client](https://www.npmjs.com/package/elasticsearch) load balances among ES hosts
- [ ] 
- [x] config file is human friendly ini
- [x] can replay logs w/o duplicate ES documents
- [ ] streams multiple files simultaneously
    - [ ] one superviser + one child process per log file (maybe?)
- [ ] cronolog naming syntax (/var/log/http/YYYY/MM/DD/access.log)
    - [ ] watches existing directory ancestor
- [ ] winston naming syntax (app.log1, app.log2, etc.)
- [ ] process line status, `ps` output examples:
    - reader:/var/log/mail.log   lines:43023 reading
    - reader:/var/log/mail.log.1 lines:98302 waiting for data


# But, Logstash?!

Version 0.3 of this project used Logstash in [The Usual Way](https://www.elastic.co/guide/en/logstash/current/deploying-and-scaling.html), to ship logs to Elasticsearch and do basic line parsing.

The next stage was a normalizion script that extracted log data from Elasticsearch, normalized it into the format above, and then saved the normalized documents to another ES index. It was in that normalizion process that we discovered millions of missing logs (~30% of log lines) and millions (~10%) of duplicates log entries. In poring over the logs for Logstash Forwarder, Logstash, and Elasticsearch, observing the error messages, correlating our experience with open GitHub Issues in both Logstash and Logstash Forwarder, we came to realize that the Logstash pipeline is a train wreck.

Logstash is supposedly robust, and is supposed to apply back-pressure on the pipeline to prevent it from overrunning the parser or the Elasticsearch indexer. In reality, it doesn't (the docs *almost* admit this), recommending making the Logstash pipeline **more** complicated by adding in a queue. The 8 separate bugs (all open issues) we ran into convinced us even with a queue, we'd still have issues.

Instead of a Rube Goldberg pipeline like this:

1. Locally generated log files, read by...
2. Logstash Forwarder, which sends them to...
3. Message Queue (Redis, Kafka, or RabbitMQ)
4. Logstash drains the queue, parses logs and sends them to...
5. Elasticsearch

## Thoughts

* Why have a separate message queue for logs? They're *already* safely queued on disk. Queueing them again is a bizarre (and expensive) "solution" to the "Logstash eats logs" problem.
* When parsing Postfix logs, where a single message has 4 to N log entries, the tools available for assembling multiple lines into a document using Logstash are insufficient.

## Instead

1. Locally generated log files, read by...
2. log-ship-elastic-postfix
    * parsed by [postfix-parser](https://www.npmjs.com/package/postfix-parser)
    * retrieve matching docs from ES
    * apply parsed lines against matching / new docs
    * save to...
3. Elasticsearch

If anything goes wrong saving to ES, don't advance our bookmark until a retry works. Check for the existence of documents matches *before* saving, avoiding duplicates in the case of "300 of your 1024 batch were saved" issues.

## Result

Way, way, way faster.



[ci-img]: https://travis-ci.org/DoubleCheck/log-ship-elastic-postfix.svg
[ci-url]: https://travis-ci.org/DoubleCheck/log-ship-elastic-postfix
[cov-img]: https://coveralls.io/repos/DoubleCheck/log-ship-elastic-postfix/badge.svg
[cov-url]: https://coveralls.io/github/DoubleCheck/log-ship-elastic-postfix
[clim-img]: https://codeclimate.com/github/DoubleCheck/log-ship-elastic-postfix/badges/gpa.svg
[clim-url]: https://codeclimate.com/github/DoubleCheck/log-ship-elastic-postfix
