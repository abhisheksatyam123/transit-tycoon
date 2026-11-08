# File logger (OPFS)

Default **disabled**: existing `console.*` fallback behaviour is unchanged.
No sim behaviour changes while disabled.

## Enable

- URL: `?log=1[&logLevel=debug|info|warn|error][&logFile=NAME]`
- Console: `window.__ttLog.enable()` / `__ttLog.setLevel('debug')`

## Levels

`debug < info < warn < error`, plus `off`. `__ttLog.setLevel(l)` changes the
threshold; `__ttLog.disable()` turns the logger off entirely.

## Where files live

Origin Private File System: `<opfs>/logs/tt-YYYY-MM-DD.log` (one file per
day, or the `?logFile=` pinned name). Buffer flushes every 1 s, on tab hide
and `beforeunload`. Rotation keeps the newest 7 files when total size
exceeds 10 MiB.

## Usage

```js
__ttLog.status()      // {enabled, level, file, buffered, flushed, counters, store}
__ttLog.read()        // today's lines
__ttLog.tail(50)
__ttLog.list()        // stored files
__ttLog.clear({files:true})
__ttLog.download()
```

## Console behaviour

When enabled, wired warnings/errors go to the file only — nothing is
written to `console` by the logger. When disabled, the original
`console.warn`/`console.error` calls run as before.
