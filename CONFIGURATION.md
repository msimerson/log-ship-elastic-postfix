# Configuration Guide

This document explains how to configure `log-ship-elastic-postfix` to ingest Postfix logs into Elasticsearch.

## Quick Start

1. **Edit the configuration file** (`log-ship-elastic-postfix.ini`):

```ini
[elasticsearch]
# Elasticsearch connection settings
hosts=127.0.0.1:9200      # Your Elasticsearch host(s)
timeformat=YYYY-MM-DD      # Index date format
module=@elastic/elasticsearch  # ES client module to use

[reader]
# Log file settings
path=/var/log/mail.log     # Path to Postfix mail log
start_line=0               # Starting line (0 = read from beginning)
line_per_read=10000        # Lines to read per batch
```

2. **Ensure Elasticsearch is running and accessible**:

```bash
curl http://localhost:9200
# Should return ES cluster info
```

3. **Run the service**:

```bash
node server.js
```

## Configuration Details

### Elasticsearch Section

| Setting | Purpose | Example |
|---------|---------|---------|
| `hosts` | Elasticsearch host(s) to connect to | `127.0.0.1:9200` or `host1:9200,host2:9200` |
| `timeformat` | Format for index names (uses strftime) | `YYYY-MM-DD` creates indices like `logs-2026-04-29` |
| `module` | Node.js Elasticsearch client module | `@elastic/elasticsearch` |

### Reader Section

| Setting | Purpose | Example |
|---------|---------|---------|
| `path` | Path to the Postfix mail log file | `/var/log/mail.log` or `/var/log/mail/mail.log` |
| `start_line` | Starting line number (0 = from beginning) | `0` |
| `line_per_read` | Number of log lines to read per batch | `10000` |

## Index Mapping

By default, logs are stored in an index named `logs-{date}` (e.g., `logs-2026-04-29`).

Each entry in Elasticsearch contains:
- **queue_id**: The Postfix queue ID (links related log entries)
- **from**: Sender email address
- **to**: Recipient email address(es)
- **timestamp**: When the event occurred
- **relay**: Where the message was relayed to
- **delay**: Total message delay in seconds
- **size**: Message size in bytes
- **status**: Final delivery status (e.g., "sent", "deferred", "bounced")
- **dsn**: Delivery Status Notification code
- And many more fields extracted from the log

### Rspamd and Rmilter Support

This tool also captures logs from **rspamd** (spam filtering) and **rmilter** (mail filtering) when they appear in the same syslog stream. These logs are associated with postfix messages via queue IDs.

#### Captured Data

**Rmilter logs** contribute:
- Spam scan results (score, verdict)
- Virus scan results
- DKIM verification status
- Message metadata

**Rspamd logs** contribute:
- Spam classification results and scores
- Rules triggered during scanning
- Message IDs and queue relationships
- Scan timing information

#### Queue ID Linking

Both rspamd and rmilter logs include the Postfix queue ID, allowing complete message flow tracking:

```
rmilter log:    "mlfi_data: queue id: <795941FED7>"
rspamd log:     "queue-id: <795941FED7>"
postfix log:    "795941FED7: from=<sender@example.com>"
```

In Elasticsearch, all three log sources appear as events in a single document, providing end-to-end visibility.

## Postfix Log Format

This tool parses standard syslog-formatted Postfix logs:

```
Apr 29 12:53:46 mail01 postfix-In/qmgr[10245]: 795941FED7: from=<sender@example.com>, size=587, nrcpt=1 (queue active)
Apr 29 12:53:46 mail01 postfix-In/local[27000]: 795941FED7: to=<rcpt@example.com>, relay=local, delay=0.85, dsn=2.0.0, status=sent
```

The tool extracts queue IDs and relationships to group related events together.

## Running in Production

### With systemd

Create `/etc/systemd/system/log-ship-elastic.service`:

```ini
[Unit]
Description=Postfix Log Shipper to Elasticsearch
After=network.target elasticsearch.service

[Service]
Type=simple
User=logshipper
WorkingDirectory=/opt/log-ship-elastic-postfix
ExecStart=/usr/bin/node /opt/log-ship-elastic-postfix/server.js
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable log-ship-elastic
sudo systemctl start log-ship-elastic
sudo systemctl status log-ship-elastic
```

### With monit

Create `/etc/monit/conf.d/log-ship-elastic.conf`:

```
check process log_ship_elastic with pidfile /var/run/log-ship-elastic.pid
  start program = "/bin/systemctl start log-ship-elastic"
  stop program = "/bin/systemctl stop log-ship-elastic"
  if does not exist for 2 cycles then alert
  if memory usage > 500 MB for 5 cycles then restart
```

## Troubleshooting

### "Connection refused" Error

**Problem**: `Error: connect ECONNREFUSED 127.0.0.1:9200`

**Solution**: Ensure Elasticsearch is running and accessible:
```bash
# Check if ES is running
curl http://localhost:9200

# If not, start it
sudo systemctl start elasticsearch
```

### "Couldn't create index" Error

**Problem**: `400 bad request` or `index_already_exists_exception`

**Solution**: 
1. Check your `timeformat` in the configuration is correct
2. Ensure Elasticsearch has sufficient disk space
3. Verify the index doesn't already exist and conflicts with the naming scheme

### "Failed to connect to Elasticsearch" on Startup

**Problem**: Process shuts down immediately with connection error

**Solution**: This is by design - Elasticsearch must be available when the service starts. Ensure:
1. Elasticsearch is running before starting log-ship-elastic
2. Network connectivity is established
3. Firewall rules allow access to the Elasticsearch port

If you need automatic retry, use a systemd service with `Restart=always` (see above).

### Logs Not Appearing in Elasticsearch

**Problem**: Service is running but no logs appear in ES

**Solution**:
1. Verify the log file path is correct and readable by the service user
2. Check that new logs are being written to the file (tail it in real time)
3. Ensure the queue_id extraction is working (enable debug logging)
4. Verify Elasticsearch is receiving the data:
   ```bash
   curl "http://localhost:9200/logs-*/_search?pretty" | head -50
   ```

## Advanced Configuration

### Custom Timezone

Logs are parsed according to your system timezone. To use a specific timezone:

1. Set the `TZ` environment variable:
   ```bash
   TZ=America/New_York node server.js
   ```

2. Or configure it in your systemd service:
   ```ini
   [Service]
   Environment="TZ=America/New_York"
   ```

### Multiple Log Files

Currently, only one log file can be monitored per instance. For multiple log files, run multiple instances with different configuration files:

```bash
node server.js /etc/log-ship-elastic-postfix1.ini &
node server.js /etc/log-ship-elastic-postfix2.ini &
```

## Index Management

### Kibana Setup

To visualize logs in Kibana:

1. Open Kibana (usually http://localhost:5601)
2. Go to Stack Management → Index Patterns
3. Create index pattern: `logs-*`
4. Use `timestamp` as the time field
5. Create visualizations and dashboards

### Index Lifecycle Management

To automatically delete old indices, use Elasticsearch's Index Lifecycle Management (ILM):

```bash
curl -X PUT "localhost:9200/_ilm/policy/logs-policy" -H 'Content-Type: application/json' -d'{
  "policy": "logs-policy",
  "phases": {
    "hot": {
      "min_age": "0ms",
      "actions": {}
    },
    "delete": {
      "min_age": "30d",
      "actions": {
        "delete": {}
      }
    }
  }
}'
```

## See Also

- [Postfix Documentation](http://www.postfix.org/documentation.html)
- [Elasticsearch Documentation](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
- [log-ship-elastic-qpsmtpd](https://github.com/msimerson/log-ship-elastic-qpsmtpd) - Similar tool for qpsmtpd logs
