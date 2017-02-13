
# 1.0.0 - 2017-02-12

- renamed `_id` fields to `id`, for elasticsearch 5 compat
    - if you need ES < 5, use v0.9.5

# 0.9.7 - 2015-12-09

- improved config file selection and loading
- save to parent index (if defined and available)
- moved startReader() into new function
- when searching for doc matches, limit to time series indexes covering the date of the postfix docs read.
- WARNING: due to above, config file options have changed. You **MUST** update your config file!
    - `indices` option removed
    - `timeformat` added.
    - index names are automatically appended with `timeformat` suffix


# 0.9.6 - 2015-11-18

- honor the batchDelay setting


# 0.9.5 - 2015-11-16

- add support for postfix/postsuper entries
- enable node 4.2 testing


# 0.9.3 - 2015-10-02

- moved batch options into log reader
- permit a 0-second batch delay #gofast!
- make sure shutdown timer is longer than ES delay
- added watchdog
- empty pfdocs after commit failure

# 0.9.0 - 2015-08-06

