[![Build Status][ci-img]][ci-url]
[![Code Coverage][cov-img]][cov-url]
[![Code Climate][clim-img]][clim-url]
[![NPM][npm-img]][npm-url]

# Ship Postfix Logs to Elasticsearch

Parses postfix, rspamd, and rmilter log files and ships them to Elasticsearch as normalized documents.

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

```sh
npm i log-ship-elastic-postfix
```

Edit log-ship-elastic-postfix.ini, then launch with:

```sh
node server.js
```

With a custom config directory:

```sh
node server.js -config ~/etc/
```

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

<sub>Copyright 2015 by eFolder, Inc.</sub>

[ci-img]: https://github.com/msimerson/log-ship-elastic-postfix/actions/workflows/test.yml/badge.svg
[ci-url]: https://github.com/msimerson/log-ship-elastic-postfix/actions/workflows/test.yml
[cov-img]: https://codecov.io/github/msimerson/log-ship-elastic-postfix/coverage.svg
[cov-url]: https://codecov.io/github/msimerson/log-ship-elastic-postfix
[clim-img]: https://codeclimate.com/github/msimerson/log-ship-elastic-postfix/badges/gpa.svg
[clim-url]: https://codeclimate.com/github/msimerson/log-ship-elastic-postfix
[npm-img]: https://nodei.co/npm/log-ship-elastic-postfix.png
[npm-url]: https://www.npmjs.com/package/log-ship-elastic-postfix
